"""Extrait de CREDITS.csv (générateur ULPC) les lignes des fichiers réellement utilisés."""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from compose_characters import ANIMS, CHARS  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
used = set()
for layers, anims in CHARS.values():
    for pattern, _ in layers:
        for a in anims:
            used.add(pattern.format(anim=a).replace('spritesheets/', '', 1))
rows = []
with open(os.path.join(src, 'CREDITS.csv'), newline='') as fh:
    r = csv.reader(fh)
    header = next(r)
    for row in r:
        if row and row[0].strip() in used:
            rows.append([c.strip() for c in row])
with open(out, 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(header)
    w.writerows(sorted(rows))
missing = used - {r[0] for r in rows}
print(len(rows), 'lignes ; sans entrée :', sorted(missing))
