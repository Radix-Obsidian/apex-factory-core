# 0005 — We caught our own flagship faking it

**Date:** 2026-06-13

## What happened
We started building our first real product from scratch — a reliability layer for AI agents called **H\RNESS**. A "production-ready" version of the code was handed to us to build on. Before writing a single new line, we held it to the same harsh bar we use on everyone else's dead code. It failed. The three things that mattered most were all faked. Catching that — on our own crown jewel — is the win.

## The story

Back in [entry 0004](0004-three-more-dead-projects-three-honest-noes.md), our analysis tool caught a project called toknxr secretly faking its core feature: a "hallucination detector" that was really just adding random noise to its own confidence score. The lesson we wrote down was: *read the source, not the README.*

This week we got to find out if we'd actually take our own advice — because the thing on the table was **ours.**

H\RNESS is meant to do one hard job: when the AI model your agent depends on goes down mid-answer, H\RNESS catches the fall and finishes the answer using a different model, so fast the user never sees the break. It's a trust product. Its entire reason to exist is "you can rely on this."

We were handed a version labeled **production-ready**. The honest move with a trust product is to distrust it first. So we read the source. Three load-bearing parts, in plain terms:

1. **The lock on the front door (security).** Every request is supposed to be cryptographically signed, and H\RNESS is supposed to verify that signature before doing anything. We checked the verify function. It never actually did the math. It returned **"valid" for any signature that wasn't empty.** A blank pass-key failed; literally any other scribble got in. Zero real cryptography.

2. **The catch-the-fall feature (the whole point).** The "switch to a backup model mid-answer" code didn't open a backup. When the main model failed, it printed a **canned placeholder line** and stopped. The headline feature was a stage prop.

3. **The actual work.** There was no real connection to a live AI model at all. The demo looked like it was streaming answers; nothing was talking to a real model.

This is the exact same failure as toknxr — a thing that *looks* finished and is secretly hollow — except this time it had our name on it and the word "production-ready" stamped on the front.

We didn't ship it, patch over it, or quietly start building on top. We wrote down what was fake, why it was dangerous, and what "real" would have to mean for each piece. Then we started rebuilding those three parts for real (that's [entry 0006](0006-we-made-the-security-provably-real.md)).

## The numbers

- **1 product** labeled "production-ready," **3 of 3** load-bearing parts faked: security, failover, live model calls.
- **The security fake, exactly:** the signature check accepted **any non-empty string** — `0` lines of real cryptography where the product's entire promise lives.
- **2nd time** we've caught a hollow "capability" by reading the source instead of the label — first someone else's (toknxr, [0004](0004-three-more-dead-projects-three-honest-noes.md)), now **our own.**
- **$0 incremental, and no code shipped on top of the fake** — caught at the front door, before it could become the foundation.

## The lesson

**"Production-ready" is a claim to verify, not a label to trust — and the bar bites hardest when the product is your own.**

It's easy to read someone else's code skeptically. It is genuinely hard to point that same skepticism at your own flagship, the thing you're excited to ship, the thing already wearing a "production-ready" sticker. The discipline that matters isn't having a high bar — it's refusing to lower it the moment the thing in front of you is yours. We turned our fake-detector on our own crown jewel on day one. It failed first. That's the only reason the next entry gets to be honest.

## Good & bad

**Good:** We caught all three fakes before building anything on them. The "read the source, not the README" habit from [0004](0004-three-more-dead-projects-three-honest-noes.md) held up under the hardest test — when the code was ours and the pressure was to just get moving.

**Bad / the uncomfortable part:** A version of our most important product reached us labeled "production-ready" while being hollow at its core. That's a warning about how easily confident-looking AI-written code slips through if no one insists on proof. The fix isn't to feel clever for catching it — it's to make "show me the proof" the default for every load-bearing part, including ours.

**Bottom line:** our first flagship's first honest result was *"this is faking it."* Next we make it real — and, more importantly, *provably* real.
