"""Assemble ULPC character layers (downloaded from the Universal LPC generator repo)
into per-character spritesheets. Only layering, palette recolor with the
generator's own palette definitions, and frame placement are performed."""
import json, os, subprocess, sys
from PIL import Image

# usage : python3 compose_characters.py <clone ULPC> <dossier_sortie>
REPO = sys.argv[1] if __name__ == '__main__' else ''
OUT = sys.argv[2] if __name__ == '__main__' else ''
F = 64
ANIMS = {  # name: (cols, rows)
    'walk': (9, 4), 'slash': (6, 4), 'thrust': (8, 4), 'shoot': (13, 4), 'hurt': (6, 1),
}
PALS = {}
BASE = {'body': 'light', 'cloth': 'white', 'hair': 'orange'}

def ensure(path):
    full = os.path.join(REPO, path)
    if not os.path.exists(full):
        subprocess.run(['git', '-C', REPO, 'checkout', 'HEAD', '--', path], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return full if os.path.exists(full) else None

def recolor(im, src, dst):
    m = {tuple(int(a[i:i+2], 16) for i in (1, 3, 5)): tuple(int(b[i:i+2], 16) for i in (1, 3, 5)) for a, b in zip(src, dst)}
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in m:
                px[x, y] = m[(r, g, b)] + (a,)
    return im

def layer_img(pattern, anim, recol=None):
    # pattern contains {anim}
    p = pattern.format(anim=anim)
    full = ensure(p)
    if not full:
        return None
    im = Image.open(full).convert('RGBA')
    if recol:
        kind, target = recol.split(':')
        im = recolor(im, PALS[kind][BASE[kind]], PALS[kind][target])
    return im

def build(name, layers, anims):
    cols = max(ANIMS[a][0] for a in anims)
    rows = sum(ANIMS[a][1] for a in anims)
    sheet = Image.new('RGBA', (cols * F, rows * F), (0, 0, 0, 0))
    y0 = 0
    meta = {}
    for a in anims:
        c, r = ANIMS[a]
        canvas = Image.new('RGBA', (c * F, r * F), (0, 0, 0, 0))
        for pattern, recol in layers:
            im = layer_img(pattern, a, recol)
            if im is None:
                print('  missing', name, a, pattern)
                continue
            im = im.crop((0, 0, c * F, r * F))
            canvas.alpha_composite(im)
        sheet.alpha_composite(canvas, (0, y0))
        meta[a] = {'row': y0 // F, 'cols': c, 'rows': r}
        y0 += r * F
    sheet.save(os.path.join(OUT, f'{name}.png'))
    return meta

CHARS = {
    'player': ([
        ('spritesheets/body/bodies/male/{anim}.png', None),
        ('spritesheets/feet/shoes/basic/male/{anim}.png', 'cloth:black'),
        ('spritesheets/legs/pants/male/{anim}.png', 'cloth:brown'),
        ('spritesheets/torso/clothes/longsleeve/longsleeve2_buttoned/male/{anim}.png', 'cloth:forest'),
        ('spritesheets/head/heads/human/male/{anim}.png', None),
        ('spritesheets/hair/plain/adult/{anim}.png', 'hair:light_brown'),
    ], ['walk', 'slash', 'thrust', 'shoot', 'hurt']),
    'rodeur': ([
        ('spritesheets/body/bodies/zombie/{anim}/zombie.png', None),
        ('spritesheets/legs/pants/male/{anim}.png', 'cloth:bluegray'),
        ('spritesheets/torso/clothes/longsleeve/longsleeve2_buttoned/male/{anim}.png', 'cloth:tan'),
        ('spritesheets/head/heads/zombie/adult/{anim}.png', None),
    ], ['walk', 'slash', 'hurt']),
    'affame': ([
        ('spritesheets/body/bodies/zombie/{anim}/zombie.png', None),
        ('spritesheets/legs/pants/male/{anim}.png', 'cloth:maroon'),
        ('spritesheets/head/heads/zombie/adult/{anim}.png', None),
    ], ['walk', 'slash', 'hurt']),
    'brute': ([
        ('spritesheets/body/bodies/muscular/{anim}.png', 'body:zombie_green'),
        ('spritesheets/legs/pants/muscular/{anim}.png', 'cloth:charcoal'),
        ('spritesheets/head/heads/frankenstein/adult/{anim}.png', 'body:zombie_green'),
    ], ['walk', 'slash', 'hurt']),
}

if __name__ == '__main__':
    for k in ('body', 'cloth', 'hair'):
        PALS[k] = json.load(open(os.path.join(REPO, f'palette_definitions/{k}/{k}_ulpc.json')))
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[3:] or list(CHARS)
    allmeta = {}
    for n in only:
        layers, anims = CHARS[n]
        allmeta[n] = build(n, layers, anims)
        print(n, allmeta[n])
