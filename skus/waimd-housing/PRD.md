# WAIMD — Work Assignment. Instant Move Decision.

> Product brief / build spec for the `waimd-housing` SKU. This is the factory-side capture of the
> founder's product definition (the canonical source of truth the build loop implements). It is a
> **reconstruction from the founder's brief**, not a verbatim copy — treat the intent as binding and
> confirm any detail with the founder if the build hinges on it.

## One-liner
A confirmed travel-nurse assignment in → **3 evidence-backed housing choices** out, in minutes. WAIMD
does the deciding, not just the searching.

## Scope lock (one ICP, one painful moment, one outcome)
- **ICP:** a travel nurse who has **just accepted an assignment** (city + start date + contract length
  are now fixed) and has to solve housing on a clock.
- **Painful moment:** the hours lost cross-referencing listings against commute, budget, lease term,
  and move-in date — under time pressure, in an unfamiliar city, with real money and a real start date
  on the line.
- **Outcome:** a **decision**, not a search results page — 3 ranked options, each with a plain-English
  why, each backed by evidence the nurse can trust.

## The trust thesis (why this is defensible, and non-negotiable)
The product **never lies**. No fabricated reviews, inventory, badges, counters, or "N nurses trust us".
Every availability claim carries a timestamp and an evidence state. This is enforced in the factory by
the **honesty-auditor** hook (`hooks/honesty-auditor.mjs`) and codified in the evidence model below.
The moment we fake certainty we've become every other listings site; the whole wedge is that we don't.

## What ships (the vertical slice)
1. **Mission intake** — anonymous, no account: assignment city, facility/commute anchor, start date,
   contract length, budget, hard requirements (pets, parking, furnished, lease-term fit), preferences.
2. **Decision engine** — deterministic gates + scoring over candidate housing (see BUILD-CHECKLIST.md).
3. **The Decision** — exactly **3 ranked choices**, each with: score breakdown, a one-paragraph
   plain-English rationale (the model *explains* the deterministic score, it never invents it), and an
   evidence state per fact (LISTED / CHECKED / CONFIRMED with an as-of timestamp).
4. **Monetization** — **$29 per decision**, charged **only if 3 viable options are found**; full refund
   / no charge otherwise. Stripe in **TEST** mode until the founder's publish+charge gate (D5).
5. **Identity/compliance footer** — WAIMD is a product of **Voco Technologies, Inc.** (Dover, DE);
   waimd**.org** is a commercial product, **not a nonprofit** — the footer says so plainly.

## Acquisition
- **Meta ads only** for validation. Housing is a **Special Ad Category** — the ad account must be set to
  it; no targeting workarounds. Instrument the full funnel (impression → mission-start → decision →
  paid) so cost-per-decision and conversion are measurable from day one.

## Falsifiable success gate
Spend the validation budget (**$70 = $10/day × 7**) to drive **≥10 qualified missions**; the product is
validated if that yields **≥3 paid decisions**. Fewer → isolate the failure (funnel vs. engine vs.
offer), pivot, or kill. Honest 0 is a valid result.

## Stack
Next.js + Supabase (Postgres) + Stripe. Scaffolded from the **chassis** template (D21); the housing
logic is a **DomainPack** on the inherited spine (auth, billing, cached `llm` wrapper, deploy).

## Explicitly out of scope (v1)
Accounts/logins, saved searches, in-app booking/payments to landlords, roommate matching, non-nurse
verticals, native apps. One ICP, one moment, one outcome — everything else is a later decision.

## Founder-gated / off-repo
Product-repo creation (D21), waimd.org repoint off the dead FMCSA deploy, Meta ad-account + budget, and
the Stripe test→live flip (D5) are all founder actions — see the SKU's `pending_founder_actions` in
`skus/registry.json`.
