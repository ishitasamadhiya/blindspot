# Blindspot — demo video narration

Target length: about 125 seconds. One line per scene; the voice-over is generated
from this file by `video/scripts/tts.sh` (a Microsoft neural voice through Edge TTS,
falling back to macOS `say`), and the scene lengths in the Remotion composition
follow the clip lengths in `video/src/data/timing.json`. Re-record with your own voice by replacing the
clips in `video/public/audio/` (same file names) and re-running the render.

| # | Scene | Narration |
|---|---|---|
| 1 | hook | Three weeks after go-live, Contoso's claim agent approved this claim for zero dollars. The eval said ninety-four percent, green. Both are true. If I joined Team Delta tomorrow, this is what I'd fix first. |
| 2 | works | What already works: an expert-graded golden set, replayed on every release. CI for agents. |
| 3 | signal | Then the customer's analysts start overriding one decision in four. The eval never moves. |
| 4 | hypothesis | So instead of asking if the agent is right: how much of this week's traffic has the eval actually seen? |
| 5 | measure | Embed every claim, calibrate on the golden set itself, measure. Fifty-four percent. |
| 6 | move1 | Move one: find what the eval has never seen. Uncovered claims cluster by content and name themselves: a new portal export, a promo type from after discovery, co-op claims with no invoice. |
| 7 | move2 | Move two: grade ten, not a thousand. Typical claims, random draws, and the cases the judge was unsure about. Judge agreement is measured per blind spot: not validated here, not trusted here. |
| 8 | move3 | Move three: block the release. Coverage above eighty-five, no blind spot below eighty, no regression outside a bootstrap interval. One command, one exit code, straight into CI. |
| 9 | stack | TypeScript end to end: React, Node and SQLite with checkpointed jobs, REST plus live events, tested math, optional Azure OpenAI. |
| 10 | before | Before: green dashboard, unhappy customer. |
| 11 | harvest | After: thirty cases graded in an afternoon. Golden set v2. |
| 12 | blocked | Release one-three on v2: eighty-seven point nine, zero on the portal cluster. Blocked, reason named. |
| 13 | fixed | A fourteen-line parser patch. Release one-four: ninety-four, plus six points, interval above zero, coverage above ninety. Pass. |
| 14 | control | A control: the next release moves one point, the interval includes zero, the gate stays green. No crying wolf. |
| 15 | whyme | I'm Ishita, EECS and Business at Berkeley M.E.T. I like finding messy product problems, figuring out what matters, and building the system that fixes them. |
| 16 | proof | MIT CSAIL: evaluation design for RAG in production. FrontDesk: a customer problem, from interviews to a shipped pipeline. Valency: benchmarking on bootstrap intervals. Holographic Studio: an idea that worked, plus its missing layer. |
| 17 | close | We don't ship agents we can't measure. Blindspot keeps the measurement about this week. I'd love to build the next one with Team Delta. |

## Timing plan (visual minimums, seconds)

hook 9 · works 6 · signal 5 · hypothesis 4.5 · measure 6 · move1 10 · move2 10 · move3 10 · stack 6 · before 3 · harvest 4 · blocked 6 · fixed 7 · control 6 · whyme 6 · proof 10 · close 7

A scene lasts the longer of its visual minimum and its narration clip plus 0.35 s.
