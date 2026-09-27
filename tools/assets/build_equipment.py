"""Construit l'atlas des équipements visibles (armes, outils, protections) à partir des
calques du Universal LPC Spritesheet Character Generator.

Opérations effectuées uniquement : découpage des cellules des calques d'origine, rognage de
la transparence, empaquetage dans un atlas. Aucune retouche de pixels, aucun dessin.

Chaque image est nommée « look|couche|anim|direction|colonne » où la colonne est l'image du
corps du personnage (même numérotation que public/assets/chars/player.png). La taille de la
cellule d'origine (64, 128 ou 192 px, centrée sur la cellule 64 px du corps) est conservée dans
« sourceSize » : le jeu aligne ainsi le calque exactement sur le personnage.

Usage : python3 tools/assets/build_equipment.py <clone ULPC> <dossier_sortie>
"""
import json
import os
import sys

from PIL import Image

REPO = sys.argv[1] if len(sys.argv) > 1 else ''
OUT = sys.argv[2] if len(sys.argv) > 2 else ''
S = 'spritesheets/'

# anim -> nombre de colonnes utiles (identique à la feuille du joueur)
COLS = {'walk': 9, 'slash': 6, 'thrust': 8, 'shoot': 13, 'hurt': 6, 'spellcast': 7}

# (look, couche, anim, fichier, taille de cellule, correspondance colonne source -> image du corps)
#  map = None : colonne source = image du corps ; 'rev6' : colonne j = image 5 - j (animation inversée)
LAYERS = [
    # Outils LPC « hand tools » (bluecarrot16, JaidynReiman, pvigier, reemax)
    ('axe', 'fg', 'walk', 'tools/axe/male/walk.png', 64, None),
    ('axe', 'bg', 'slash', 'tools/axe/bg.png', 128, None),
    ('axe', 'fg', 'slash', 'tools/axe/fg.png', 128, None),
    ('hammer', 'fg', 'walk', 'tools/hammer/male/walk.png', 64, None),
    ('hammer', 'bg', 'slash', 'tools/hammer/bg.png', 128, None),
    ('hammer', 'fg', 'slash', 'tools/hammer/fg.png', 128, None),
    ('pick', 'fg', 'walk', 'tools/pickaxe/male/walk.png', 64, None),
    ('pick', 'bg', 'slash', 'tools/pickaxe/bg.png', 128, None),
    ('pick', 'fg', 'slash', 'tools/pickaxe/fg.png', 128, None),
    # Lance (pvigier, wulax, Inboxninja) — bois (variante « spear »)
    ('spear', 'bg', 'walk', 'weapon/polearm/spear/background/walk/spear.png', 64, None),
    ('spear', 'fg', 'walk', 'weapon/polearm/spear/foreground/walk/spear.png', 64, None),
    ('spear', 'bg', 'thrust', 'weapon/polearm/spear/background/thrust/spear.png', 64, None),
    ('spear', 'fg', 'thrust', 'weapon/polearm/spear/foreground/thrust/spear.png', 64, None),
    # Épée d'armes (ElizaWy ; marche : JaidynReiman) — fer
    ('sword', 'bg', 'walk', 'weapon/sword/arming/universal/bg/walk/iron.png', 64, None),
    ('sword', 'fg', 'walk', 'weapon/sword/arming/universal/fg/walk/iron.png', 64, None),
    ('sword', 'bg', 'slash', 'weapon/sword/arming/attack_slash/bg/iron.png', 128, None),
    ('sword', 'fg', 'slash', 'weapon/sword/arming/attack_slash/fg/iron.png', 128, None),
    # Massue (bluecarrot16) : n'existe que pour la frappe
    ('club', 'bg', 'slash', 'weapon/blunt/club/background/club.png', 192, 'rev6'),
    ('club', 'fg', 'slash', 'weapon/blunt/club/club.png', 192, 'rev6'),
    # Arc (wulax, pvigier) et flèche (wulax)
    ('bow', 'bg', 'walk', 'weapon/ranged/bow/normal/walk/background/normal.png', 128, None),
    ('bow', 'fg', 'walk', 'weapon/ranged/bow/normal/walk/foreground/normal.png', 128, None),
    ('bow', 'bg', 'shoot', 'weapon/ranged/bow/normal/universal/background/shoot/normal.png', 64, None),
    ('bow', 'fg', 'shoot', 'weapon/ranged/bow/normal/universal/foreground/shoot/normal.png', 64, None),
    ('arrow', 'fg', 'shoot', 'weapon/ranged/bow/arrow/shoot/arrow.png', 64, None),
    # V2 — Dague (wulax, bluecarrot16) : marche, taille, estoc
    ('dagger', 'bg', 'walk', 'weapon/sword/dagger/behind/walk/dagger.png', 64, None),
    ('dagger', 'fg', 'walk', 'weapon/sword/dagger/walk/dagger.png', 64, None),
    ('dagger', 'bg', 'slash', 'weapon/sword/dagger/behind/slash/dagger.png', 64, None),
    ('dagger', 'fg', 'slash', 'weapon/sword/dagger/slash/dagger.png', 64, None),
    ('dagger', 'fg', 'thrust', 'weapon/sword/dagger/thrust/dagger.png', 64, None),
    # V2 — Épée longue (ElizaWy, JaidynReiman, bluecarrot16…)
    ('longsword', 'bg', 'walk', 'weapon/sword/longsword/universal_behind/walk/longsword.png', 64, None),
    ('longsword', 'fg', 'walk', 'weapon/sword/longsword/walk/longsword.png', 64, None),
    ('longsword', 'bg', 'slash', 'weapon/sword/longsword/attack_slash/behind/longsword.png', 192, None),
    ('longsword', 'fg', 'slash', 'weapon/sword/longsword/attack_slash/longsword.png', 192, None),
    ('longsword', 'bg', 'thrust', 'weapon/sword/longsword/attack_thrust/behind/longsword.png', 192, None),
    ('longsword', 'fg', 'thrust', 'weapon/sword/longsword/attack_thrust/longsword.png', 192, None),
    # V2 — Masse d'armes (wulax, bluecarrot16) et hache de guerre (BenCreating, bluecarrot16, castelonia)
    ('mace', 'bg', 'walk', 'weapon/blunt/mace/universal_behind/walk/mace.png', 64, None),
    ('mace', 'fg', 'walk', 'weapon/blunt/mace/walk/mace.png', 64, None),
    ('mace', 'bg', 'slash', 'weapon/blunt/mace/attack_slash/behind/mace.png', 192, None),
    ('mace', 'fg', 'slash', 'weapon/blunt/mace/attack_slash/mace.png', 192, None),
    ('waraxe', 'bg', 'walk', 'weapon/blunt/waraxe/behind/walk/waraxe.png', 64, None),
    ('waraxe', 'fg', 'walk', 'weapon/blunt/waraxe/walk/waraxe.png', 64, None),
    ('waraxe', 'bg', 'slash', 'weapon/blunt/waraxe/attack_slash/behind/waraxe.png', 192, None),
    ('waraxe', 'fg', 'slash', 'weapon/blunt/waraxe/attack_slash/waraxe.png', 192, None),
    # V2 — Arbalète (drjamgo, bluecarrot16 ; CC0) : marche et tir (pose d'estoc)
    ('crossbow', 'bg', 'walk', 'weapon/ranged/crossbow/background/walk/crossbow.png', 64, None),
    ('crossbow', 'fg', 'walk', 'weapon/ranged/crossbow/foreground/walk/crossbow.png', 64, None),
    ('crossbow', 'bg', 'thrust', 'weapon/ranged/crossbow/background/thrust/crossbow.png', 64, None),
    ('crossbow', 'fg', 'thrust', 'weapon/ranged/crossbow/foreground/thrust/crossbow.png', 64, None),
    # V2 — Bâton simple (Dr. Jamgo, bluecarrot16 ; CC0) : magie élémentaire (incantation)
    ('staff', 'bg', 'walk', 'weapon/magic/simple/background/walk/simple.png', 64, None),
    ('staff', 'fg', 'walk', 'weapon/magic/simple/foreground/walk/simple.png', 64, None),
    ('staff', 'bg', 'spellcast', 'weapon/magic/simple/background/spellcast/simple.png', 64, None),
    ('staff', 'fg', 'spellcast', 'weapon/magic/simple/foreground/spellcast/simple.png', 64, None),
    ('staff', 'bg', 'thrust', 'weapon/magic/simple/background/thrust/simple.png', 64, None),
    ('staff', 'fg', 'thrust', 'weapon/magic/simple/foreground/thrust/simple.png', 64, None),
    # V2 — Bâton noueux sombre (magie occulte)
    ('gnarled', 'bg', 'walk', 'weapon/magic/gnarled/universal/background/walk/dark.png', 64, None),
    ('gnarled', 'fg', 'walk', 'weapon/magic/gnarled/universal/foreground/walk/dark.png', 64, None),
    ('gnarled', 'bg', 'thrust', 'weapon/magic/gnarled/thrust/background/dark.png', 192, None),
    ('gnarled', 'fg', 'thrust', 'weapon/magic/gnarled/thrust/foreground/dark.png', 192, None),
    # V2 — Cotte de mailles (armure intermédiaire)
    *[('chainmail', 'body', a, f'torso/chainmail/male/{a}.png', 64, None) for a in COLS],
    # Protections (cuir : wulax, bluecarrot16, JaidynReiman ; plaques : Napsio, JaidynReiman, bluecarrot16, bigbeargames, wulax)
    *[('leather', 'body', a, f'torso/armour/leather/male/{a}.png', 64, None) for a in COLS],
    *[('plate', 'body', a, f'torso/armour/plate/male/{a}.png', 64, None) for a in COLS],
]


def load(path):
    full = os.path.join(REPO, S, path)
    if not os.path.exists(full):
        raise SystemExit(f'Calque manquant : {path}')
    return Image.open(full).convert('RGBA')


def main():
    frames = []  # (nom, image rognée, (dx, dy), taille)
    for look, layer, anim, path, size, mapping in LAYERS:
        im = load(path)
        rows = 1 if anim == 'hurt' else 4
        cell = size or im.height // rows
        cols = im.width // cell
        for d in range(rows):
            for j in range(min(cols, COLS[anim] if mapping is None else 6)):
                k = (5 - j) if mapping == 'rev6' else j
                if k >= COLS[anim]:
                    continue
                c = im.crop((j * cell, d * cell, (j + 1) * cell, (d + 1) * cell))
                bb = c.getbbox()
                if bb is None:
                    continue  # rien à dessiner pour cette image
                frames.append((f'{look}|{layer}|{anim}|{d}|{k}', c.crop(bb), (bb[0], bb[1]), cell))
    # Marche à l'arc : le pack ne fournit que 8 images sur 9 ; la 9e réutilise la 1re (sans retouche).
    names = {f[0] for f in frames}
    for f in list(frames):
        look, layer, anim, d, k = f[0].split('|')
        if look == 'bow' and anim == 'walk' and k == '0' and f'bow|{layer}|walk|{d}|8' not in names:
            frames.append((f'bow|{layer}|walk|{d}|8', f[1], f[2], f[3]))
    frames.sort(key=lambda t: -t[1].height)
    width = 2048
    x = y = shelf = 0
    pos = {}
    for name, im, _, _ in frames:
        if x + im.width > width:
            x = 0
            y += shelf + 1
            shelf = 0
        pos[name] = (x, y)
        x += im.width + 1
        shelf = max(shelf, im.height)
    height = y + shelf
    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    meta = {'frames': {}, 'meta': {'image': 'equip.png', 'size': {'w': width, 'h': height}, 'scale': '1'}}
    for name, im, (ox, oy), cell in frames:
        px, py = pos[name]
        atlas.alpha_composite(im, (px, py))
        meta['frames'][name] = {
            'frame': {'x': px, 'y': py, 'w': im.width, 'h': im.height},
            'rotated': False, 'trimmed': True,
            'spriteSourceSize': {'x': ox, 'y': oy, 'w': im.width, 'h': im.height},
            'sourceSize': {'w': cell, 'h': cell},
        }
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, 'equip.png'), optimize=True)
    with open(os.path.join(OUT, 'equip.json'), 'w') as fh:
        json.dump(meta, fh, separators=(',', ':'))
    print(len(frames), 'images', width, 'x', height)


if __name__ == '__main__':
    main()
