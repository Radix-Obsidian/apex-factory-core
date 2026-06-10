# SPEC — Apex Factory close-out slice (v1)

Spec-driven definition of "done" for wiring the factory to a **ready-to-fire** state.
Acceptance criteria are mechanical (`make verify`) so the slice is *proven*, not asserted.

## Frame
The factory is the **company** (the operator, "Apex"). It manufactures **products** —
each a separate SKU repo. This control plane (`apex-factory-core`, private) never becomes a
product. One factory, many SKUs. See [DECISIONS.md](DECISIONS.md) D4.

## The cycle (seams, in order)
1. **Trigger** — `make launch` (real) / `make dryrun` ($0) → `loop.sh`
2. **tmux** session on `~/.tmux/sock` — durable, re-attachable
3. **ECC loop-operator** runs [PRD.md](PRD.md) by TDD (dry: `LOOP_CMD` stub, zero shared-credit burn)
4. **copywriter-auditor** PreToolUse hook guards every Write/Edit (Godin / Hormozi / Enns)
5. **deploy** → `deploy-guard.sh preview` — forces TEST mode, refuses any `sk_live_` key
6. **build-to-PR** — loop-operator opens the SKU PR (real run)
7. **notify** — `openclaw system event` → Telegram
8. **heartbeat** — `heartbeat.sh` via OpenClaw cron (6h): P&L + dead-loop restart
9. **THE GATE** — `deploy-guard.sh publish` refuses live charging without the founder's token

## Acceptance criteria
| # | Criterion | Proof |
|---|-----------|-------|
| AC1 | preflight: tmux, claude, gh, railway, higgsfield present; `.env` loads | `make preflight` |
| AC2 | copy gate: generic copy rejected, on-framework passes | `make copytest` (tier-1 F1 75%) |
| AC3 | preview refuses a `sk_live_` key | `make guard-test` |
| AC4 | THE GATE refuses publish with no approval token (exit 2) | `make gate` |
| AC5 | end-to-end dry: loop → preview → notify, prints SHIPPED, $0 | `make dryrun` |
| AC6 | heartbeat detects a dead loop + reports health, $0 | `make heartbeat` |

## Out of scope tonight (by design, not omission)
- **Live charging** — gate sealed: `.env PUBLISH_APPROVAL_TOKEN` empty ⇒ fail-closed.
- **Stripe CLI / `stripe login`** — gate-time only; build-to-PR has no charge surface.
- **ralphy wrapper** — shelved (DECISIONS.md D1): untrusted, and loop-operator needs no wrapper.
- **The real overnight run** — wired + ready; firing it is a deliberate `make launch` (spends shared pools).

## Definition of done
`make verify` green · heartbeat cron registered (disabled) · pushed to `apex-factory-core`.
Human actions left: `make cron-enable`, then `make launch` to fire the first real cycle.
