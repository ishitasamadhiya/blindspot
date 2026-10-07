#!/usr/bin/env bash
# Generates the narration clips from docs/video/narration.md and writes
# video/src/data/timing.json with each clip's length in seconds.
# Default engine: a Microsoft neural voice through Edge TTS (pip install edge-tts, needs network).
# Fallback: macOS `say`. Override with ENGINE=say|edge, VOICE=<name>, RATE (say wpm) / EDGE_RATE (+4%).
set -euo pipefail
cd "$(dirname "$0")/.."
ENGINE="${ENGINE:-}"
if [ -z "$ENGINE" ]; then
  if python3 -c "import edge_tts" 2>/dev/null; then ENGINE=edge; else ENGINE=say; fi
fi
VOICE="${VOICE:-}"
RATE="${RATE:-178}"
EDGE_RATE="${EDGE_RATE:-+4%}"
TEMPO="${TEMPO:-1.0}"
if [ -z "${FFMPEG:-}" ]; then
  if command -v ffmpeg >/dev/null; then FFMPEG=ffmpeg
  else
    COMP=$(ls -d ../node_modules/@remotion/compositor-*/ 2>/dev/null | head -1 || true)
    if [ -n "$COMP" ]; then FFMPEG="$COMP/ffmpeg"; export DYLD_LIBRARY_PATH="$COMP${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"; export LD_LIBRARY_PATH="$COMP${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"; fi
  fi
fi
if [ -z "${FFMPEG:-}" ]; then echo "ffmpeg not found (brew install ffmpeg, or run npm run video:render once so Remotion installs its compositor)"; exit 1; fi
mkdir -p public/audio
python3 - "$ENGINE" "$VOICE" "$RATE" "$EDGE_RATE" "$FFMPEG" "$TEMPO" <<'PY'
import re, subprocess, sys, json, os
engine, voice, rate, edge_rate, ffmpeg, tempo = sys.argv[1:7]
if not voice:
    voice = "en-US-AvaMultilingualNeural" if engine == "edge" else "Samantha"
rows = []
for line in open("../docs/video/narration.md"):
    m = re.match(r"\|\s*(\d+)\s*\|\s*([a-z0-9]+)\s*\|\s*(.+?)\s*\|\s*$", line)
    if m: rows.append((int(m.group(1)), m.group(2), m.group(3)))
timing = {}
for n, key, text in rows:
    raw = f"public/audio/{key}.raw"
    wav = f"public/audio/{key}.wav"
    if engine == "edge":
        raw += ".mp3"
        subprocess.run([sys.executable, "-m", "edge_tts", "--voice", voice, f"--rate={edge_rate}", "--text", text, "--write-media", raw], check=True, capture_output=True)
    else:
        raw += ".wav"
        subprocess.run(["say", "-v", voice, "-r", rate, "--file-format=WAVE", "--data-format=LEI16@22050", "-o", raw, text], check=True)
    af = f"atempo={tempo}," if float(tempo) != 1.0 else ""
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", raw, "-af", f"{af}loudnorm=I=-17:TP=-1.5:LRA=8", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav", wav], check=True)
    os.remove(raw)
    out = subprocess.run([ffmpeg, "-i", wav], capture_output=True, text=True).stderr
    d = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    secs = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3))
    timing[key] = {"index": n, "seconds": round(secs, 2), "file": f"audio/{key}.wav", "text": text, "voice": voice}
    print(f"{key:12s} {secs:5.1f}s")
os.makedirs("src/data", exist_ok=True)
json.dump(timing, open("src/data/timing.json", "w"), indent=1)
print(f"wrote src/data/timing.json ({engine}, {voice})")
PY
