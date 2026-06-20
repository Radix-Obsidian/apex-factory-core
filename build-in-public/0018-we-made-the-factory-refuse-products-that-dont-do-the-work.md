# 0018 — We made the factory refuse products that don't do the work for you

**Date:** 2026-06-20

## What happened
We shipped a product, charged for it, looked at it honestly, and admitted it wasn't good enough — not buggy, *too shallow*. It tells a trucking carrier exactly what compliance is due and when. Useful. But it still makes them go do the hard part. So we turned that lesson into a law the whole factory now obeys: **every product we bless has to own the outcome — do the work and keep the user in the loop — not hand them another dashboard with AI bolted on.** Then we pointed the new law at our own shipped product. It fails. Good.

## The story

Three people who've never met said the same thing this week, and we finally listened to all three at once:

- **A YC partner (Diana Hu):** the old way is *open-loop* — software tells you something, then waits. The new way is *closed-loop* — it watches your real situation, acts, and pulls you back in when it matters.
- **Peter Thiel:** don't sell a feature into a crowd. Own a small market completely by owning the *outcome*.
- **Thomas AI (a YC-backed "AI founder"):** don't sell another tool — sell the thing that actually makes or saves the money.

Our compliance product was open-loop. It's a beautifully made *calendar*. The carrier already half-knew the deadlines; what stopped them was the *doing* — gathering the records, filling the forms, remembering. We built them a better to-do list and charged for it. That's "cool." It is not a moat.

So we wrote the rule into the machine, on both sides:

1. **At the gate (what we'll build):** the kill-pass got a new, non-negotiable bar — `does_it_for_you`. Three independent skeptics now have to agree a candidate *owns the outcome and closes the loop*, or it dies — same brutal unanimity that kills me-too ideas. A "horizontal SaaS with an AI feature" can no longer sneak through. We were careful to keep this separate from "must it use AI?" — we still don't require AI; we require *closing the loop*. A great non-AI tool that does the job for you passes; a flashy AI dashboard you still have to operate fails.

2. **At the build (what we ship):** a new $0, no-AI check (`closed-loop-check`) makes every product *declare its loop* — what outcome it owns, what it does for the user, what state it remembers, how it keeps them in the loop — or the build doesn't pass the checklist. It's the same move we made for design last week: write the standard down and make it mechanical.

Then the honest part: we ran the new check against our own live product. **It fails.** No closed loop declared, because there isn't one yet. We defined the bar *before* the thing that has to clear it — on purpose. The next build rebuilds the compliance product to actually do the work: it remembers each carrier, generates every document pre-filled, tracks what's really done vs. missing, tells them the one next thing, and nags them before deadlines — the genuine "done for you." (One hard limit we found and won't pretend around: the government deliberately requires the carrier's own signature to file, so we can't silently file for them. We prepare, track, remind, and make it one click — we don't fake an auto-submit that legally can't exist.)

## The numbers

- **One new hard gate** (`does_it_for_you`) across both idea sets (salvage + net-new); **63/63** guardrail tests green (added R33).
- **One new $0 build check** (`closed-loop-check`) — verified it *fails* an open-loop product and *passes* a declared one.
- **Our own shipped SKU currently fails the new bar** — the gap is now measured, not vibes.
- **Revenue: still $0** real. We sharpened *what* we build before chasing the dollar — on purpose.

## The lesson

The cheapest time to raise your standard is right after you've met your old one. We'd just proven the factory can ideate, build, design, ship, and take money — and the instinct was to celebrate and scale. Instead we asked "is the thing we ship actually worth a moat?" and the honest answer was "not yet." Writing that into a gate means the next hundred products inherit the higher bar automatically. The factory doesn't get more valuable by making *more* things — it gets more valuable by making things that *do the work*.

## Good & bad

**Good:** We turned a gut feeling ("this is cool but shallow") into two mechanical gates in an afternoon, kept them honest (AI stays optional; closing the loop is mandatory), and had the discipline to fail our own live product against the new bar instead of grandfathering it.

**Bad / the honest limits:**
- **The new bar is judged by skeptics, and the build check is structural** — they prove a loop was *designed*, not that it's *excellent*. Same caveat as our other gates.
- **Our shipped product is now officially "not good enough" by our own rule** — which is the point, but it means the moat is still ahead of us, not behind.
- **Still zero real revenue.** Raising the standard doesn't earn a dollar; building the closed loop and getting a carrier to rely on it does. That's the next build.
