"""Petit outil de dessin des cartes ASCII (aide à la conception ; la carte finale est le texte
ASCII copié dans src/maps/*.ts, qui reste la référence).

Usage : voir draw_maps.py. Aperçu PNG : preview(canvas, 'sortie.png').
"""
import random

from PIL import Image, ImageDraw

COLORS = {
    '.': (86, 128, 62), ',': (138, 108, 70), ':': (130, 130, 130), '_': (150, 110, 70),
    '~': (40, 90, 150), '=': (170, 130, 80), '#': (60, 50, 60),
    'T': (30, 70, 30), 't': (80, 60, 40), '*': (50, 100, 50), '"': (120, 170, 80),
    'b': (90, 60, 140), 'm': (200, 170, 120), 'h': (110, 200, 110), 'k': (20, 40, 20), 'g': (220, 220, 190),
    'r': (150, 150, 150), 'R': (120, 120, 120), 'o': (190, 120, 90), 'c': (40, 40, 40), 'x': (120, 230, 200),
    'f': (230, 200, 90), 'p': (170, 160, 150), 's': (230, 230, 230), 'j': (70, 140, 90), 'w': (200, 200, 220),
}


class Canvas:
    def __init__(self, w, h, fill='.', seed=1):
        self.w, self.h = w, h
        self.g = [[fill] * w for _ in range(h)]
        self.r = random.Random(seed)

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.g[y][x]
        return None

    def set(self, x, y, ch):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = ch

    def rect(self, x, y, w, h, ch):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, ch)

    def frame(self, x, y, w, h, ch, t=1):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if xx < x + t or xx >= x + w - t or yy < y + t or yy >= y + h - t:
                    self.set(xx, yy, ch)

    def disc(self, cx, cy, r, ch, only=None):
        for yy in range(int(cy - r) - 1, int(cy + r) + 2):
            for xx in range(int(cx - r) - 1, int(cx + r) + 2):
                if (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r and (only is None or self.get(xx, yy) in only):
                    self.set(xx, yy, ch)

    def path(self, pts, ch, width=1, only=None):
        """Chemin polyligne (largeur en tuiles)."""
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(abs(x1 - x0), abs(y1 - y0)) * 2 + 1
            for i in range(n + 1):
                x = x0 + (x1 - x0) * i / n
                y = y0 + (y1 - y0) * i / n
                self.disc(x, y, width / 2, ch, only)

    def put(self, x, y, s):
        for i, ch in enumerate(s):
            if ch != ' ':
                self.set(x + i, y, ch)

    def block(self, x, y, lines):
        for j, line in enumerate(lines):
            self.put(x, y + j, line)

    def scatter(self, ch, x, y, w, h, density, on=('.',), clear=0):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if self.get(xx, yy) in on and self.r.random() < density:
                    if clear and not self.clear_around(xx, yy, clear, on):
                        continue
                    self.set(xx, yy, ch)

    def clear_around(self, x, y, r, on):
        for yy in range(y - r, y + r + 1):
            for xx in range(x - r, x + r + 1):
                if self.get(xx, yy) not in on and self.get(xx, yy) is not None:
                    return False
        return True

    def border(self, ch, t=2, jag=0.5):
        for y in range(self.h):
            for x in range(self.w):
                d = min(x, y, self.w - 1 - x, self.h - 1 - y)
                if d < t or (d == t and self.r.random() < jag):
                    self.set(x, y, ch)

    def text(self):
        return [''.join(r) for r in self.g]


def preview(c, out, scale=8, legend_colors=None):
    im = Image.new('RGB', (c.w * scale, c.h * scale), (0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(c.h):
        for x in range(c.w):
            ch = c.g[y][x]
            col = COLORS.get(ch) or (legend_colors or {}).get(ch) or (255, 0, 255)
            d.rectangle([x * scale, y * scale, x * scale + scale - 1, y * scale + scale - 1], fill=col)
            if ch not in COLORS:
                d.text((x * scale + 1, y * scale - 2), ch, fill=(255, 255, 255))
    im.save(out)
