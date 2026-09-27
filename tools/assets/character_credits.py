"""Extrait de CREDITS.csv (générateur ULPC) les lignes des fichiers réellement utilisés."""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from compose_characters import ANIMS, CHARS  # noqa: E402
from build_equipment import LAYERS as EQUIP_LAYERS  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
used = set()
for layers, anims in CHARS.values():
    for pattern, _ in layers:
        for a in anims:
            used.add(pattern.format(anim=a).replace('spritesheets/', '', 1))
# calques d'équipement (armes, outils, protections)
for _look, _layer, _anim, path, _size, _map in EQUIP_LAYERS:
    used.add(path)
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
# fichiers absents du CREDITS.csv : crédits des définitions de feuilles du générateur
# (sheet_definitions/*.json), en retenant l'entrée dont le chemin est le plus proche
import glob
import json
defs = []
for f in glob.glob(os.path.join(src, 'sheet_definitions', '**', '*.json'), recursive=True):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    for c in d.get('credits', []) if isinstance(d, dict) else []:
        if c.get('file'):
            defs.append(c)
have = {r[0] for r in rows}
for path in sorted(used - have):
    best = max((c for c in defs if path.startswith(c['file'].rstrip('/') + '/') or path.startswith(c['file'])), key=lambda c: len(c['file']), default=None)
    if best:
        rows.append([path, (best.get('notes') or '') + ' (crédits de la définition « ' + best['file'] + ' »)', ','.join(best['authors']), ','.join(best['licenses']), ','.join(best.get('urls', []))])
with open(out, 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(header)
    w.writerows(sorted(rows))
missing = used - {r[0] for r in rows}
print(len(rows), 'lignes ; sans entrée :', sorted(missing))
