# CLAUDE.md — Apex Factory front door

The single entrypoint for any agent or human landing in this repo. This is the **control
plane** ("Apex") — the company/operator. It manufactures **SKUs** (separate product repos); it
never becomes a product itself (DECISIONS.md D4). One factory, many SKUs.

## What this repo is
Autonomous MEP factory: research → TDD build → media → preview deploy → PR → Telegram ping,
**halting at the publish+charge gate**. The only scoreboard is Stripe revenue.

## Read order (load these in sequence before acting)
1. [IDENTITY.md](IDENTITY.md) — who Apex is, the financial survival wall.
2. [SOUL.md](SOUL.md) — voice, posture, the one thing never freelanced.
3. [.cursorrules](.cursorrules) — the binding "physics engine" rules.
4. [AGENTS.md](AGENTS.md) — cross-harness operating contract, toolchain state, permissions.
5. [HEARTBEAT.md](HEARTBEAT.md) — the 6h survival/health loop.
6. [PRD.md](PRD.md) — the current build target (SKU 1), TDD acceptance checklist.

Supporting: [SPEC.md](SPEC.md) (close-out acceptance map) · [MODELS.md](MODELS.md) (model
ladder + agent roster) · [DECISIONS.md](DECISIONS.md) (decision log — don't relitigate).

## The org map — where everything lives
[**ORG.md**](ORG.md) is the company's single source-of-truth index: every repo and its state
(and, as later slices land, assets / marketing campaigns / finance / experiments).

- **ORG.md is GENERATED — never hand-edit it.** Source of truth = the JSONL files in
  [`registry/`](registry/). Edit those, then re-render.
- Update the map: edit `registry/*.jsonl` → `make org-render` → commit.
- Audit the map: `make org-verify` (schema + integrity + reproducibility checks, $0).

## Two gates (do not conflate)
- **Adversarial kill-pass** (idea stage, `recycled/`): 3 skeptics must unanimously clear 5 bars
  at confidence ≥ 0.6, or the opportunity is killed (default-to-kill).
- **Publish+charge gate** (ship stage, `deploy-guard.sh publish`): the single irreversible
  boundary — fail-closed; only the founder's `PUBLISH_APPROVAL_TOKEN` opens it.

## Common commands
- `make help` — list all targets.
- `make verify` — mechanical acceptance checks (preflight + guard + gate).
- `make org-verify` / `make org-render` — validate / regenerate the org map.
- `make recycled-verify` — salvage-harness guardrail tests.
- `make dryrun` — full $0 end-to-end gated slice.

## Hard rules (full text in .cursorrules)
- No secrets in chat/commits/`mcp.json`; keys only in gitignored `.env`, by name.
- TDD: failing test first → implement → green before deploy.
- Stripe TEST mode only until the founder opens the gate. No human-in-the-loop for anything
  *reversible*; the publish+charge flip is the one exception.
