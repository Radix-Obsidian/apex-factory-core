# waimd-housing — build checklist

The loop's acceptance checklist for the `waimd-housing` DomainPack. Derived from **PRD.md** (the verbatim
founder PRD v0.1 — the constitution). Section refs below (§n) point at it. Where this file and the PRD
disagree, **the PRD wins**; fix this file.

> WAIMD transforms a travel nurse's accepted assignment into three evidence-backed housing choices.
> Nothing else until strangers pay for that outcome. *(§ constitution)*

The phase spine is the PRD's own **7-day plan (§32)**, not an invented one.

---

## Stack deviations from the PRD (founder overrides, D27)

The PRD is the constitution, but the founder has overridden three implementation choices since v0.1 was
written. **These win over the PRD text where they conflict**; everything else in the PRD stands.

| PRD says | We do | Why |
|---|---|---|
| Stripe Checkout (§15, §26) | **Polar** | Stripe was compromised and declined to remediate an issue that occurred on their end. **D28 retires Stripe portfolio-wide** — the registry validator rejects a `stripe` provider in any mode other than `killed`, so this cannot drift back. |
| Supabase free tier from day one (§26) | **Prisma ORM this stage → scale into Supabase Postgres** | A datasource swap, not a rewrite. Confirmed by the founder 2026-07-31. |
| Meta launch at Day 7 (§20, §32) | **Meta deferred until the beta is built and fully tested** | The $70 is withheld until `make waimd-ready` is fully green. |

Neither payments nor persistence touches the decision engine — it is pure and has no I/O.

## Engine status — proven BEFORE the beta exists

The deterministic engine (§10 gates, §13 score, §14 max-3, §11 evidence ladder) is **built and green**
in the factory at `skus/waimd-housing/engine/` — real TypeScript, run natively by Node, zero
dependencies, no I/O, no LLM, never reads the clock. It ports **verbatim** into the product repo.

- `make waimd-engine-test` — unit + invariant suite (determinism, gate precedence, fail-closed evidence)
- `make waimd-eval` — tier-1 eval vs a labeled corpus (F1 + gate-attribution accuracy)
- `make waimd-ready` — the pre-$70 production-readiness gate; **exits non-zero until everything below is real**

## Standing constraints (apply to every phase)

- **Never lie (§11, §19).** No fake reviews, fake inventory, invented "verified" badges, fake nurses, or
  vanity counters. Only the **CONFIRMED** evidence state may say "Availability confirmed." Enforced at
  write time by `hooks/honesty-auditor.mjs` (factory-side).
- **No fake AI score (§13).** The score is deterministic. The model *may explain* the result; it must
  never *invent* it. Debuggability is the point.
- **Do not scrape sources whose terms prohibit it (§17).** V0 = public/authorized information +
  founder-assisted verification. Licensed feeds/APIs/partnerships come later, if ever.
- **No paid LLM on the critical path (§26).** Deliberate. Note: `make caching-check` (D22) **passes at
  zero call sites** — "no direct Anthropic calls (nothing to cache)". Do **not** add an LLM to the
  critical path to satisfy a checker; that would violate §26 and burn the pool.
- **Mission is the primitive (§6, §30)** — not user, not listing, not landlord.
- **Three choices maximum (§14).** WAIMD collapses the option space; it does not expand it.

## Non-goals — V0 does NOT (§16, verbatim)

❌ own housing · ❌ lease apartments · ❌ collect rent · ❌ process deposits · ❌ perform tenant screening ·
❌ guarantee landlords · ❌ become a property manager · ❌ host landlord listings · ❌ provide neighborhood
"safety scores" · ❌ guarantee property condition · ❌ book housing · ❌ become an OTA · ❌ support other
professions · ❌ create another marketplace

Also explicitly **not now (§31):** pre-acceptance assignment feasibility / "should I accept this
assignment?" economics. That is named in the PRD as exactly how horizontal creep begins.

---

## Decision engine (§10, §13)

**Phase A — five gates.** Any failure → reject.
1. **Dates** — plausibly covers the assignment period.
2. **Economics** — total expected cost satisfies the mission budget.
3. **Commute** — within the specified tolerance.
4. **Hard requirements** — all must-haves satisfied (one failure → reject).
5. **Evidence quality** — how confident are we the information is current?

**Phase B — 100-point score** over survivors (hard-requirement failure = disqualified):

| Weight | Dimension          |
|-------:|--------------------|
|     30 | Budget fit         |
|     25 | Commute fit        |
|     20 | Date confidence    |
|     15 | Evidence freshness |
|     10 | Preference fit     |

Return **max 3** (§14). If fewer than three qualify → the customer pays **$0** (§15).

## Evidence model (§11) — fail-closed

| State | Meaning | May say "Availability confirmed"? |
|---|---|---|
| **LISTED** | The source currently claims availability. | No |
| **CHECKED** | WAIMD rechecked the source recently, information unchanged. | No |
| **CONFIRMED** | A landlord/property rep directly confirmed availability. | **Yes — only this state** |

Never turn a stale calendar into fake certainty. Stale/unknown decays *downward*, never upward.

---

## Day 1 — repository + domain + skeleton (§7)
- [ ] `gh repo create Radix-Obsidian/waimd-housing --private --template Radix-Obsidian/chassis` *(founder, D21)*
- [ ] Mobile-first Next.js + TypeScript skeleton on the chassis spine
- [ ] **Screen 1**: "Your contract is signed. Let's solve where you'll live." + "For travel nurses with a
      confirmed assignment." + CTA "Start my Housing Mission →"
- [ ] Trust line: "No SSN. No rent payments. No deposits. No bank credentials."
- [ ] **Screen 2 — qualification gate**: "Have you accepted your assignment?" → **Yes** proceeds;
      **Not yet** is a **dead end** ("WAIMD is currently designed only for nurses with confirmed
      assignments"). **No newsletter funnel, no generic leads, no contamination of the experiment.**
- [ ] Footer (§19): "Voco Technologies Inc." + Terms/Privacy/Contact/How WAIMD Works; `.org` must not
      imply nonprofit. Everywhere: "WAIMD does not own or manage the properties shown. Housing
      agreements and payments occur directly with the relevant property provider."

## Day 2 — Housing Mission intake + database (§8, §9, §26, §27)
- [ ] One question per screen: facility → start date → end date → budget → entire place/private room →
      max commute (10/20/30/45) → hard requirements (max five: parking, laundry, pet-friendly,
      furnished, private bathroom)
- [ ] **Prisma** schema **exactly per §27** (datasource swaps to Supabase Postgres later): `missions`, `requirements`, `candidates`,
      `candidate_requirements`, `interventions`, `orders` — **no landlord table** (intentional)
- [ ] **Anonymous mission creation** — no account required before value is demonstrated
- [ ] Human-visible mission IDs (`WAIMD-0047`)
- [ ] **Confirmation screen (§9)**: restates the mission ("Mission WAIMD-0047 created… WAIMD is
      searching.") so the customer owns a visible object — never "Thanks for contacting us."
- [ ] Real persisted mission end-to-end

## Day 3 — founder Mission Queue + candidate entry (§18, §28)
- [ ] Mission Queue list: `WAIMD-00xx · SEARCHING | NEEDS REVIEW | READY`, city, start date
- [ ] Mission detail: constraints (left) · candidates (center) · verification (right)
- [ ] Founder actions: add candidate · reject · mark **CHECKED** · mark **CONFIRMED** · record issue ·
      publish Decision
- [ ] `interventions` captures the **`manual_reason` enum** (§18): `stale_availability`, `dates_unclear`,
      `pricing_unclear`, `hidden_fee`, `commute_unclear`, `amenities_unclear`, `source_conflict`,
      `listing_suspicious`, `landlord_unresponsive`
- [ ] Interventions are **labeled data → the automation backlog**. Don't automate guesses; automate
      observed work.

## Day 4 — deterministic scoring + three-match Decision page (§10–§14)
- [x] Five gates implemented, fail-closed → `engine/gates.ts`
- [x] 100-pt scorer (weights above), deterministic and unit-tested → `engine/score.ts`
- [x] Top-3 selection; "fewer than 3 → $0" path → `engine/decide.ts`
- [ ] Port `engine/` into the product repo verbatim and wire it to the Decision page
- [ ] **Housing Decision Card (§12)**: `Match 01` · `94% WAIMD Fit` · price · estimated commute · type ·
      requirement ✓s · **Availability** state + "Source last checked: 2h 14m ago" · **Why WAIMD chose
      it** · **Watch-outs** (surfaces honest uncertainty, e.g. "Pet policy unclear") · **Source: View
      original listing →**
- [ ] Copy passes the factory's copywriter-auditor **and** honesty-auditor hooks

## Day 5 — free preview + $29 unlock + instrumentation (§15, §22)
- [ ] **Free**: mission + **Match #1 preview**
- [ ] **$29 (Polar, one-time, TEST mode)** unlocks the complete Decision: 3 strongest choices,
      evidence status, direct source, total estimated cost, commute comparison, required-feature
      comparison, deposits/known fees, risk flags, recommendation, next action
- [ ] No subscription. No commissions. No landlord advertising. **No payment before value.**
- [ ] Fewer than three qualifying options → **customer pays $0**
- [ ] Events (§22), exact names: `landing_viewed`, `qualification_passed`, `mission_started`,
      `mission_submitted`, `candidate_found`, `three_candidates_found`, `preview_viewed`,
      `checkout_started`, `decision_purchased`, `source_clicked`, `mission_failed`

## Day 6 — end-to-end + mobile + creative (§21, §32)
- [ ] E2E on **3 synthetic test cases only — no fake customer evidence**
- [ ] Mobile funnel fixed
- [ ] Meta creative per §21: advertise **the moment**, not AI, not "travel nurse housing platform" —
      "Accepted the contract. Still don't know where you're living?" / "No card required to start."
- [ ] Meta ad account set to the applicable **Housing Special Ad Category**; **no** attempts to
      circumvent targeting restrictions (§20)

## Day 7 — founder gate (§20, §32)
- [ ] Factory acceptance: `make design-check SKU=../waimd-housing` (D18) ·
      `make closed-loop-check SKU=../waimd-housing` (D19) · `make caching-check SKU=../waimd-housing`
      (D22 — expected to pass at **0 call sites**)
- [x] **Founder approves the PRD** (2026-07-31)
- [ ] **`make waimd-ready` fully GREEN** — the founder's precondition for the money: beta built, evals
      tested, everything tested, production-grade. The gate exits non-zero until then.
- [ ] **Founder authorizes the $70** ($10/day × 7) — only after the gate is green
- [ ] Publish+charge (D5): flip Polar test→live with `PUBLISH_APPROVAL_TOKEN`
- [ ] Launch Meta; real customers replace test cases immediately

---

## Definition of Done (§ Definition of Done — the phase-exit condition)

> Stranger taps ad → WAIMD.org → confirms accepted assignment → submits real Housing Mission → founder
> sees it → candidates are evaluated → WAIMD produces three options → customer sees free evidence →
> pays $29 → receives Decision.

Anything less is not an MVP. It's pieces of an MVP.

## Metrics + kill criteria (§23, §24)

Run `make waimd-gate` (factory-side) — it computes these and prints the verdict.

| Metric | Definition | Target |
|---|---|---|
| Qualified Mission Acquisition Cost | ad spend / completed qualified missions | **≤ $14** |
| Mission Solvability | can we produce three qualifying options? | **≥ 80%** |
| Paid Decision Rate | purchases / completed solvable missions | **≥ 30%** |

- **KILL ACQUISITION** — $70 spent and <5 qualified missions → do not spend another $70 automatically.
- **KILL PROPOSITION** — 10 successfully fulfilled missions and 0 purchases → do not build more features.
- **INVESTIGATE** — 10 fulfilled, 1–2 purchases → interview behavior, change **one** variable.
- **CONTINUE** — 10 fulfilled, ≥3 purchases → we earned another iteration.
