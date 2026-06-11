# AGENTS.md — Apex Workspace

Cross-harness operating contract (ECC reads this across Claude Code / Cursor / Codex / OpenCode).

## Memory architecture
PARA-based, decaying, to prevent context bloat.
- `~/life/projects/` — active SKU development (e.g. `sku_001`).
- `~/life/archives/` — failed experiments and dead code.
- SKU thesis + summary live in `~/life/projects/sku_<n>/summary.md`.

## Toolchain & access — ACTUAL state (not aspirational)

| Tool | Status | Function |
|------|--------|----------|
| `gh` | ✅ authed (Radix-Obsidian) | Repo creation, CI/CD, PRs |
| `railway` | ✅ authed | Deploy target — `railway init` / `railway up` (in-loop) |
| `higgsfield` (CLI) | ✅ installed + authed (OAuth, no key) | Image/video generation, headless |
| Higgsfield MCP | ✅ connected (OAuth) | Interactive media via `mcp.higgsfield.ai/mcp` |
| `openclaw` | ✅ configured + heartbeat cron ENABLED | Cron scheduling + Telegram delivery |
| `claude` (ECC `loop-operator`) | ✅ Sonnet 4.6 default (Opus via `LOOP_MODEL`) | The Ralph loop / TDD agents — see [MODELS.md](MODELS.md) |
| `stripe` (CLI) | ⏳ deferred to gate-time (no charge surface pre-gate) | Payment links, webhooks |
| `tmux` | ✅ installed | Long-running loop socket |
| ECC + AgentShield | ✅ installed (scoped: core, global hooks off) | Hooks, agents, secret scanning |
| `ralphy` | ⛔ NOT installed by design | Untrusted until AgentShield clears it; never handles secrets |

## Model lineup (audited 2026-06-11 — see [MODELS.md](MODELS.md))
Right model for the right task, not Opus-by-default. **Sonnet 4.6** = build/codegen/copy workhorse ·
**Haiku 4.5** = cheap/bounded/high-frequency (trend scan, media prompts) · **OpenRouter free** ($0) =
eval judges + heartbeat narration · **Opus 4.8** = rationed escalation for the hardest reasoning only ·
copywriter-auditor + tier-1 eval stay **pure code** (no model). Agents authenticate from
`CLAUDE_CODE_OAUTH_TOKEN` (subscription, $0/token); `loop.sh` unsets `ANTHROPIC_API_KEY` so it always wins.

## Permissions
Apex may use the ✅ tools without per-action confirmation for any REVERSIBLE action. The single
exception is the publish+charge gate: flipping live Stripe billing always requires the founder's
`PUBLISH_APPROVAL_TOKEN`.

## Secrets
Only in gitignored `~/factory-core/.env`, referenced by name. Never in chat, never committed, never
inline in `mcp.json`. Higgsfield needs no key (OAuth).
