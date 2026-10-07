"""Synthesises the demo video's sound design from scratch (no samples, no licences):
soft UI clicks, a whoosh, a stamp thud, a tick, a ping, a riser, and a quiet ambient bed.
Writes 44.1 kHz WAVs into public/audio/sfx/. Everything is deterministic."""
import math, os, struct, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "sfx")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def write(name, x, gain=1.0):
    x = np.asarray(x, dtype=np.float64) * gain
    peak = np.max(np.abs(x)) or 1.0
    if peak > 0.98: x = x / peak * 0.98
    pcm = (x * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(f"{name:14s} {len(x)/SR:5.2f}s")

def env(n, a, d, s=0.0, r=0.05, level=1.0):
    t = np.arange(n) / SR
    total = n / SR
    e = np.ones(n)
    e = np.where(t < a, t / max(a, 1e-6), e)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where(t >= total - r, s * (total - t) / max(r, 1e-6), np.where(t >= a + d, s, e))
    return np.clip(e, 0, 1) * level

def lowpass(x, cutoff):
    # one-pole IIR, applied twice for a gentler slope
    rc = 1 / (2 * math.pi * cutoff); dt = 1 / SR; a = dt / (rc + dt)
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc); y[i] = acc
    y2 = np.zeros_like(y); acc = 0.0
    for i in range(len(y)):
        acc += a * (y[i] - acc); y2[i] = acc
    return y2

def highpass(x, cutoff):
    return x - lowpass(x, cutoff)

def tone(freq, n, kind="sine", detune=0.0):
    t = np.arange(n) / SR
    if kind == "sine": return np.sin(2 * math.pi * freq * (1 + detune) * t)
    if kind == "tri": return 2 / math.pi * np.arcsin(np.sin(2 * math.pi * freq * t))
    if kind == "saw": return 2 * ((t * freq) % 1) - 1
    return np.sin(2 * math.pi * freq * t)

# click: 18 ms filtered noise burst with a tiny pitched body
n = int(0.06 * SR)
click = highpass(rng.normal(0, 1, n), 1800) * env(n, 0.001, 0.02, 0, 0.02) * 0.6 + tone(1400, n) * env(n, 0.001, 0.015, 0, 0.01) * 0.25
write("click.wav", click, 0.7)

# tick: shorter, higher
n = int(0.04 * SR)
tick = highpass(rng.normal(0, 1, n), 3000) * env(n, 0.0005, 0.012, 0, 0.01) * 0.5 + tone(2600, n) * env(n, 0.0005, 0.01, 0, 0.005) * 0.2
write("tick.wav", tick, 0.6)

# whoosh: band-passed noise with a rising then falling envelope
n = int(0.45 * SR)
noise = rng.normal(0, 1, n)
sweep = lowpass(highpass(noise, 300), 2600)
w_env = env(n, 0.18, 0.2, 0.0, 0.07)
write("whoosh.wav", sweep * w_env, 0.5)

# stamp: low thud + short noise slap
n = int(0.5 * SR)
t = np.arange(n) / SR
thud = np.sin(2 * math.pi * (70 * np.exp(-t * 6) + 42) * t) * env(n, 0.002, 0.25, 0, 0.1)
slap = lowpass(rng.normal(0, 1, n), 900) * env(n, 0.001, 0.04, 0, 0.02) * 0.6
write("stamp.wav", thud + slap, 0.9)

# ping: two sines, gentle decay (for PASS)
n = int(0.9 * SR)
ping = (tone(880, n) * 0.6 + tone(1320, n) * 0.3 + tone(1760, n) * 0.15) * env(n, 0.003, 0.7, 0, 0.1)
write("ping.wav", ping, 0.5)

# buzz: short low square-ish for BLOCKED
n = int(0.35 * SR)
buzz = (tone(110, n, "tri") * 0.7 + tone(165, n, "tri") * 0.3) * env(n, 0.005, 0.25, 0, 0.05)
write("buzz.wav", lowpass(buzz, 1200), 0.6)

# riser: 2.4 s filtered noise + rising sine, for the build-up before the reveal
n = int(2.4 * SR)
t = np.arange(n) / SR
riser = lowpass(highpass(rng.normal(0, 1, n), 200), 2400) * (t / t[-1]) ** 2.2 * 0.5 + np.sin(2 * math.pi * (120 + 240 * (t / t[-1])) * t) * (t / t[-1]) ** 2 * 0.25
write("riser.wav", riser * env(n, 0.05, 2.2, 0.9, 0.08), 0.5)

# ambient bed: 140 s of slow, soft chord pads (A minor-ish progression), heavily low-passed, no percussion
dur = 140.0
n = int(dur * SR)
t = np.arange(n) / SR
chords = [[55.0, 82.41, 110.0, 164.81, 220.0], [43.65, 65.41, 87.31, 130.81, 174.61], [49.0, 73.42, 98.0, 146.83, 196.0], [41.2, 61.74, 82.41, 123.47, 164.81]]
bar = 8.0
bed = np.zeros(n)
for ci in range(int(math.ceil(dur / bar))):
    chord = chords[ci % len(chords)]
    start = int(ci * bar * SR); end = min(n, int((ci + 1) * bar * SR) + int(1.5 * SR))
    m = end - start
    if m <= 0: continue
    seg = np.zeros(m)
    tt = np.arange(m) / SR
    for k, f in enumerate(chord):
        amp = 0.5 / (k + 1) ** 0.6
        seg += amp * (np.sin(2 * math.pi * f * tt) + 0.35 * np.sin(2 * math.pi * f * 1.003 * tt) + 0.12 * np.sin(2 * math.pi * f * 2 * tt))
    fade_in = np.clip(tt / 1.6, 0, 1); fade_out = np.clip((m / SR - tt) / 1.6, 0, 1)
    seg *= fade_in * fade_out
    bed[start:end] += seg
# slow amplitude breathing + global fades
bed *= 0.85 + 0.15 * np.sin(2 * math.pi * t / 23.0)
bed = lowpass(bed, 520)
bed *= np.clip(t / 3.0, 0, 1) * np.clip((dur - t) / 4.0, 0, 1)
write("bed.wav", bed, 0.9)
