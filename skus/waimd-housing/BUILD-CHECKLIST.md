# waimd-housing — build checklist + decision-engine contract

The loop's phased acceptance checklist for the `waimd-housing` DomainPack. Each `[ ]` is a testable
build target. The **decision engine** and **evidence model** below are the deterministic contract the
build must implement — the model *explains* the score, it must never *invent* it.

---

## Decision-engine contract (deterministic)

A **Housing Mission** (the confirmed assignment + constraints) is scored against each **candidate**.

### Phase A — hard gates (pass/fail, applied first; a fail disqualifies)
1. **Commute gate** — candidate within the mission's max commute to the facility anchor.
2. **Budget gate** — total monthly cost ≤ budget ceiling.
3. **Date gate** — available on/before the assignment start date; lease term covers the contract length.
4. **Hard-requirement gate** — every declared hard requirement met (pets / parking / furnished / etc.).
5. **Evidence gate** — the facts the above gates rely on are at least **CHECKED** (never gate on a bare
   LISTED claim; fail-closed — unknown/stale is treated as *not met*, never as *met*).

### Phase B — 100-point score (ranks the survivors)
| Weight | Dimension            | Basis                                                            |
|-------:|----------------------|-----------------------------------------------------------------|
|     30 | Budget headroom      | how far under the ceiling (more margin → higher)                 |
|     25 | Commute quality      | shorter / simpler commute to the anchor                         |
|     20 | Date confidence      | move-in and lease-term fit, weighted by evidence freshness      |
|     15 | Evidence strength    | CONFIRMED > CHECKED; penalize staleness                         |
|     10 | Preference match     | soft preferences (furnished, neighborhood, amenities)           |

Ties broken by evidence strength, then budget headroom. Output the **top 3**; if fewer than 3 survive
the hard gates, **no charge / refund** (the offer's honesty guarantee).

---

## Evidence model — LISTED → CHECKED → CONFIRMED (fail-closed)

Every customer-facing fact (price, availability, lease term, commute) carries a state + an `as_of`
timestamp. Certainty is earned, never assumed — mirrors the factory's `kill-guard` posture (unknown → refuse).

- **LISTED** — asserted by a source we ingested; unverified. Never shown as certain; never gates.
- **CHECKED** — re-derived/validated by us (fetch, compute, cross-reference) at `as_of`. Gates may use it.
- **CONFIRMED** — verified against an authoritative signal at `as_of`. Required before any "confirmed
  available" language ships.
- **Staleness:** a state decays with age; past its TTL it drops toward LISTED. A stale fact is **never**
  CONFIRMED. The honesty-auditor (`hooks/honesty-auditor.mjs`) blocks any un-timestamped certainty in copy.

---

## Phase checklist

### Phase 0 — scaffold
- [ ] `gh repo create Radix-Obsidian/waimd-housing --private --template Radix-Obsidian/chassis` *(founder)*
- [ ] DomainPack skeleton wired to the chassis spine (auth, cached `llm` wrapper, billing, deploy)

### Phase 1 — data model (Supabase / Postgres)
- [ ] `missions` (assignment city, anchor, start_date, contract_len, budget, hard_reqs, prefs) — anonymous
- [ ] `candidates` (source listing) + `candidate_facts` (fact, value, evidence_state, as_of, source)
- [ ] `decisions` (mission_id, ranked candidate_ids, scores, rationale, created_at)
- [ ] `orders` (mission_id, stripe_ref, amount, status) — charge tied to a 3-option decision

### Phase 2 — engine
- [ ] Phase-A hard gates (commute / budget / date / hard-req / evidence), fail-closed
- [ ] Phase-B 100-pt scorer (weights above) + top-3 selection + tie-breaks
- [ ] "fewer than 3 → no-charge/refund" path
- [ ] Rationale generator: model narrates the deterministic breakdown (explains, never invents)
- [ ] Unit tests: gates disqualify correctly; scoring is deterministic; stale fact never CONFIRMED

### Phase 3 — surface
- [ ] Anonymous mission intake (no account)
- [ ] Decision page: 3 ranked choices, per-choice score breakdown + rationale + per-fact evidence chips
- [ ] Copy passes the copywriter-auditor **and** honesty-auditor hooks
- [ ] Voco Technologies, Inc. (Dover DE) footer + ".org = commercial product, not a nonprofit" disclaimer

### Phase 4 — money + acquisition (TEST)
- [ ] Stripe **$29 one-time, TEST mode**; charge only on a 3-option decision; refund/no-charge otherwise
- [ ] Meta funnel events: impression → mission-start → decision → paid (cost-per-decision measurable)
- [ ] Meta ad account set to the **Housing Special Ad Category**

### Phase 5 — factory acceptance (from apex-factory-core)
- [ ] `make design-check SKU=../waimd-housing` (D18 — brand kit)
- [ ] `make closed-loop-check SKU=../waimd-housing` (D19 — owns the outcome)
- [ ] `make caching-check SKU=../waimd-housing` (D22 — model calls via cached wrapper)

### Phase 6 — validation gate (founder)
- [ ] Publish+charge (D5): flip Stripe test→live with `PUBLISH_APPROVAL_TOKEN`
- [ ] $70 spend ($10/day × 7) → ≥10 qualified missions → **≥3 paid decisions** = validated; else pivot/kill
