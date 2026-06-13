# 0006 — We made the fake parts provably real (and decided what "real" costs)

**Date:** 2026-06-13

## What happened
After catching our own flagship faking its three core parts ([entry 0005](0005-we-caught-our-own-flagship-faking-it.md)), we rebuilt them for real — and, more importantly, made them **provable.** The fake lock that accepted any signature is now real cryptography, checked against the world's official test cases. Along the way we made four big decisions that changed what we're building. One honest caveat: the headline feature itself isn't proven yet, and we're not pretending it is.

## The story

A demo becomes a product the moment its load-bearing parts can be *proven*, not just demoed. So we went back to the three fakes from [entry 0005](0005-we-caught-our-own-flagship-faking-it.md) and rebuilt from the foundation up, one piece at a time, refusing to move to the next piece until the current one passed automated tests.

**The lock on the front door — from fake to proven.** The old security check accepted any non-empty signature. We replaced it with real cryptographic signature checking (the same family of math, Ed25519, that secures things like SSH and modern web certificates). Then we did the part that actually matters: we tested it against **RFC 8032** — the international standard's official "known-answer" test cases. These are published inputs with published correct outputs; if your code agrees with them, it's doing the real math, not faking. Ours agrees. We also added tests that *try to break in*: a tampered request, a replayed old request, a request with a faked timestamp — all correctly rejected.

While rebuilding, four decisions reshaped the product. These are the "sexy" milestones we'd normally forget to write down:

1. **Bring-your-own-keys, always (a decision we think avoided a fatal mistake).** The tempting design was to hold the AI providers' keys ourselves and resell access. We checked the providers' rules: **reselling their access is against their terms.** Our read is that doing it anyway could get H\RNESS cut off — a company-ending risk — so we treated it as one. Customers bring their own keys; we never hold them. We caught this *before* building it, not after.
2. **Rust for the engine room.** We picked the Rust programming language for the part that touches every word the AI streams. Not preference — track record: Cloudflare built its own Rust proxy (called Pingora) and runs it at massive scale, by their own public reports. The reliability layer can't be the slow, flaky part.
3. **More than one wall (defensibility).** We'd been calling our market *position* a "moat." It isn't. A position is where you stand; a moat is what stops others from standing there too. We mapped several stacked, real moats instead — led by the fact that the giants structurally *won't* build a neutral "route away from any one vendor" layer, because it cannibalizes their own lock-in.
4. **A free prize inside.** Two honest weaknesses (it's easy to leave us early, and we deliberately give up a data advantage to stay trustworthy) get flipped into something we *give away*: a signed, customer-owned "reliability receipt" that proves every time we caught a failure. Turning a weakness into a gift is cheaper than hiding it.

We built the real version in **four checked steps**, each one green before the next: the skeleton, the real security, the live connection to a real AI model, and the translation layer that lets one provider's answer stand in for another's. That last piece — proven with **golden tests** (a known input checked against a frozen, correct output) — is the piece a future failover will rely on to make the model-swap invisible.

## The numbers

- **Security, before → after:** signature check accepted **any non-empty string** (0 real crypto) → **real Ed25519**, proven against the **RFC 8032** official standard test cases, plus tamper / replay / faked-timestamp all rejected.
- **64 automated tests passing today** — `6 + 47 + 8 + 3`, reproducible with `cargo test` — grown from 22 when we first rebuilt the security.
- **4 of 6** planned build steps done, each one passing its tests before we moved on.
- **0 compiler warnings, 0 linter warnings, 0 formatting issues** — the strictest settings, clean.
- **4 product-shaping decisions** locked: bring-your-own-keys, Rust, stacked moats, free-prize. The first one, in our judgement, avoided a company-ending mistake.
- **$0 incremental** — covered by our existing AI plan (no new spend).

## The lesson

**Only claim what you can prove — especially for a product whose entire job is to be trustworthy.**

We can now say two things with receipts: the security is real (it matches the international standard's own test cases), and the cross-provider translation works (golden tests pass). We are deliberately **not** yet claiming the headline feature — catching a failure mid-answer and finishing it on another model so nobody notices — *works*, because the test that proves it isn't built yet. A reliability product that over-claims its reliability is the one product that can't afford to. So the rule we're holding: the demo can show it; the log only celebrates it once a test kills the main model mid-answer and the answer survives anyway. That entry is coming — and it'll have the receipt.

## Good & bad

**Good:** The fake security is now real and proven against the world's standard, not our own say-so. Four big decisions got made deliberately and early — including one (bring-your-own-keys) that sidestepped a potentially fatal legal mistake before a line of it was written. Every step shipped green.

**Bad / the honest edge:** The thing that makes H\RNESS special — invisible, mid-answer failover — is still a promise, not a proof, until its test passes. We've built the parts around it; we have not yet watched a real model die mid-sentence and the answer live. Until we have, it stays in the "promised" column. Saying that out loud is the point.

**Bottom line:** we turned a faked flagship into a partly-proven one in four clean steps, made four decisions that reshaped the company, and drew a bright line between *proven* and *promised.* The next entry has to earn the word "failover."
