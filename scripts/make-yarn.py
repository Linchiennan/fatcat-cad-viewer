"""Draw the brown wool strand on top of the paw bar (src/assets/yarn.png).

Rendered at 3x: 1800 x 60 px = 600 x 20 CSS px, seamless left-right. Two twisted plies built from thousands of
fine fibres, shaded as round strands; a fuzzy halo of loose fibres sticks out of the edges (用戶 2026-10-27：要真實、要有毛邊).
Usage: python scripts/make-yarn.py   (needs Pillow and numpy; output is committed, the build does not run this)
"""
import math, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, SCALE = 1800, 60, 3
CY, R = H / 2, 11.5            # core centre and radius (px at 3x)
PITCH = 36                      # one twist of a ply, divides W so the strand tiles
SLANT = math.tan(math.radians(36))
rng = random.Random(20261027)

DARK = np.array([58, 32, 14], float)
MID = np.array([138, 88, 46], float)
LIGHT = np.array([206, 158, 102], float)


def shade(b):
    b = max(0.0, min(1.0, b))
    return (DARK + (MID - DARK) * b * 2) if b < 0.5 else (MID + (LIGHT - MID) * (b - 0.5) * 2)


# 1) the plies: per-pixel round-strand shading, ply grooves, fibre noise
core = np.zeros((H, W, 4), float)
# soft, low-frequency mottling (per-pixel noise looked like sand)
noise = np.array(Image.fromarray((np.array([[rng.random() for _ in range(W)] for _ in range(H)]) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2)), float) / 255
noise = (noise - noise.mean()) / (noise.std() + 1e-6) * 0.18 + 0.5
for y in range(H):
    v = (y - CY) / R
    if abs(v) > 1.25:
        continue
    cyl = math.sqrt(max(0.0, 1 - min(1.0, v * v)))            # light from above: brighter towards the top
    for x in range(W):
        u = ((x + v * R * SLANT) % (PITCH / 2)) / (PITCH / 2)   # two plies per pitch
        ply = math.sin(math.pi * u) ** 0.55                       # round ply, dark groove between plies
        b = 0.10 + 0.70 * ply * cyl + 0.16 * (1 - (v + 1) / 2) * cyl + (noise[y, x] - 0.5) * 0.25
        edge = 1.0 if abs(v) < 0.92 else max(0.0, 1 - (abs(v) - 0.92) / 0.33) * (0.55 + 0.45 * noise[y, x])
        core[y, x, :3] = shade(b)
        core[y, x, 3] = 255 * edge
img = Image.fromarray(core.clip(0, 255).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(0.6))

# 2) fibres along each ply (slanted with the twist) give the wool its texture
# (light, soft strands on their own layer: hard dark lines read as scribbles)
fib = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(fib, 'RGBA')
for _ in range(1400):
    x0, v = rng.uniform(0, W), rng.uniform(-0.9, 0.9)
    y0 = CY + v * R
    length = rng.uniform(5, 12)
    ang = math.atan2(-1, SLANT) + rng.uniform(-0.18, 0.18)
    dx, dy = math.cos(ang) * length, math.sin(ang) * length
    c = shade(rng.uniform(0.62, 1.0) * (0.55 + 0.45 * math.sqrt(max(0.0, 1 - v * v))))
    col = (int(c[0]), int(c[1]), int(c[2]), rng.randint(40, 85))
    for off in (-W, 0, W):
        draw.line([(x0 + off, y0), (x0 + dx + off, y0 + dy)], fill=col, width=1)
img = Image.alpha_composite(img, fib.filter(ImageFilter.GaussianBlur(0.45)))

# 3) the fuzz: loose fibres curling out of both edges, thin and light, some long
fuzz = Image.new('RGBA', (W, H), (0, 0, 0, 0))
fd = ImageDraw.Draw(fuzz, 'RGBA')
for _ in range(2600):
    side = rng.choice((-1, 1))
    x0 = rng.uniform(0, W)
    y0 = CY + side * R * rng.uniform(0.55, 1.0)
    length = rng.choice((rng.uniform(2, 6), rng.uniform(2, 6), rng.uniform(6, 15)))
    ang = side * math.pi / 2 + rng.uniform(-1.15, 1.15)        # outwards, fanned
    curl = rng.uniform(-0.35, 0.35)
    pts, x, y = [(x0, y0)], x0, y0
    for _s in range(4):
        x += math.cos(ang) * length / 4
        y += math.sin(ang) * length / 4
        ang += curl
        pts.append((x, y))
    tone = rng.uniform(0.55, 1.0)
    c = shade(tone)
    col = (int(c[0]), int(c[1]), int(c[2]), rng.randint(60, 170))
    for off in (-W, 0, W):
        fd.line([(px + off, py) for px, py in pts], fill=col, width=1)
fuzz = fuzz.filter(ImageFilter.GaussianBlur(0.35))
out = Image.alpha_composite(fuzz, img)
# a second, finer fuzz pass on top so some hairs cross the strand itself
top = Image.new('RGBA', (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(top, 'RGBA')
for _ in range(500):
    x0, y0 = rng.uniform(0, W), CY + rng.uniform(-R, R)
    ang = rng.uniform(0, 2 * math.pi)
    length = rng.uniform(3, 9)
    c = shade(rng.uniform(0.75, 1.0))
    for off in (-W, 0, W):
        td.line([(x0 + off, y0), (x0 + off + math.cos(ang) * length, y0 + math.sin(ang) * length)], fill=(int(c[0]), int(c[1]), int(c[2]), rng.randint(40, 110)), width=1)
out = Image.alpha_composite(out, top.filter(ImageFilter.GaussianBlur(0.25)))

dest = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'yarn.png'
dest.parent.mkdir(parents=True, exist_ok=True)
out.save(dest, optimize=True)
print(dest, dest.stat().st_size, 'bytes')
