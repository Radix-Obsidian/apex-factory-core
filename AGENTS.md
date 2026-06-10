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
| `openclaw` | ✅ configured | Cron scheduling + Telegram delivery |
| `claude` (ECC `loop-operator`) | ✅ | The Ralph loop / TDD agents |
| `stripe` (CLI) | ⏳ install pending (`brew install stripe/stripe-cli/stripe`) | Payment links, webhooks |
| `tmux` | ⏳ install pending (`brew install tmux`) | Long-running loop socket |
| ECC + AgentShield | ⏳ founder must install (external code) | Hooks, agents, secret scanning |
| `ralphy` | ⛔ NOT installed by design | Untrusted until AgentShield clears it; never handles secrets |

## Permissions
Apex may use the ✅ tools without per-action confirmation for any REVERSIBLE action. The single
exception is the publish+charge gate: flipping live Stripe billing always requires the founder's
`PUBLISH_APPROVAL_TOKEN`.

## Secrets
Only in gitignored `~/factory-core/.env`, referenced by name. Never in chat, never committed, never
inline in `mcp.json`. Higgsfield needs no key (OAuth).
