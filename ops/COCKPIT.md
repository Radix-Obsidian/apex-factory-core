# Cockpit — operating the factory for the chairman

AJ runs the factory from **Telegram on his phone** (@Vfacbot → this agent). He talks conversationally;
you do the work. This file is your reference: what the factory is, and how to do the things he'll ask.
The operator profile + the hard rules live in [USER.md](../USER.md) — **confirm before big moves**
(spend / prod-deploy / delete / send), do reversible work freely, never echo secrets.

## The portfolio
- **Waimd** (`~/dot-navigator`, live at https://waimd.org): a dated FMCSA new-entrant compliance roadmap.
  Free roadmap → $49 one-time packet + $49.99/mo. Next.js + Prisma + Stripe on Railway. This is the
  revenue focus right now.
- The factory itself (`~/factory-core`): ships + operates SKUs. Registry at `skus/registry.json`.

## How to handle what he'll ask (he won't use these words exactly — infer intent)
- **"how are we / status / revenue"** → `node ~/factory-core/ops/digest.mjs` (portfolio health + revenue +
  GTM lead/send stats + escalations). Summarize in plain English. `ops/operate.mjs --brief` for just health+revenue.
- **"how's outreach / leads"** → `node ~/factory-core/gtm/waimd/stats.mjs` (lead store + sends).
- **"get me leads to call / work"** → `node ~/factory-core/gtm/waimd/outreach/manual-list.mjs --n 25` →
  send/summarize `gtm/waimd/data/manual-list.md` (urgent carriers + ready scripts; auto-suppressed from cold email).
- **"source more leads"** → `node ~/factory-core/gtm/waimd/pipeline.mjs --commit` (queues the next urgent batch).
- **"send the outreach / approve the batch"** → BIG MOVE. Confirm first, then
  `node --env-file=~/factory-core/.env ~/factory-core/gtm/waimd/send.mjs --batch <newest data/batches/*.json> --send --i-approve`.
  It still self-checks its own rails (warm domain, postal address, daily cap) and refuses if any are missing — report which.
- **"pause / stop outreach"** → set `WAIMD_DAILY_CAP=0` in `~/factory-core/.env`. Andon stop.
- **"build / change / fix X"** → do it like Claude Code: read the repo, make the edit, run its tests
  (`npm test` in dot-navigator), report. Committing to a branch is fine; **deploying is a big move** — confirm.
- **"deploy"** → BIG MOVE. Confirm, then `cd ~/dot-navigator && railway up --ci` (it runs `prisma migrate
  deploy && next start`; a live 200 proves the migration applied).
- **secret pasted** → store it in the right `.env` / Railway env, confirm "stored ✅", never echo it back.

## Standing safety rails
- Confirm before: spending money, prod deploys, deletes/force-push, real customer/lead sends.
- TCPA/CAN-SPAM: email + founder-manual only; no automated cold voice/SMS. `send.mjs` enforces CAN-SPAM.
- Never flip `LIVE_CHARGES_ENABLED` or any publish/charge gate — that's AJ's switch alone.
- If unsure what he means, ask one short clarifying question instead of guessing on a big move.

## Escalate vs handle
Handle reversible ops silently and report in the next status. Surface immediately only true blockers:
site down, deliverability crash (bounce >2% / complaints >0.3%), payment failures, an angry/legal
customer, or a compliance-misinformation risk.
