# Blindspot demo video narration

Two cuts share this file. `Demo` is the short cut: about one minute of who I am and
how I work, then thirty seconds of what I would do at Delta. `DemoFull` is the long
walkthrough of the prototype. Target lengths: 95 seconds and 125 seconds. One line per scene; the voice-over is generated
from this file by `video/scripts/tts.sh` (one warm, single-language Microsoft neural voice, en-US-AvaNeural, through Edge TTS,
falling back to macOS `say`), and the scene lengths in the Remotion composition
follow the clip lengths in `video/src/data/timing.json`. Re-record with your own voice by replacing the
clips in `video/public/audio/` (same file names) and re-running the render.

### Short cut (`Demo`)

| # | Scene | Narration | Voice |
|---|---|---|---|
| 1 | hi | Hi, I'm Ishi. EECS and Business at Berkeley M.E.T., two-time founder. Everywhere I go, I find the pain point nobody has measured, and I build the fix. |
| 2 | how | Start where the dashboard and the people disagree. Talk to whoever does the work. Measure what nobody measures. Build the smallest system that changes the decision, and ship it with proof. |
| 3 | frontdesk | At FrontDesk, the growth team found leads by hand. I shipped the one-click pipeline on durable workflows, and the whole sales team adopted it. Customer interviews became context cards on live calls. |
| 4 | valency | At Valency, I built the benchmarking program for personalized paper search: twenty-five experiments, an interval on every result. Six hundred thirty configurations, zero wins over the simplest baseline, so that's what I recommended. It's cited in a NeurIPS workshop paper. |
| 5 | csail | At MIT CSAIL, I lead deployment for RAG models across twelve health domains, and own retrieval and evaluation design: the monitoring that says it still works. |
| 6 | holo | When something already works, I build its missing layer: Holographic Studio, where your hands drive autotune, echo and volume. Notice, measure, build, ship. Here's what I'd do at Delta. |
| 7 | notice | Three weeks after go-live, Contoso's claim agent approved this claim for zero dollars. The eval said ninety-four percent, green. Both were true. |
| 8 | coverage | The golden set had seen fifty-four percent of that week's traffic. So I built Blindspot: coverage first, then the blind spots, named from the data. |
| 9 | moves | Grade ten cases per blind spot, not a thousand. Then gate the release: coverage above eighty-five, every blind spot above eighty, no regression outside the interval. |
| 10 | result | Release one-three: blocked, reason named. A fourteen-line patch: plus six points, interval above zero. Pass. I'd love to build the next one with Team Delta. |

### Long walkthrough (`DemoFull`)

Opens with the same `hi` scene, then:

| # | Scene | Narration | Voice |
|---|---|---|---|
| 2 | proof | At MIT CSAIL, evaluation design for RAG in production. At FrontDesk, a customer problem taken from interviews to a shipped pipeline. At Valency, benchmarking on bootstrap intervals. And Holographic Studio: an idea that already worked, plus its missing layer. |
| 3 | hook | Here's one. Three weeks after go-live, Contoso's claim agent approved this claim for zero dollars. The eval said ninety-four percent, green. Both are true. If I joined Team Delta tomorrow, this is what I'd fix first. |
| 4 | works | Delta's forward-deployed engineers embed with the customer. Every engagement starts with an expert-graded golden set, replayed on every release. CI for agents. |
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

Short cut: hi 9 · how 9 · frontdesk 10 · valency 10 · csail 7 · holo 9 · notice 8 · coverage 7 · moves 8 · result 9.

Long walkthrough: proof 11 · hook 10 · works 6 · signal 5.5 · hypothesis 5 · measure 6.5 · move1 10 · move2 10.5 · move3 10 · stack 7.5 · before 3.4 · harvest 4.2 · blocked 6.5 · fixed 8 · control 6 · close 8

A scene lasts the longer of its visual minimum and its narration clip plus 0.35 s.

## Spoken forms

Applied to the narration text before synthesis only; on-screen text is untouched. Edit the
right-hand column if a word still comes out wrong.

| written | spoken |
|---|---|
| Ishita Samadhiya | ee-shee-tha some-ah-dee-yah |
| Ishi | ee-shee |
| FrontDesk | Front Desk |
| NeurIPS | new-rips |
| Ishita | ee-shee-tha |
| Samadhiya | some-ah-dee-yah |
| M.E.T. | M E T |
| EECS | E E C S |
| CSAIL | C-sail |
| SQLite | sequel-lite |
| v2 | vee two |
| CI | C I |
| RAG | rag |
| Contoso | Con-toe-so |
| Valency | Vay-len-see |
