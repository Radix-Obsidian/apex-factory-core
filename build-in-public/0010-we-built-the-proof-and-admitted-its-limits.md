# 0010 — We built the proof our headline feature works (and published what we can't prove yet)

**Date:** 2026-06-13

## What happened
H\RNESS's whole pitch is *invisible failover*: when one AI model dies mid-answer, we seam in another and the user gets one clean answer. So we built the harness that proves it — and drew a hard, public line between what we've **proven** and what we still **can't prove without real keys**, refusing to claim a quality number we haven't actually measured.

## The story

The agent panel ([entry 0009](0009-we-let-nine-agents-pick-our-next-move.md)) told us to measure the differentiator before doing anything else. Here's the honest part most companies skip: "the failover works" is actually **two** claims, and only one of them is cheap to prove.

1. **Does the stitched-together answer come out as one well-formed stream?** (the *structure*) — Yes, and we now prove it automatically on every commit. A real model drops mid-sentence, we seam in the other vendor, and a validator checks the result is a single grammatically-correct answer: each part appears exactly once, in the right order, nothing after the end marker, both halves of the answer present, exactly one failover (not a retry storm). We even wrote a test that feeds the validator a *broken* stream to confirm it actually rejects it — a check that can't pass is worthless.

2. **Does the stitched answer read *well*?** (the *meaning*) — i.e. do two different models' halves not contradict or repeat across the join. **This one we have not measured yet**, because you can't judge it without real model output and a real judge. So we built that measurement harness — a rubric and a vendor-neutral panel of AI judges that score coherence 0–5 — and labeled it, in writing, *"no coherence number has been measured yet."* We will run it privately with real keys first, because we expect the hardest case (one specific vendor continuing another's text) to score lowest, and if it does, we fix the seam before we ever publish a number.

Along the way we made the thing actually *runnable*: H\RNESS had no way to send itself a signed test request, so we added a small reference client (`keygen` + `sign`) that reuses the **exact** signing code the server verifies with — proven by tests that sign with it and verify against the real server check.

Then we did what we always do: we let our own team of review agents tear it apart before committing. Three specialists (security, Rust quality, test quality) reviewed the whole change. All three approved — and the test-quality reviewer caught two real coverage gaps (we only tested failover in one direction, and a panic message would have been unhelpful). We fixed both in the same change.

## The numbers

- **112 automated tests** pass (up from 100), lint clean, formatting clean — and now a CI pipeline enforces all of it on every push, so it can't silently rot.
- **The eval harness has 4 layers**, honestly ranked by what they cost and prove:
  1. structure (runs in CI, no keys) — **built and green**
  2. real network-fault chaos (needs Docker) — **ready to run**
  3. *meaning* / coherence score (needs keys) — **harness ready, number NOT yet measured**
  4. the side-by-side-vs-a-competitor clip (needs keys) — **documented and ready**
- **Review:** 3 specialist agents, all "approve," **2 real coverage gaps found and fixed** before commit, zero critical issues.
- Two clean commits on the branch; the pull request is open on the private repo.

## The lesson

**"Proven, not promised" means publishing the line between the two — not blurring it.** The easy move is to prove the cheap half (the structure) and let people *assume* you proved the expensive half (the quality). We wrote the boundary down instead: *failover produces a well-formed stream — proven; the continuation reads well — not measured yet.* A claim you haven't earned, stated plainly as "not yet," is worth more than a claim you fudge.

## Good & bad

**Good:** The headline feature now has a real, automated, every-commit proof that it produces a structurally perfect single stream, the harness to measure the *quality* is built and ready, the whole thing is runnable end-to-end, and our own review agents hardened it before it shipped.

**Bad / the honest limits:**
- **The quality number doesn't exist yet.** Until we run layer 3 with real keys, we cannot claim the continuation "reads naturally" — and we won't.
- **We expect the hard direction to be rough.** One vendor continuing another's exact prefix is the structurally weakest case; the most likely first result is "continues but degrades," which means real seam-tuning work behind this entry, not a victory lap.
- **The chaos and wedge demos haven't been run here** (they need Docker and keys). They're built and syntax-checked, not yet executed — and we're saying so rather than implying otherwise.

**Bottom line:** we built the proof that the differentiator works, proved the half we honestly can, and told you exactly which half is still a promise. Next: run the quality measurement for real, and fix whatever it shows.
