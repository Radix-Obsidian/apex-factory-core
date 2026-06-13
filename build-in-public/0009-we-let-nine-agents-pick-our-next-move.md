# 0009 — We let nine AI agents pick our next move (and the skeptics were right)

**Date:** 2026-06-13

## What happened
We finished building H\RNESS v1 and hit a fork: three things we could do next (A, B, or C). Instead of the founder just picking, we handed the decision to a panel of nine AI agents — each one told to read our actual code first — let them argue, made one of them attack the winning answer, and took their call. They chose well *and* caught two real bugs we'd already shipped.

## The story

Every other entry in this log is about the founder steering and the tools checking the work. This one flips it: we wanted to see what the team of agents could do if we let *them* make a real decision and we just watched.

The fork was concrete:
- **A — Free Prize Inside:** build the signed "reliability receipts" and a public reliability index (the marketing/word-of-mouth play).
- **B — Eval harness:** actually *measure* whether our headline feature (the invisible failover) produces a *good* answer, and film it beating a competitor live.
- **C — Harden & lock:** add the safety rails (automated checks, security gates) before any real traffic.

So we ran a structured debate, not a free-for-all:
1. **Six panelists, six different jobs** — an architect, a security reviewer, a code-quality reviewer, a growth strategist, a "spend-every-dollar-wisely" founder lens, and a deliberate contrarian. Each was *required* to open the real code and cite what it actually saw, not vibe.
2. **A chair** read all six and wrote up the consensus.
3. **A red-teamer** — the important part — was told to *attack* the chair's recommendation and argue for the loser.
4. **A final judge** read everything and made the call.

The vote came back split: **three for B, three for C, zero for A.** B won by a hair on conviction. But the gold wasn't the vote — it was the red-teamer, who did three things a single opinion never would:

- It **found a real bug**: our "watchdog" that's supposed to catch a stalled provider doesn't actually cover the *connecting* phase — a server that accepts a connection and then goes silent would hang right past it. A ~2-line fix.
- It **found a real denial-of-service hole**: our stream parser had a buffer with no size limit, so a hostile or broken upstream could make it eat memory until the process dies. A ~5-line fix.
- It **debunked its own teammates**: two of the three security alarms the other agents raised were, on a careful code read, *false* — our parser already handles the scary cases. So "track C" shrank from a big security project to three small fixes.

And it **killed option A's whole premise.** A was supposed to be cheap because it "reuses signing code we already built." The red-teamer checked: that signing code only exists in our *tests*. The real thing would be built from scratch. The cheap option wasn't cheap.

Then we acted on it the same day: we did the three small fixes the agents found, wired up automated checks so our "all tests pass" claim can never quietly rot, and shipped it in one change. Tests went from 100 to 101 green.

## The numbers

- **9 agents**, ~**107** file reads/searches into the real codebase, ~**7.3 minutes** wall-clock, ~**660K tokens** of deliberation.
- **Vote:** B 3, C 3, A 0. Full-ballot score B 15 / C 14 / A 7. Conviction-weighted B 13 / C 12. A was shut out by every lens.
- **The red-team caught:** 2 real bugs (a connection-hang that escaped our watchdog; an unbounded parser buffer = memory-exhaustion risk), debunked 2 of 3 overstated security claims, and falsified 1 option's core "it's free" premise.
- **Then we shipped the fix:** connect-timeout on both upstream clients, a 1 MiB cap on the parser buffer, and a CI pipeline (format + lint + tests + dependency/license scan) gating every change. **101 tests green**, lint clean. `cargo test` reproduces it.

## The lesson

**The best decision-maker isn't the smartest single mind — it's a panel that reads the real code and is allowed to attack each other.** The majority picked the right track, but the *most valuable seat at the table was the skeptic*. Adversarial review didn't just rubber-stamp the winner; it corrected its own teammates' mistakes, found two shipped bugs, and stopped us from believing a "cheap" option that wasn't. If you only take one thing: when you ask AI for a recommendation, also make it argue against itself — that's where the truth falls out.

## Good & bad

**Good:** A genuine decision came out of agents working together, grounded in our own source, and it immediately paid for itself by finding two real defects and a false assumption before they cost us. We watched it happen and acted on it the same day.

**Bad / the honest limits:**
- **It cost real tokens and minutes.** Nine agents reading code isn't free; this is worth it for a real fork in the road, not for every small choice.
- **A panel can share a blind spot.** Three agents repeated the same overstated security fear; only the adversary caught it. Without the red-team seat, we'd have over-invested in a non-problem. The lesson is the fix, but it's a reminder that "majority of agents agree" is not the same as "true."
- **The decision exposes more work, not less.** The track they chose (prove the failover is actually *good*) is honest precisely because it might tell us the answer needs improving. We picked the option most likely to give us bad news — on purpose.

**Bottom line:** we let the team decide, the skeptic earned its seat, and we came out with a clearer plan and a safer product the same afternoon.
