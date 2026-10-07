# Blindspot — demo video narration

Target length: about 125 seconds. One line per scene; the voice-over is generated
from this file by `video/scripts/tts.sh` (a Microsoft neural voice through Edge TTS,
falling back to macOS `say`), and the scene lengths in the Remotion composition
follow the clip lengths in `video/src/data/timing.json`. Re-record with your own voice by replacing the
clips in `video/public/audio/` (same file names) and re-running the render.

| # | Scene | Narration |
|---|---|---|
| 1 | whyme | I'm Ishita Samadhiya, EECS and Business at Berkeley M.E.T. I like finding messy product problems, figuring out what actually matters, and building the system that fixes them. |
| 2 | proof | At MIT CSAIL, evaluation design for RAG in production. At FrontDesk, a customer problem taken from interviews to a shipped pipeline. At Valency, benchmarking on bootstrap intervals. And Holographic Studio: an idea that already worked, plus its missing layer. |
| 3 | hook | Here's one. Three weeks after go-live, Contoso's claim agent approved this claim for zero dollars. The eval said ninety-four percent, green. Both are true. If I joined Team Delta tomorrow, this is what I'd fix first. |
| 4 | works | What already works: an expert-graded golden set, replayed on every release. CI for agents. |
| 5 | signal | Then the customer's analysts start overriding one decision in four. The eval never moves. |
| 6 | hypothesis | So instead of asking if the agent is right: how much of this week's traffic has the eval actually seen? |
| 7 | measure | Embed every claim, calibrate on the golden set itself, measure. Fifty-four percent. |
| 8 | move1 | Move one: find what the eval has never seen. Uncovered claims cluster by content and name themselves: a new portal export, a promo type from after discovery, co-op claims with no invoice. |
| 9 | move2 | Move two: grade ten, not a thousand. Typical claims, random draws, and the cases the judge was unsure about. Judge agreement is measured per blind spot: not validated here, not trusted here. |
| 10 | move3 | Move three: block the release. Coverage above eighty-five, no blind spot below eighty, no regression outside a bootstrap interval. One command, one exit code, straight into CI. |
| 11 | stack | TypeScript end to end: React, Node and SQLite with checkpointed jobs, REST plus live events, tested math, optional Azure OpenAI. |
| 12 | before | Before: green dashboard, unhappy customer. |
| 13 | harvest | After: thirty cases graded in an afternoon. Golden set v2. |
| 14 | blocked | Release one-three on v2: eighty-seven point nine, zero on the portal cluster. Blocked, reason named. |
| 15 | fixed | A fourteen-line parser patch. Release one-four: ninety-four, plus six points, interval above zero, coverage above ninety. Pass. |
| 16 | control | A control: the next release moves one point, the interval includes zero, the gate stays green. No crying wolf. |
| 17 | close | We don't ship agents we can't measure. Blindspot keeps the measurement about this week. I'd love to build the next one with Team Delta. |

## Timing plan (visual minimums, seconds)

whyme 8 · proof 11 · hook 10 · works 6 · signal 5.5 · hypothesis 5 · measure 6.5 · move1 10 · move2 10.5 · move3 10 · stack 7.5 · before 3.4 · harvest 4.2 · blocked 6.5 · fixed 8 · control 6 · close 8

A scene lasts the longer of its visual minimum and its narration clip plus 0.35 s.
