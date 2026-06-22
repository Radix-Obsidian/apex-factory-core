# 0015 — We built an idea generator, fed it real demand, and it killed all four of its own ideas.

**Date:** 2026-06-18

## What happened
Our factory could kill ideas but never *generate* them — it only mined dead repos. So we built the missing half: a generator that hunts real, paid-for pain and turns it into product ideas. Then we did the only honest thing — pointed our own kill-pass at its first four ideas. **All four died.** We did not weaken the gate to let any through.

## The story

For weeks our review line had one job: say "no" to old code. It was good at it (two flagship ideas dead, see 0013/0014). But "salvage the graveyard" kept producing commodity, so we built the other half of a factory — a real **idea generator**. It mines where people actually complain (industry forums, one-star software reviews, job postings, "I wish a tool existed that…" threads), keeps only pain that someone already pays or hand-jams a spreadsheet to solve, and turns the strongest of it into specific product ideas.

The temptation with a generator is obvious: let it bless its own ideas. We did the opposite. A generator that grades its own homework is a yes-man with extra steps. So the ideas it produced went through the **exact same gate** we point at strangers — a live competitor sweep, three independent skeptics who all must agree, and durability checks — with **one honest change**: a net-new idea has no old repo to "salvage cheaply from," so we swapped that one salvage-specific test for its fair net-new equivalent ("can you build this mostly by wiring proven parts, cheaply?"). Same number of bars, same brutality. We were careful *not* to make it easier just because the ideas were ours.

It picked a sober lane on purpose — boring, high-intent B2B back-office work — and surfaced four ideas, all backed by real money being lost:

- **CarrierCheck** — AI invoice reconciliation for freight brokers (catch detention/fuel overbills).
- **DisputePilot** — auto-draft and chase the carrier disputes brokers currently abandon.
- **RetainerWatch** — real-time retainer-burn alerts for agencies bleeding unbilled scope.
- **ScopeGuard** — a Slack bot that catches "can you also…" scope creep the moment it happens.

Then the gate ran, against the *live* 2026 market — and killed every one:

- **CarrierCheck** → killed unanimously (0.95 confidence). **Laneproof already ships this feature-for-feature to the exact same customer.** Nine competitors found. Crowded me-too.
- **DisputePilot** → killed unanimously. **Lighthouz AI (YC S24)** already does the post-audit dispute loop for the same teams.
- **RetainerWatch** → killed 2-to-1. Eleven competitors (Accelo, ManyRequests, RetainerOps…); the only edge was positioning, not a moat.
- **ScopeGuard** → killed 1-to-2. Here's the one that matters: **two of three skeptics voted SURVIVE.** But the third found the name was already live (scopeguard.me, 500+ agency users) plus direct competitors — and our rule is *any* kill is a kill. The majority wanted yes; the gate said no. That's the cord working under pressure.

## The numbers

- **The run:** 21 agents, ~828K tokens, ~10.6 minutes, on the shared subscription — **no extra API spend.**
- **Result: 4 ideas in, 0 survived.** Competitors found per idea: 9 / 8 / 11 / 6.
- **The gate held on us:** two of the four had a *majority* of skeptics voting SURVIVE; both still died, on live-market facts.
- **Where they died (the tell):** across all runs, *"is this genuinely new?"* is now the **#1 kill reason (136 hits)**. The net-new "can you build it cheaply?" bar **didn't even chart** — the ideas were perfectly buildable. They just weren't *new*.
- **Scoreboard now:** 63 killed / 1 survived of 64 lifetime decisions; **0 standing greenlights; 0 shipped; $0.** The mechanism itself ships green at 59/59 tests.

## The lesson

The gap this exposed is the whole game, and it's not what we expected. Generating *plausible, real-demand* ideas turned out to be easy — the machine did it in ten minutes. The hard part is that **"evidenced demand" and "open white space" are in tension.** If a pain is real enough to have proof of demand, it's usually real enough that someone is already selling the cure. We aimed the generator at "boring B2B with proven demand" and it faithfully found markets that already have proven players. The bar caught it every time, on the *novelty* test — exactly the right place.

So the fix is precise: **check the competition *during* idea generation, not only at judgment.** Today the generator dreams up an idea, then the gate later discovers it already exists. It should be hunting for demand that's evidenced *and unserved* from the start — narrower niches, the underserved edge of a crowded market, the workflow the incumbents skip. That's the next iteration, and we know exactly what to change.

The meta-lesson is the same one we keep re-learning, now proven a third way: **the asset is the honesty, not any one idea.** We built a brand-new engine, fed it our best effort, and let it tell us all four were duds — including two the majority wanted to greenlight. A factory you can't trust to kill its *own* fresh ideas isn't a factory; it's a hype machine. Ours killed them.

## Good & bad

**Good:** The generator works — it produced specific, real, *buildable* ideas, not vapor. The gate held on us even when 2 of 3 wanted a yes. The whole experiment cost no extra money. And our own metrics pinned the gap to one exact bar, so the next move isn't a guess.

**Bad / the honest limits:**
- **We still have nothing to ship.** The goal this round was to dogfood the promise — generate → survive → build → live preview — *to ourselves*, before we ever offer it to anyone. We got "generate," not "survive." The promise is **not yet proven**, and we will not offer it until it is.
- **Our first ideation strategy has a systematic flaw:** "find proven demand" steers straight into crowded markets. Unchanged, it will keep producing me-too.
- **This is the andon cord stopping the line again — by design.** A stopped line with a known defect to fix beats a running line shipping a commodity. But it is, plainly, another "no" — our fourth, fifth, sixth, and seventh in a row.
