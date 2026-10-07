"""Turns the headshot into a 3-D particle portrait: one point per sampled pixel, coloured by the
pixel, with depth from luminance (a shallow relief), plus a scattered start position per point
so the portrait can assemble on screen. Writes src/data/portrait.json."""
import json, os, random
from PIL import Image, ImageFilter
import numpy as np

HERE = os.path.dirname(__file__)
src = os.path.join(HERE, "..", "public", "photo", "headshot.jpeg")
N = 128  # grid resolution per side
im = Image.open(src).convert("RGB").resize((N, N), Image.LANCZOS)
blur = im.filter(ImageFilter.GaussianBlur(1.2))
px = np.asarray(im).astype(np.float32) / 255.0
lum = np.asarray(blur.convert("L")).astype(np.float32) / 255.0
rng = random.Random(7)
pos, col, start = [], [], []
cx, cy, r = N / 2, N / 2, N / 2 - 1
for y in range(N):
    for x in range(N):
        dx, dy = x - cx + 0.5, y - cy + 0.5
        d = (dx * dx + dy * dy) ** 0.5
        if d > r:
            continue
        px3 = px[y, x]
        X = dx / (N / 2)
        Y = -dy / (N / 2)
        edge = max(0.0, 1 - (d / r) ** 6)          # flatten the rim so the disc reads as a coin
        Z = (lum[y, x] - 0.5) * 0.22 * edge          # bright = towards camera
        pos += [round(float(X), 4), round(float(Y), 4), round(float(Z), 4)]
        col += [round(float(px3[0]), 3), round(float(px3[1]), 3), round(float(px3[2]), 3)]
        # start scattered in a loose sphere
        u, v, w = rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)
        start += [round(u * 2.6, 3), round(v * 2.0, 3), round(w * 2.4 - 1.0, 3)]
json.dump({"n": len(pos) // 3, "pos": pos, "col": col, "start": start}, open(os.path.join(HERE, "..", "src", "data", "portrait.json"), "w"))
print("points", len(pos) // 3)
