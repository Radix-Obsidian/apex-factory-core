# 0007 — We killed the model mid-answer, and the answer survived

**Date:** 2026-06-13

## What happened
Two entries ago ([0006](0006-we-made-the-security-provably-real.md)) we refused to claim H\RNESS's headline feature worked, because the test that proves it didn't exist yet. Now it does. We made a real AI provider die in the middle of writing an answer; H\RNESS caught the fall, switched to a *different* provider carrying the half-finished answer, and the reader got one complete, well-formed response with no visible seam — one beginning, both halves, one ending. The word "failover" is earned. (Whether the two halves *read* smoothly together is a separate, not-yet-measured question — see the bottom of this entry.)

## The story

H\RNESS exists to do one hard thing: when the AI model your agent depends on fails *mid-answer*, finish the answer on a backup model so the user never notices. In [0006](0006-we-made-the-security-provably-real.md) we said that feature was "promised, not proven" and drew a line: the log only celebrates it once a test kills the main model mid-sentence and the answer survives. This is that test.

Here's the honest hard part, in plain terms. **You cannot resume another model's exact thought.** If Anthropic's model wrote "The capital of France is" and then dies, OpenAI's model can't pick up its internal state. So H\RNESS does the only honest thing that works: it takes everything written so far and hands it to the backup model as the start of *its* answer, saying in effect "you wrote this, keep going." The backup continues — " Paris." — and H\RNESS stitches the two halves into a single stream. Structurally, the reader sees one beginning and one continuous answer with no break where the swap happened. (Whether the two halves *read* naturally together — that's a separate question we haven't measured yet; more in "Good & bad.")

One real engineering correction came out of building it. Our own plan said to "trim the half-finished text to a clean sentence before handing it over." We tried it and realized it was wrong: because we stream words to the reader *as they arrive*, by the time the first model dies the reader has **already seen** "The capital of France is." If we trimmed that before handing it to the backup, the backup would regenerate the trimmed part — and the reader would see "...France is" followed by "...France is Paris," a stutter. So the handoff must contain *exactly* what the reader already saw, no trimming. We corrected our own plan because the streaming reality contradicted it. (Honest record: that's the kind of thing you only catch by building it, not by planning it.)

The proof is an automated test that uses **real network streaming**, not a toy. It stands up two fake-but-real servers: a stand-in Anthropic that streams a partial answer then drops the connection, and a stand-in OpenAI that returns the continuation. H\RNESS talks to both over real HTTP, exactly as it would talk to the live providers.

## The numbers

- **The structural seam is invisible, measured exactly:** across the swap, the reader's stream contains **exactly 1** "message start" event (not 2), both halves of the answer ("The capital of France is" + "Paris"), and **exactly 1** clean ending. Asserted, not eyeballed.
- **The handoff is verified:** the backup server provably received the partial answer as a "you wrote this, continue" message — the test inspects the actual request body the fallback got.
- **Three failure modes proven:** (1) the main model dies *mid-answer* → seamed continuation; (2) it won't even start → H\RNESS fails over *fresh* before any bytes commit, so a clean error is still possible instead of a half-broken response; (3) it *stalls* (goes silent mid-answer) → a watchdog timer trips and seams in the fallback.
- **Tests: 64 → 80** automated tests passing (16 added: the failover engine, the answer-accumulator, the seam, the stream-event layer, and 2 real-network integration tests — including a virtual-time test proving a *stalled* upstream trips the watchdog and fails over). `cargo test` reproduces it.
- **5 of 6** build steps done. **0** clippy/formatting warnings.
- **$0 incremental** — built on our existing AI plan; the test needs no live API keys (it talks to local stand-ins).

## The lesson

**The gap between "promised" and "proven" is exactly one test that actually kills the thing.** It is easy to demo a happy path and call a feature done. The honest bar is higher: don't claim the headline until something real fails in the exact way it'll fail in production and the product survives anyway. We held that line across three entries — caught the fake ([0005](0005-we-caught-our-own-flagship-faking-it.md)), made the foundation real but withheld the headline ([0006](0006-we-made-the-security-provably-real.md)), and only now, with a real upstream dying mid-stream and the answer living, do we say it works.

## Good & bad

**Good:** The differentiator works, proven over real HTTP streaming, with the invisibility *measured* (one beginning, one ending, both halves). We also corrected our own plan mid-build when streaming reality contradicted it — proof the bar points inward, not just at handed-over code.

**Bad / what's honestly NOT proven yet:**
- **Structural ≠ smooth.** We proved the two halves are stitched into one well-formed stream. We have **not** yet measured whether the continuation *reads naturally* across two different models — the join could be clumsy ("...is Paris" vs an awkward restart). Measuring seam *quality* is the next job (an evaluation harness that scores coherence). We're not claiming smooth, only seamless-in-structure.
- **Cross-vendor continuation is imperfect by nature.** Anthropic can be told "continue this exact text"; OpenAI continues less cleanly from a partial. That's a known limitation, not a solved problem.
- **One answer-block only.** v1 handles a single block of text. Fancier responses (tool calls, multiple blocks) aren't supported through the failover path yet.

**Bottom line:** the main model died in the middle of a sentence and the reader still got their answer — proven, not promised. Next we measure whether the stitched answer reads as smoothly as it survives.
