#!/usr/bin/env bash
# Kestrel (opus) — every hand-in screenshot, against the DEV server (8401). One browser at a time.
#   bash avatar-3d/kestrel/opus2/tools/shots.sh
set -e
ROOT=/home/radgh/claude/playground
OUT=$ROOT/avatar-3d/kestrel/opus2/shots
T=$ROOT/avatar-3d/kestrel/opus2/tools
TMP=$(mktemp -d)
mkdir -p "$OUT"
for B in male female; do
  W=683 H=1024 node $T/shot.mjs "$OUT" \
    $B-front="body=$B&t=0.5" $B-left="body=$B&view=left&t=0.5" $B-back="body=$B&view=back&t=0.5" \
    $B-right="body=$B&view=right&t=0.5" $B-three-quarter="body=$B&view=three&t=0.5" \
    $B-outfit-front="body=$B&t=0.5&outfit=1" $B-outfit-back="body=$B&view=back&t=0.5&outfit=1" $B-lod1="body=$B&t=0.5&lod=1"
  W=768 H=768 node $T/shot.mjs "$OUT" $B-face="body=$B&view=head&t=0.5"
  W=512 H=512 node $T/shot.mjs "$TMP" h1="body=$B&view=head&t=0.5" h2="body=$B&view=headL&t=0.5" h3="body=$B&view=headB&t=0.5" h4="body=$B&view=head3&t=0.5"
  python3 $T/sheet.py "$OUT/$B-head.png" 4 "" $TMP/h1.png front $TMP/h2.png left $TMP/h3.png back $TMP/h4.png "3/4"
  W=420 H=420 node $T/shot.mjs "$TMP" e1="body=$B&view=head&t=0.5&expr=neutral" e2="body=$B&view=head&t=0.5&expr=happy" e3="body=$B&view=head&t=0.5&expr=sad" \
    e4="body=$B&view=head&t=0.5&expr=angry" e5="body=$B&view=head&t=0.5&expr=surprised" e6="body=$B&view=head&t=0.5&expr=confused"
  python3 $T/sheet.py "$OUT/$B-expressions.png" 3 "" $TMP/e1.png neutral $TMP/e2.png happy $TMP/e3.png sad $TMP/e4.png angry $TMP/e5.png surprised $TMP/e6.png confused
  W=400 H=600 node $T/shot.mjs "$TMP" p1="body=$B&anim=idle&view=three&t=0.5" p2="body=$B&anim=walk&view=three&t=0.02" p3="body=$B&anim=run&view=three&t=0.05" \
    p4="body=$B&anim=sprint&view=three&t=0.04" p5="body=$B&anim=jump&view=three&t=0.55" p6="body=$B&anim=crouch&view=three&t=0.5" \
    p7="body=$B&anim=attack&view=three&t=0.42" p8="body=$B&anim=aim&view=three&t=0.5" p9="body=$B&anim=interact&view=three&t=0.6" \
    p10="body=$B&anim=cast&view=three&t=0.7" p11="body=$B&anim=wave&view=three&t=0.8" p12="body=$B&anim=guard&view=three&t=0.5" \
    p13="body=$B&anim=ready&view=three&t=0.4" p14="body=$B&anim=hit&view=three&t=0.12" p15="body=$B&anim=talk&view=three&t=0.9" p16="body=$B&anim=dead&view=three&t=1.3"
  python3 $T/sheet.py "$OUT/$B-poses.png" 8 "" $TMP/p1.png idle $TMP/p2.png walk $TMP/p3.png run $TMP/p4.png sprint $TMP/p5.png jump $TMP/p6.png crouch $TMP/p7.png "attack (melee)" $TMP/p8.png "aim (ranged)" \
    $TMP/p9.png interact $TMP/p10.png cast $TMP/p11.png wave $TMP/p12.png guard $TMP/p13.png ready $TMP/p14.png hit $TMP/p15.png talk $TMP/p16.png dead
done
rm -rf "$TMP"
ls -1 "$OUT"
