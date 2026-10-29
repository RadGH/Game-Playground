#!/usr/bin/env python3
"""Pack an AI-service character into ONE phone-ready GLB for Kestrel.

    python3 -I avatar-3d/kestrel/tools/pack-glb.py <character.glb> <out.glb> [--tex 1024] [--anim file.glb:name1,name2,...]...

* Keeps the character's meshes, skin, nodes and material; drops any animation it came with.
* Every --anim file is a GLB of the SAME rig (as Meshy's animation tasks return). Its clips are copied in (matched to
  the character's nodes BY NAME) and renamed, in order, to the names given after the colon; extra clips are dropped.
  Only the animation data is copied, never the anim file's own mesh or textures.
* Textures are resized to at most --tex pixels and re-encoded as JPEG (PNG kept only when the image has alpha).

Pure standard library + Pillow. Reads untrusted downloads as data only.
"""
import io, json, struct, sys

from PIL import Image


def read_glb(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF', path
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    bin_ = b''
    if off < len(b):
        ln = struct.unpack('<I', b[off:off + 4])[0]
        bin_ = b[off + 8: off + 8 + ln]
    return j, bin_


def view_bytes(j, bin_, vi):
    v = j['bufferViews'][vi]
    o = v.get('byteOffset', 0)
    return bin_[o:o + v['byteLength']]


def write_glb(path, j, chunks):
    out = bytearray()
    views = []
    for data in chunks:
        while len(out) % 4: out.append(0)
        views.append((len(out), len(data)))
        out += data
    while len(out) % 4: out.append(0)
    j['buffers'] = [{'byteLength': len(out)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
    return views


def main(argv):
    src, dst = argv[0], argv[1]
    tex = 1024
    anims = []
    i = 2
    while i < len(argv):
        if argv[i] == '--tex': tex = int(argv[i + 1]); i += 2
        elif argv[i] == '--anim':
            f, names = argv[i + 1].rsplit(':', 1); anims.append((f, names.split(','))); i += 2
        else: raise SystemExit('unknown arg ' + argv[i])

    j, bin_ = read_glb(src)
    # every buffer view becomes its own chunk; we rebuild offsets at the end
    chunks = [view_bytes(j, bin_, k) for k in range(len(j['bufferViews']))]
    for v in j['bufferViews']: v.pop('byteOffset', None); v['buffer'] = 0

    # textures: shrink + JPEG
    for img in j.get('images', []):
        if 'bufferView' not in img: continue
        im = Image.open(io.BytesIO(chunks[img['bufferView']]))
        im.load()
        if max(im.size) > tex: im = im.resize((tex, tex) if im.size[0] == im.size[1] else (min(tex, im.size[0]), min(tex, im.size[1])), Image.LANCZOS)
        buf = io.BytesIO()
        if im.mode in ('RGBA', 'LA') and im.getextrema()[-1][0] < 255:
            im.save(buf, 'PNG', optimize=True); img['mimeType'] = 'image/png'
        else:
            im.convert('RGB').save(buf, 'JPEG', quality=86, optimize=True); img['mimeType'] = 'image/jpeg'
        chunks[img['bufferView']] = buf.getvalue()
        j['bufferViews'][img['bufferView']]['byteLength'] = len(buf.getvalue())

    j['animations'] = []
    names = {n.get('name'): k for k, n in enumerate(j['nodes'])}
    for f, clipnames in anims:
        aj, abin = read_glb(f)
        for ci, a in enumerate(aj.get('animations', [])):
            if ci >= len(clipnames) or not clipnames[ci]: continue
            acc_map = {}

            def copy_acc(ai):
                if ai in acc_map: return acc_map[ai]
                acc = dict(aj['accessors'][ai])
                data = view_bytes(aj, abin, acc['bufferView'])
                v = dict(aj['bufferViews'][acc['bufferView']]); v.pop('byteOffset', None); v['buffer'] = 0; v['byteLength'] = len(data)
                v.pop('target', None)
                j['bufferViews'].append(v); chunks.append(data)
                acc['bufferView'] = len(j['bufferViews']) - 1
                j['accessors'].append(acc); acc_map[ai] = len(j['accessors']) - 1
                return acc_map[ai]

            samplers, channels = [], []
            for ch in a['channels']:
                node_name = aj['nodes'][ch['target']['node']].get('name')
                if node_name not in names: continue
                s = a['samplers'][ch['sampler']]
                samplers.append({'input': copy_acc(s['input']), 'output': copy_acc(s['output']), 'interpolation': s.get('interpolation', 'LINEAR')})
                channels.append({'sampler': len(samplers) - 1, 'target': {'node': names[node_name], 'path': ch['target']['path']}})
            j['animations'].append({'name': clipnames[ci], 'samplers': samplers, 'channels': channels})
        missing = [n for n in clipnames[len(aj.get('animations', [])):] if n]
        if missing: print(f'warning: {f} has fewer clips than names; missing {missing}', file=sys.stderr)
    if not j['animations']: j.pop('animations')

    views = write_glb(dst, j, chunks)
    for v, (o, ln) in zip(j['bufferViews'], views): v['byteOffset'] = o; v['byteLength'] = ln
    write_glb(dst, j, chunks)   # second pass with the real offsets in the JSON
    print(json.dumps({'out': dst, 'clips': [a['name'] for a in j.get('animations', [])], 'images': [im.get('mimeType') for im in j.get('images', [])]}))


if __name__ == '__main__':
    main(sys.argv[1:])
