"""Builds the speaking-avatar assets from the headshot.

Runs scripts/face.swift (Apple Vision: 76 face landmarks + person segmentation), then writes
  public/photo/cutout.png   the photo with the background removed (alpha from the person mask)
  src/data/face.json        a displacement grid (depth relief for the head) plus per-vertex
                            weights for the jaw (mouth opening), the mouth interior (darkened
                            while open) and the eyelids (blinks), all in photo-normalised units.
Both outputs are git-ignored; rerun this after replacing the headshot."""
import json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
photo = os.path.join(ROOT, "public", "photo", "headshot.jpeg")
tmp = tempfile.mkdtemp()
exe = os.path.join(tmp, "face")
subprocess.run(["swiftc", "-O", os.path.join(HERE, "face.swift"), "-o", exe], check=True)
subprocess.run([exe, photo, os.path.join(tmp, "lm.json"), os.path.join(tmp, "mask.pgm")], check=True)
lm = json.load(open(os.path.join(tmp, "lm.json")))
P = lambda k: np.array(lm[k], dtype=np.float64)

im = Image.open(photo).convert("RGB")
W, H = im.size
mask = Image.open(os.path.join(tmp, "mask.pgm")).convert("L").resize((W, H), Image.BILINEAR)
m = np.asarray(mask).astype(np.float32) / 255.0
# tighten and feather the matte
alpha = np.clip((m - 0.35) / 0.45, 0, 1)
alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255.0
rgba = np.dstack([np.asarray(im), (alpha * 255).astype(np.uint8)])
Image.fromarray(rgba, "RGBA").save(os.path.join(ROOT, "public", "photo", "cutout.png"))

# landmark-derived anchors (normalised image coords, y down)
contour, inner, outer = P("faceContour"), P("innerLips"), P("outerLips")
eyeL, eyeR = P("leftEye"), P("rightEye")
mouth = inner.mean(axis=0)
mouth_w = (outer[:, 0].max() - outer[:, 0].min()) / 2
mouth_h = outer[:, 1].max() - outer[:, 1].min()
chin = contour[:, 1].max()
eye_y = (eyeL[:, 1].mean() + eyeR[:, 1].mean()) / 2
face_cx = (contour[:, 0].max() + contour[:, 0].min()) / 2
face_a = (contour[:, 0].max() - contour[:, 0].min()) / 2 * 1.06
head_top = eye_y - (chin - eye_y) * 0.95
face_b = (chin - head_top) / 2
face_cy = (chin + head_top) / 2
nose = P("nose")
nose_tip = np.array([nose[:, 0].mean(), nose[:, 1].mean()])

N = 160
us = np.linspace(0, 1, N + 1)
U, V = np.meshgrid(us, us)  # V down the image
# depth relief
r2 = ((U - face_cx) / face_a) ** 2 + ((V - face_cy) / face_b) ** 2
bulge = np.sqrt(np.clip(1 - r2, 0, 1))
z = 0.20 * bulge
z += 0.045 * np.exp(-(((U - nose_tip[0]) ** 2 + (V - nose_tip[1]) ** 2) / (2 * 0.028 ** 2)))
for e in (eyeL, eyeR):  # shallow sockets
    c = e.mean(axis=0)
    z -= 0.02 * np.exp(-(((U - c[0]) ** 2 + ((V - c[1]) * 1.6) ** 2) / (2 * 0.03 ** 2)))
mask_grid = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((N + 1, N + 1), Image.BILINEAR)).astype(np.float32) / 255.0
outside = np.clip(np.sqrt(np.maximum(r2, 1)) - 1, 0, None) * min(face_a, face_b)
hair = 0.07 * np.exp(-outside / 0.06)
body = 0.03 + 0.05 * np.exp(-np.clip(V - chin, 0, None) / 0.1)
z = np.maximum(z, np.where(V > chin, body, hair)) * mask_grid
def gblur(a, sigma):
    k = np.arange(-int(3 * sigma), int(3 * sigma) + 1)
    g = np.exp(-(k ** 2) / (2 * sigma ** 2)); g /= g.sum()
    a = np.apply_along_axis(lambda r: np.convolve(np.pad(r, len(k) // 2, mode="edge"), g, mode="valid"), 0, a)
    return np.apply_along_axis(lambda r: np.convolve(np.pad(r, len(k) // 2, mode="edge"), g, mode="valid"), 1, a)
z = gblur(z, 1.4)

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

# jaw: everything below the lip line drops, fading out on the cheeks and under the chin
wx = np.clip(1 - ((U - mouth[0]) / (mouth_w * 2.1)) ** 2, 0, 1) ** 1.3
wy = smoothstep(mouth[1] - mouth_h * 0.12, mouth[1] + mouth_h * 0.45, V) * (1 - smoothstep(chin + mouth_h * 0.5, chin + mouth_h * 2.4, V))
jaw = wx * wy
# mouth interior: the band that stretches open gets darkened
band = np.exp(-(((V - (mouth[1] + mouth_h * 0.16)) / (mouth_h * 0.3)) ** 2))
innerw = band * np.clip(1 - ((U - mouth[0]) / (mouth_w * 1.0)) ** 2, 0, 1)
# blinks: squash each eye region towards its lower lid
blink = np.zeros_like(U); target = np.zeros_like(U)
for e in (eyeL, eyeR):
    c = e.mean(axis=0)
    ew = (e[:, 0].max() - e[:, 0].min()) / 2
    eh = max((e[:, 1].max() - e[:, 1].min()) / 2, ew * 0.35)
    w = np.clip(1 - ((U - c[0]) / (ew * 1.45)) ** 2, 0, 1) * np.clip(1 - ((V - c[1]) / (eh * 2.6)) ** 2, 0, 1)
    blink = np.maximum(blink, w)
    target = np.where(w > 0, c[1] + eh * 0.45, target)

r = lambda a, d=4: [round(float(x), d) for x in a.ravel()]
out = {
    "n": N,
    "z": r(z), "jaw": r(jaw, 3), "inner": r(innerw, 3), "blink": r(blink, 3), "blinkTarget": r(target, 4),
    "anchors": {"mouth": mouth.tolist(), "mouthWidth": float(mouth_w), "mouthHeight": float(mouth_h), "chin": float(chin), "eyeY": float(eye_y),
                "faceCenter": [float(face_cx), float(face_cy)], "faceAxes": [float(face_a), float(face_b)], "noseTip": nose_tip.tolist(),
                "eyes": [eyeL.mean(axis=0).tolist(), eyeR.mean(axis=0).tolist()]},
}
os.makedirs(os.path.join(ROOT, "src", "data"), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, "src", "data", "face.json"), "w"), separators=(",", ":"))
# previews for a quick visual check
prev = os.environ.get("FACE_PREVIEW")
if prev:
    os.makedirs(prev, exist_ok=True)
    Image.fromarray((z / z.max() * 255).astype(np.uint8)).resize((400, 400)).save(os.path.join(prev, "depth.png"))
    Image.fromarray((np.clip(jaw + innerw * 0.5 + blink * 0.6, 0, 1) * 255).astype(np.uint8)).resize((400, 400)).save(os.path.join(prev, "weights.png"))
print(f"mouth {mouth.round(3)} w {mouth_w:.3f} h {mouth_h:.3f} chin {chin:.3f} eyeY {eye_y:.3f} head ellipse c=({face_cx:.3f},{face_cy:.3f}) a={face_a:.3f} b={face_b:.3f}")
print("jaw verts", int((jaw > 0.01).sum()), "blink verts", int((blink > 0.01).sum()), "z max", float(z.max()))
