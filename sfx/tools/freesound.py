#!/usr/bin/env python3
"""
Find and fetch CC0 recordings on freesound.org without an API key.

  search:  python3 sfx/tools/freesound.py search "rain on leaves" [--max 30] [--min 0.2] [--sort downloads|rating]
           prints: id  user  secs  downloads  rating  title
  fetch:   python3 sfx/tools/freesound.py fetch <id> <out.ogg> [--start S] [--len S] [--fade S] [--loop]
           downloads the high-quality preview (128 kbps mp3, same licence as the original) and turns it
           into a mono 44.1 kHz Ogg Vorbis file: trimmed of leading silence, cut to --len seconds,
           faded out (or, with --loop, cross-faded end into start so it loops without a click).
           Writes <out.ogg>.json beside it with the credit (title, author, url, licence).

Only searches with the "Creative Commons 0" filter, so everything it returns is public domain. The
credit JSON is still written, because sfx/tools/build-credits.mjs gathers every one of them into
sfx/data/credits.json and the credits page lists them (CC0 does not require it; we do it anyway).
"""
import sys, re, json, html, os, subprocess, urllib.request, urllib.parse, tempfile, argparse

UA = {'User-Agent': 'Mozilla/5.0 (playground sfx tool)'}
CACHE = os.environ.get('FS_CACHE', '/tmp/claude-1000/sfx-src/fs-cache')


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def search(q, sort='downloads', page=1, cc0=True):
    s = {'downloads': 'Downloads (most first)', 'rating': 'Rating (highest first)', 'score': 'Automatic by relevance'}[sort]
    params = {'q': q, 's': s, 'page': page}
    if cc0:
        params['f'] = 'license:"Creative Commons 0"'
    h = get('https://freesound.org/search/?' + urllib.parse.urlencode(params)).decode('utf8', 'replace')
    out = []
    for blk in re.findall(r'<div\s+class="bw-player"(.*?)tabindex', h, re.S):
        a = dict(re.findall(r'data-([a-z-]+)="([^"]*)"', blk))
        if 'sound-id' not in a:
            continue
        pos = h.find('data-sound-id="%s"' % a['sound-id'])
        m = re.search(r'Average rating of ([0-9.]+)', h[pos:pos + 6000])
        out.append({
            'id': int(a['sound-id']), 'user': a.get('username'), 'userId': a.get('user-id'),
            'title': html.unescape(a.get('title', '')), 'secs': float(a.get('duration', 0) or 0),
            'downloads': int(a.get('num-downloads', 0) or 0), 'rating': float(m.group(1)) if m else 0,
            'mp3': a.get('mp3', '').replace('-lq.mp3', '-hq.mp3'),
        })
    return out


def info(sid):
    """Look a sound up by id (its page), for the credit and the preview url."""
    h = get('https://freesound.org/s/%d/' % sid).decode('utf8', 'replace')
    lic = re.search(r'href="(https?://creativecommons.org/[^"]+)"', h)
    title = re.search(r'og:audio:title" content="([^"]*)"', h)
    user = re.search(r'og:audio:artist" content="([^"]*)"', h)
    mp3 = re.search(r'(https://cdn.freesound.org/previews/[^"]+-lq.mp3)', h)
    return {
        'id': sid, 'title': html.unescape(title.group(1)) if title else str(sid),
        'user': user.group(1) if user else '?',
        'licenseUrl': lic.group(1) if lic else '',
        'mp3': mp3.group(1).replace('-lq.mp3', '-hq.mp3') if mp3 else '',
        'url': 'https://freesound.org/people/%s/sounds/%d/' % (user.group(1) if user else 'x', sid),
    }


def license_name(url):
    if 'publicdomain/zero' in url: return 'CC0 1.0'
    m = re.search(r'licenses/([a-z-]+)/([0-9.]+)', url)
    return ('CC ' + m.group(1).upper() + ' ' + m.group(2)) if m else url


def fetch(sid, out, start=None, length=None, fade=0.15, loop=False, gain_db=0.0):
    os.makedirs(CACHE, exist_ok=True)
    meta = info(sid)
    src = os.path.join(CACHE, '%d.mp3' % sid)
    if not os.path.exists(src):
        open(src, 'wb').write(get(meta['mp3']))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    af = []
    if start is None:
        af.append('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01')
    if gain_db:
        af.append('volume=%gdB' % gain_db)
    args = ['ffmpeg', '-v', 'error', '-y']
    if start is not None:
        args += ['-ss', str(start)]
    args += ['-i', src]
    if length:
        args += ['-t', str(length + (fade if loop else 0))]
    if loop and length:
        # cross-fade the tail into the head: render the take long by `fade`, then let
        # acrossfade blend the last `fade` seconds with the first
        tmp = tempfile.mktemp(suffix='.wav', dir=CACHE)
        subprocess.run(args + ['-ac', '1', '-ar', '44100'] + (['-af', ','.join(af)] if af else []) + [tmp], check=True)
        head = tempfile.mktemp(suffix='.wav', dir=CACHE)
        body = tempfile.mktemp(suffix='.wav', dir=CACHE)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-t', str(fade), head], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ss', str(fade), body], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', body, '-i', head, '-filter_complex',
                        'acrossfade=d=%g:c1=qsin:c2=qsin' % fade, '-c:a', 'libvorbis', '-q:a', '4', out], check=True)
        for f in (tmp, head, body):
            os.remove(f)
    else:
        if length:
            af.append('afade=t=out:st=%g:d=%g' % (max(0, length - fade), fade))
        af.append('afade=t=in:d=0.004')
        subprocess.run(args + ['-ac', '1', '-ar', '44100', '-af', ','.join(af), '-c:a', 'libvorbis', '-q:a', '4', out], check=True)
    credit = {
        'source': 'freesound', 'id': sid, 'title': meta['title'], 'author': meta['user'],
        'url': meta['url'], 'license': license_name(meta['licenseUrl']), 'licenseUrl': meta['licenseUrl'],
    }
    json.dump(credit, open(out + '.json', 'w'), indent=1)
    return credit


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd')
    ap.add_argument('a')
    ap.add_argument('b', nargs='?')
    ap.add_argument('--max', type=int, default=25)
    ap.add_argument('--min', type=float, default=0)
    ap.add_argument('--maxsecs', type=float, default=1e9)
    ap.add_argument('--sort', default='downloads')
    ap.add_argument('--start', type=float)
    ap.add_argument('--len', type=float)
    ap.add_argument('--fade', type=float, default=0.15)
    ap.add_argument('--gain', type=float, default=0.0)
    ap.add_argument('--loop', action='store_true')
    o = ap.parse_args()
    if o.cmd == 'search':
        rs = [r for r in search(o.a, o.sort) if o.min <= r['secs'] <= o.maxsecs][:o.max]
        for r in rs:
            print('%7d  %-18s %6.1fs %7d  %.1f  %s' % (r['id'], r['user'][:18], r['secs'], r['downloads'], r['rating'], r['title'][:70]))
    elif o.cmd == 'fetch':
        c = fetch(int(o.a), o.b, o.start, o.len, o.fade, o.loop, o.gain)
        print(o.b, '<-', c['title'], 'by', c['author'], '(' + c['license'] + ')')
