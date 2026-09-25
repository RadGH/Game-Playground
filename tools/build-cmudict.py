#!/usr/bin/env python3
"""Compact the CMU pronouncing dictionary (cmusphinx/cmudict, BSD) into voice-lab/data/cmudict/cmudict.txt:
one 'word<TAB>ARPABET' line per word, first pronunciation only, lowercase, apostrophes kept, comments and variants dropped."""
import re, sys, os
src = sys.argv[1] if len(sys.argv) > 1 else '.scratch/cmu/cmudict.dict'
out = 'voice-lab/data/cmudict/cmudict.txt'
n = 0; seen = set()
with open(src, encoding='utf-8', errors='ignore') as f, open(out, 'w') as o:
    for line in f:
        line = line.split('#')[0].strip()
        if not line: continue
        word, phones = line.split(' ', 1)
        if '(' in word: continue                      # alternate pronunciations
        if not re.fullmatch(r"[a-z][a-z'.\-]*", word): continue
        if word in seen: continue
        seen.add(word); o.write(f"{word}\t{phones.strip()}\n"); n += 1
print(f"wrote {n} entries to {out} ({os.path.getsize(out)//1024} KB)")
