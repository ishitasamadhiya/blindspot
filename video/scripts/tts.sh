#!/usr/bin/env bash
# Generates scratch narration clips from docs/video/narration.md with macOS `say`
# and writes video/src/data/timing.json with each clip's length in seconds.
set -euo pipefail
cd "$(dirname "$0")/.."
VOICE="${VOICE:-Samantha}"
RATE="${RATE:-178}"
TEMPO="${TEMPO:-1.12}"
# ffmpeg: use one on PATH, else the copy Remotion's compositor ships (needs its dylib directory on the library path).
if [ -z "${FFMPEG:-}" ]; then
  if command -v ffmpeg >/dev/null; then FFMPEG=ffmpeg
  else
    COMP=$(ls -d ../node_modules/@remotion/compositor-*/ 2>/dev/null | head -1 || true)
    if [ -n "$COMP" ]; then FFMPEG="$COMP/ffmpeg"; export DYLD_LIBRARY_PATH="$COMP${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"; export LD_LIBRARY_PATH="$COMP${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"; fi
  fi
fi
if [ -z "${FFMPEG:-}" ]; then echo "ffmpeg not found (brew install ffmpeg, or run an npm run video:render once so Remotion installs its compositor)"; exit 1; fi
mkdir -p public/audio
python3 - "$VOICE" "$RATE" "$FFMPEG" "$TEMPO" <<'PY'
import re, subprocess, sys, json, os
voice, rate, ffmpeg, tempo = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
rows = []
for line in open("../docs/video/narration.md"):
    m = re.match(r"\|\s*(\d+)\s*\|\s*([a-z0-9]+)\s*\|\s*(.+?)\s*\|\s*$", line)
    if m: rows.append((int(m.group(1)), m.group(2), m.group(3)))
timing = {}
for n, key, text in rows:
    raw = f"public/audio/{key}.raw.wav"
    wav = f"public/audio/{key}.wav"
    subprocess.run(["say", "-v", voice, "-r", rate, "--file-format=WAVE", "--data-format=LEI16@22050", "-o", raw, text], check=True)
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", raw, "-af", f"atempo={tempo},loudnorm=I=-18:TP=-2:LRA=9", "-ar", "44100", "-c:a", "pcm_s16le", "-f", "wav", wav], check=True)
    os.remove(raw)
    out = subprocess.run([ffmpeg, "-i", wav], capture_output=True, text=True).stderr
    d = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    secs = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3))
    timing[key] = {"index": n, "seconds": round(secs, 2), "file": f"audio/{key}.wav", "text": text}
    print(f"{key:12s} {secs:5.1f}s")
os.makedirs("src/data", exist_ok=True)
json.dump(timing, open("src/data/timing.json", "w"), indent=1)
print("wrote src/data/timing.json")
PY
