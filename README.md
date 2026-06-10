# 🏭 Apex — The Native Factory control plane

Autonomous MEP factory: research → TDD build → media → preview deploy → PR → Telegram ping,
**halting at the publish+charge gate**. Built on ECC + OpenClaw + Railway + Higgsfield.

Read order for agents: `IDENTITY.md` → `SOUL.md` → `.cursorrules` → `AGENTS.md` → `HEARTBEAT.md` → `PRD.md`.

---

## ✅ Done (scaffolded + verified)

| Item | State |
|------|-------|
| `~/factory-core` git repo + all config files | ✅ written |
| `.cursorrules`, `IDENTITY/SOUL/HEARTBEAT/AGENTS.md`, `mcp.json`, `PRD.md` | ✅ written (corrected vs blueprint) |
| `loop.sh` (tmux + ECC loop-operator + OpenClaw exit ping) | ✅ written, `chmod +x` |
| `hooks/copywriter-auditor.mjs` (Godin/Hormozi/Enns gate) | ✅ written + **tested** (blocks generic, passes on-framework) |
| `tmux` 3.6b | ✅ installed |
| Higgsfield CLI headless | ✅ **verified** — cached token works in a clean shell; `model list` API call succeeded |
| OpenRouter free tier for heartbeats | ✅ $0 plan confirmed (50 req/day, no card) |

## 👤 You run these (the harness gated them on purpose — external code / persistence / agent-config)

Each was blocked by Claude Code's auto-mode classifier because it executes external code, establishes
a self-restarting autonomous loop, or modifies agent config. Those are deliberate acts — yours to run.

**1. Install ECC** (external code). Source-verified: npm package is `ecc-universal`, NOT `ecc-install`.
ECC's README *recommends the Claude Code plugin* and warns against stacking installers.
```bash
# Recommended — run as slash commands inside Claude Code (not bash):
#   /plugin marketplace add https://github.com/affaan-m/ECC
#   /plugin install ecc@ecc
# Manual fallback only (don't stack with the plugin):
cd ~/factory-core && npx -y ecc-universal --help     # or clone + ./install.sh --profile minimal --target claude
```

**2. Baseline AgentShield scan** (external code — proves no secret leaks before any push)
```bash
cd ~/factory-core && npx ecc-agentshield scan
```

**3. Register the copywriter-auditor hook** (agent-config). Either merge `hooks/hooks.fragment.json`
into ECC's `hooks/hooks.json` after step 1, OR add it to project settings:
```bash
# the fragment is ready at ~/factory-core/hooks/hooks.fragment.json
# merge its "PreToolUse" entry into ~/factory-core/.claude/settings.json (create the file)
```

**4. Heartbeat cron** (self-restarting persistence — disabled by default). Run when ready:
```bash
openclaw cron add --name factory-heartbeat --every 6h --disabled \
  --agent main --model anthropic/claude-haiku-4-5 --thinking low \
  --announce --channel telegram --to <YOUR_TELEGRAM_CHAT_ID> \
  --description "Apex P&L + agent health. Never flips the publish+charge gate." \
  --message "Execute ~/factory-core/HEARTBEAT.md: P&L across the SHARED Anthropic+Higgsfield pools + Stripe net; market telemetry; restart dead loop-operator tmux loops; verify higgsfield headless token. Report shipped/failed/scaling WITH numbers. NEVER flip live Stripe."
# then enable with:  openclaw cron enable factory-heartbeat
```

## ⏳ Founder prerequisites before the first real run

- **`.env`** — `cp .env.example .env`, fill `STRIPE_SECRET_KEY` (a **restricted** test key for run #1),
  `STRIPE_PUBLISHABLE_KEY` (pk_test_), `OPENROUTER_API_KEY` (free tier), Telegram token/chat id,
  `PUBLISH_APPROVAL_TOKEN`. **Higgsfield needs no key** (OAuth, already authed).
- **Roll the leaked `sk_live_` key** from earlier in chat — treat it as compromised.
- **Stripe CLI** — brew's current release asset 404'd (yanked `v1.42.5`). Not needed for run #1
  (test mode uses the SDK). When you want it: grab a known-good release from
  github.com/stripe/stripe-cli/releases, or `brew install --HEAD`. Then `stripe login` (interactive).

## ▶️ Launch (after steps 1–4 + `.env`)

```bash
# dry-run the loop against a throwaway PRD first, then:
bash ~/factory-core/loop.sh           # launches tmux session 'factory' on ~/.tmux/sock
tmux -S ~/.tmux/sock attach -t factory   # watch
tail -f ~/factory-core/runs/loop.log     # or follow the log
```

The loop stops at the publish+charge gate and pings Telegram with the preview URL + build cost.
Nothing charges a real customer until you reply with `PUBLISH_APPROVAL_TOKEN`.

## 🔭 Known follow-ups
- For **$0 heartbeats**, add an OpenRouter free model to OpenClaw's `models.json` (currently the cron
  job uses Haiku — pennies/day, but not zero). HEARTBEAT.md already specifies OpenRouter-free reasoning.
- `ralphy` stays uninstalled until `ecc-agentshield scan` clears it (guardrail). The loop runs on ECC
  `loop-operator` regardless.
