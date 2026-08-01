# ops/ — the post-launch operations layer (D20)

The factory had a complete **pre-launch** line (ideate → kill → build → eval → gate → ship → notify →
heartbeat) and nothing after a SKU went live. This is the missing half: the loop that **operates** each
shipped SKU — watches its health, reads its revenue, triages its support — so "the agents manage, operate,
and scale each SKU" is real code, not an aspiration.

It is deliberately the same shape as the rest of the factory: **deterministic `.mjs` cores ($0, no LLM,
never hang), with the LLM judgment layered on top as agents.** Everything degrades to `n/a` rather than
fabricating a number (METHOD §5), and every irreversible action stops at the founder (the andon cord, D5).

## The registry — what the loop iterates

[`skus/registry.json`](../skus/registry.json) (contract: [`skus/schema/sku.schema.json`](../skus/schema/sku.schema.json))
is the portfolio. One entry per shipped SKU: repo, live URL, deploy target, billing (with the **NAME** of a
read-only Stripe key env var — never the key), support source, owning agents, and any `pending_founder_actions`.

## The operators (deterministic, $0)

| Module | What it does | Degrades to |
|---|---|---|
| `registry.mjs` | load + structural-validate + iterate the registry | — |
| `canary.mjs` | one bounded HTTPS health probe per live SKU → OK/SLOW/DEGRADED/DOWN | `NO_URL` |
| `revenue.mjs` | per-SKU Stripe subscription read → paying MRR (trials excluded), committed MRR, ARR | `n/a` if key unset |
| `support.mjs` | triage the inbox; **escalate** irreversible items, **stage** the rest to draft | empty if no inbox |
| `operate.mjs` | one tick = canary + revenue + support over every live SKU; appends `runs/operate.jsonl` | — |

## The agents (judgment, gated)

- **factory-operator** (Sonnet) runs `node ops/operate.mjs --json`, narrates the portfolio, delegates support
  drafting, and surfaces escalations. Takes no irreversible action.
- **factory-support** (Haiku) drafts replies grounded in the SKU's own docs. Never sends; never drafts an
  irreversible action.

## Commands

```bash
make sku-list          # the portfolio
make sku-validate      # structural-validate the registry ($0)
make canary            # health of every live SKU (exit≠0 if any DOWN/DEGRADED)
make portfolio         # per-SKU + total revenue (n/a without a read-only key)
make support-triage    # triage + founder escalations ($0)
make operate           # ONE deterministic tick over all live SKUs
make ops-verify        # the deterministic tests ($0 LLM)
```

The `--brief` form of `operate.mjs` is folded into `heartbeat.sh`, so the 6h OpenClaw heartbeat now reports a
per-SKU health + revenue snapshot. The full LLM tick (drafting replies, narrating, escalating) is the
factory-operator agent's job — run it via `make operate` then have the operator act on the JSON.

## Wiring a SKU's revenue (founder, one-time)

Create a **restricted, read-only** key for the SKU's provider, put it in `factory-core/.env` under the
`secret_env` **name** from the registry (e.g. `WAIMD_HOUSING_POLAR_RO_KEY=…`), and `make portfolio` flips
from `n/a` to live numbers. Read-only by design: the loop reads revenue, it never moves money. The
registry stores the env var NAME only — `ops/registry.mjs` rejects a pasted raw token in `secret_env`.

> **Stripe is RETIRED (D28).** Every Stripe paywall is dead — the validator rejects a `stripe` provider
> in any mode other than `killed`. `revenue.mjs` is still a Stripe-only reader, so it reports
> `n/a — <provider> revenue reader not implemented` for Polar rather than sending a Polar credential to
> `api.stripe.com`. **A Polar revenue reader is not built yet** (no credentials to test against, and this
> reader handles subscriptions only, which cannot measure a one-time SKU). `make portfolio` therefore
> reports `n/a` for `waimd-housing` — that is honest, not broken.

## Adding the next SKU

Append an entry to `skus/registry.json`, `make sku-validate`, and the loop picks it up on the next tick — no
code change. (Phase 3's `chassis` template ships every new SKU with the health endpoint, billing wiring, and a
`SupportTicket` model the support source reads from, so registration is the only manual step.)
