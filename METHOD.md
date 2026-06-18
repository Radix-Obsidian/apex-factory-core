# METHOD.md — The Native Factory Method

> The articulation of *how* this factory builds, ships, and decides. **Principles only** — this document names the
> method and its mechanisms; it exposes no implementation. Canonical record: [DECISIONS.md](DECISIONS.md) D16. The
> standard is **measured, not asserted** — every claim here is backed by a number you can recompute (`make recycled-metrics`).

## 1. Thesis — the process is the product

The factory is a private, autonomous production line that turns ideas into shipped software, one control plane
manufacturing many independent products ([DECISIONS.md](DECISIONS.md) D4: company ⟂ product). We do not sell the
machine; we sell its **power** — the outcome. The asset is the *method*, and the method is what this file describes.

It is an AI-native, **closed-loop** company in the sense the best builders now mean it: the line runs unattended, with
exactly one human stop — the founder-only publish+charge gate (D5). Everything upstream — research, build, test,
preview — is autonomous; only charging a real customer requires a human.

## 2. The standard in one screen — manufacturing principles → mechanism

We run the Toyota / Tesla / SpaceX manufacturing disciplines. Almost all of this is **already built**; naming it is the
point — so the line reasons inside it.

| Principle | How the factory does it |
|---|---|
| **Pull / just-in-time** (TPS) | Build only what's pulled from a validated queue; an empty queue changes nothing. |
| **Jidoka / stop-the-line + andon cord** (TPS) | Fail-closed gates everywhere; any defect halts the line; the publish+charge gate is the one hard stop. |
| **Genchi genbutsu / "go and see"** (TPS) | Ideas are judged against the *live market*, never their own claims. |
| **Kaizen / continuous improvement** (TPS) | Every run is measured; outcomes are captured; we log wins *and* losses in public. |
| **Waste elimination / muda** (TPS + Tesla) | Default-to-kill; delete-before-optimize, automate-last; never rebuild what can be salvaged; never delete (reversible archive). |
| **Reusability** (SpaceX) | Salvage proven capability from dead code instead of rebuilding — the Falcon-9-booster discipline. |
| **First-principles** (SpaceX / Musk) | Reason from fundamentals, not analogy; question every requirement; ship the irreducible minimum. |
| **Vertical integration** (Tesla) | One control plane, many products; in-house intelligence, gates, and review. |

## 3. How we stay honest — the andon cord

The differentiating principle is the one most builders skip: **the process that asks "should we?" before shipping.**
Our line is built to tell *us* "no" first. The proof is public and unflattering:

- It caught our own flagship **faking a feature** that already shipped free in a competitor — before we bragged about it
  ([build-in-public/0005](build-in-public/), [0013](build-in-public/)).
- It caught our **judges grading their own homework** and we fixed the gate ([0012](build-in-public/)).
- It **killed our own one greenlight** (MCPShield) on a full re-run once the bar was strengthened ([0014](build-in-public/)).

A validator that only kills *other people's* ideas is a hobby. Ours kills its own.

## 4. The scoreboard — measured, not asserted

Run `make recycled-metrics`. It aggregates every run and prints the real numbers, **including the zeros**. As of
2026-06-17 (9 runs):

- **kill-rate: 98%** (59 KILL / 1 SURVIVE of 60 decisions)
- **greenlight-yield: 1 of 60 ever** — and that one (MCPShield, from an earlier, weaker bar) was **re-killed** when the
  bar was strengthened → **0 standing**
- **SKUs shipped: 0 · revenue: $0 · outcomes captured: 0**

Every number is recomputable from the run artifacts. Several KPIs (cycle time, time-to-preview, build cost, Day-45
profitable yield) are reported `n/a` with the honest reason — because we cannot measure them yet, not because they're hidden.

## 5. Honesty charter — what we do NOT claim

The bar applies hardest to us. Explicitly:

- **Fidelity = "the gates fire honestly," NOT "the output is excellent."** We have the discipline designed in; we have
  **not** shipped a profitable product. 0 SKUs, $0.
- We do **not** claim "Toyota-level operational excellence," "~95% control," "80–85% in-house," or "10× speed." Those
  are unmeasured or contradicted by our own scoreboard.
- The "**generate a dollar in days**" idea (see Direction) is an **unproven direction, not an offer.** We have made $0
  for ourselves; we will not promise a stranger a dollar we've never earned. We dogfood it first.

## 6. Direction — where this goes (NAMED, not built)

Aspiration, clearly labeled. None of this is a current capability; each is gated on the one before it earning its place.

- **B — fundable factory (a digital twin of our own operations).** Make the line *measurable, then simulatable*
  ("$X → Y products/quarter at Z yield") so it becomes fundable. The scoreboard above is the seed; the twin is the next step.
- **C — Factory-as-a-Service.** The evidence it's plausible comes from the Higgsfield playbook (Alex Mashrabov: *$0 →
  first dollar in ~30 days, $1M in ~90 days, 2 people, no VC*): extreme velocity, **orchestrate don't build**, packaging
  over raw capability, and — the real reason most products make $0 — **distribution** (creators as a distribution
  network, not ad spend). Our added, honest twist: we **keep the "should we?" gate Higgsfield lacked** (the missing
  ingredient behind its public reckoning) and refuse its dark patterns. The offer becomes a no-brainer via real
  risk-reversal (money-back + we cover your tools + you keep the build). **Earned, not announced** — the free demand
  probe ("we'll kill your idea free; if it survives we build it") proves it first, on us.
- **Robotics / sports-science.** The eventual physical products, **re-engineered digital-first**: validate as digital
  twins, let revenue + data fund the first physical unit. We shape any physical layer into a provable digital one now,
  and build the physical only when the data and funding exist.
- **The learning loop.** The same Thiel-7 and first-principles questions the line uses to *gate* ideas become the
  Socratic questions the product asks *users* — and their answers compound into a corpus no competitor can re-scrape.

> Grounded in: YC Startup School (Xu — *pick one idea, go deep, validate with real customers*; Friedman — *evaluate
> ideas*; Alströmer — *first customers: charge early*; Hu — *AI-native, fully-queryable company*) + the Higgsfield
> teardowns. The kill-gate filters cheap; **customers and dollars validate**; queryability makes the factory fundable.
