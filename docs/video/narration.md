# Blindspot — demo video narration

Target length: about 120 seconds. One line per scene; the scratch voice-over
is generated from this file by `video/scripts/tts.sh` (macOS `say`), and the
scene lengths in the Remotion composition follow the clip lengths in
`video/src/data/timing.json`. Re-record with your own voice by replacing the
clips in `video/public/audio/` (same file names) and re-running the render.

| # | Scene | Narration |
|---|---|---|
| 1 | hook | This claim was approved for the wrong amount. This eval says ninety-four percent, green. Both are true. If I joined Team Delta tomorrow, this is the first thing I'd want to fix. |
| 2 | works | What already works: a golden set, expert-graded, replayed on every release. CI for agents. |
| 3 | signal | Three weeks in, Contoso's analysts override one decision in four. The eval never moved. |
| 4 | hypothesis | So, a different question: how much of this week's traffic has the eval actually seen? |
| 5 | measure | Embed every claim, calibrate on the golden set itself, measure. Fifty-four percent. |
| 6 | move1 | Move one: find what the eval has never seen. Uncovered claims cluster by content and name themselves: a new portal export, a new promo type, co-op claims without an invoice. |
| 7 | move2 | Move two: grade ten, not a thousand. Typical claims, random draws, and the cases the judge was unsure about. Judge agreement is measured per blind spot. |
| 8 | move3 | Move three: block the release. Coverage above eighty-five, no blind spot below eighty, no regression outside a paired-bootstrap interval. A CLI with an exit code. |
| 9 | stack | TypeScript end to end: React, Node and SQLite with checkpointed jobs, REST plus live events, tested math, optional Azure OpenAI. |
| 10 | before | Before: green dashboard, unhappy customer. |
| 11 | harvest | After: thirty cases graded. Golden set v2. |
| 12 | blocked | Release one-three on v2: eighty-seven point seven, zero on the portal cluster. Blocked, with the reason named. |
| 13 | fixed | A fourteen-line parser patch. Release one-four: ninety-three point seven, plus six points, coverage above ninety. Pass. |
| 14 | control | A control: the next release moves one point, the interval includes zero, the gate stays green. |
| 15 | whyme | I'm Ishita, EECS and Business at Berkeley M.E.T. I like finding messy product problems, figuring out what matters, and building the system that fixes them. |
| 16 | proof | MIT CSAIL: evaluation design for RAG in production. FrontDesk: a customer problem taken from interviews to a shipped pipeline. Valency: benchmarking on bootstrap intervals. Holographic Studio: an idea that already worked, plus its missing layer. |
| 17 | close | We don't ship agents we can't measure. Blindspot keeps the measurement about this week. I'd love to build the next one with Team Delta. |

## Timing plan (visual minimums, seconds)

hook 9 · works 6 · signal 5 · hypothesis 4.5 · measure 6 · move1 10 · move2 10 · move3 10 · stack 6 · before 3 · harvest 4 · blocked 6 · fixed 7 · control 6 · whyme 6 · proof 10 · close 7

A scene lasts the longer of its visual minimum and its narration clip plus 0.35 s.
