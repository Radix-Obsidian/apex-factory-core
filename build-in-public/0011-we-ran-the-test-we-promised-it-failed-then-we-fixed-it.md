# 0011 — We ran the quality test we promised. It failed. Then we fixed it.

**Date:** 2026-06-14

> **Correction (2026-06-14, same day):** Two fixes after deeper checking. (1) Modern Claude does **not** "continue cleanly" — we *verified* it refuses a prefilled half-answer outright (HTTP 400, "model does not support assistant message prefill"). The clean, no-instruction continuation only comes from providers with explicit continuation support (DeepSeek, Mistral). (2) Our 3-vendor judge panel (Claude + GPT + Gemini) wasn't fully *neutral* for this seam — **two of the three are the seam's own vendors** (Claude graded its own first half, GPT its own continuation), so the 4.3 is a strong **directional** pass, not the final neutral number; a re-run with three *independent* judges is queued. The core story below — bare failover fails, our continue-instruction fixes it — holds regardless of judge.

## What happened
Last entry we built the test for our headline feature and promised to run it for real and fix whatever it showed — so we did: the hard case scored **3.6 out of 5 (a fail, exactly as we predicted)**, we found why, and a small, safe fix took it to a passing **4.3**.

## The story

H\RNESS's whole promise is *invisible failover*: when one AI model dies mid-answer, we splice in a different vendor's model and the user gets one clean, continuous answer. In [entry 0010](0010-we-built-the-proof-and-admitted-its-limits.md) we built the harness to *measure* whether the spliced answer actually reads well — and we wrote down, in public, that we hadn't measured it yet and expected the hardest direction (one vendor continuing another vendor's half-written text) to score badly.

This entry is us keeping that promise.

**We ran it for real.** We had a primary model (Claude) start each answer, cut it off mid-thought, and had a second vendor (OpenAI) continue it — then we let a **panel of three AI judges from three different companies** score how coherent the stitched answer was, 0 to 5. We averaged the panel so no single model could grade its own homework.

**The prediction was right. It failed: 3.6 out of 5**, below our 4.0 bar. And the failures were ugly: out of 30 cases, one had OpenAI **echo the question back** instead of continuing; another turned a half-written Python function into **unrelated nonsense about filenames**; several **started the whole answer over**.

**Then we found *why*** — and it's specific. OpenAI's API, when you hand it a half-finished answer and say "keep going," often **ignores it and restarts** — but mostly when the cut-off point lands on something structural like a heading or an open code block. Providers differ: Google's Gemini continued our half-answers cleanly in early tests while OpenAI didn't — and we later **verified that modern Claude refuses a prefilled half-answer outright** (it returns an error). A truly clean, no-instruction continuation only comes from providers with explicit "continue this" support, like DeepSeek and Mistral. Our earlier rosy number had come from testing against Google's model, which **hid the problem**. The real, most-popular pairing exposed it.

**The fix was small — and it respected a rule we'd locked.** We have a hard rule: *never change the half-answer the user already saw* (if we trimmed or edited it, the second model would repeat text and the user would see it twice). We worried the only fix would force us to break that rule. So we tested both:
- **Option A (safe):** leave the user's text exactly as-is, and add a short *separate* instruction to the continuing model — "you were cut off; continue, don't restart."
- **Option B (rule-breaking):** edit the half-answer itself to tidy the cut.

**Option A won — and Option B actually scored *worse*.** So the locked rule stays, and there was no hard call to make. Option A took the score from 3.6 (fail) to **4.9 on the first small test, and a more honest 4.3 on a bigger, harder test** built specifically to hammer the weak spots. Every single near-garbage case got rescued (one went from 0→4, another 1→4.5).

We also caught a separate bug while we were in there: the failover re-used the *full* original length limit, so a spliced answer could run **up to twice as long — and twice the cost — as the user asked for.** Fixed, with a test.

## The numbers

- **The hard case, bare failover (Claude→OpenAI): 3.60 / 5 — FAIL.** 30 real prompts, judged by a 3-vendor panel (Claude + GPT + Google Gemini), scored as the median of the three. 4 of 30 cases scored 2 or below (one a literal 0). *(Caveat per the correction above: two of those three judges are the seam's own vendors, so this is directional; a fully-independent re-run is queued.)*
- **With the fix: 4.32 / 5 — PASS.** (4.90 on the first 10-prompt test; 4.32 on the 30-prompt set weighted toward the cases that break it — the lower, harder number is the one we trust.)
- **The rule-breaking alternative: 4.55 — worse than the safe fix (4.90).** Rejected. Our locked rule survives untouched.
- **A real cost bug fixed:** failover could emit ~2× the requested length/spend; now capped.
- All automated tests green; strict linter clean. Two pull requests open — one for the product fix, one for the measurement tooling — kept separate on purpose.

## The lesson

**Design the test to make yourself fail, then believe it over your own hopes.** Three things made this honest instead of a vibe: we tested the *most popular* pairing (not the one that looks good), we **weighted the test toward the cases we knew were weak** (so the score got *harder*, not easier, as we scaled up — 4.9 down to 4.3), and we used a **panel of rival judges** so no model graded itself. Our own review agents even caught us briefly trusting a flattering number from a single biased judge — and made us re-measure. The number you can defend on your worst day beats the number you put on a slide.

## Good & bad

**Good:** Our headline feature now has a **real, defensible quality score** on the pairing customers will actually use, the fix is small and respects our own locked rules, a cost bug got killed along the way, and the work is split into two clean, reviewed pull requests.

**Bad / the honest limits:**
- **4.3 is a pass, not a flex.** It's above our 4.0 bar but not by much, and it's *lower* than the first test — because the real test was harder. We're publishing the smaller number on purpose.
- **The fix isn't perfectly free.** A few answers that were already perfect dipped slightly (5 → 4.5) — the "keep going" instruction occasionally makes the model over-explain. Net hugely positive, but not magic.
- **Soft spots remain.** Cases involving SQL queries, code, and tables still score in the 3s. Above the bar on average, but the next round of tuning has clear targets.
- **We tested 1 sample per case (k=1).** Good enough to make the decision; we'll run more samples before any public claim, because AI output varies run to run.

**Bottom line:** we promised to run the scary test and fix what it showed. The test failed exactly where we said it would, the fix was small and safe, and the honest passing number is 4.3 — written down here, lower number and all.
