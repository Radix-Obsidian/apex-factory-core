# Chairman cockpit — run the factory from Telegram

The founder (AJ) is chairman of the factory and its SKUs. The cockpit is **Telegram on the Pixel 10 Pro**:
- **Push:** a daily digest + instant escalation alerts arrive automatically (OpenClaw cron → `ops/digest.mjs --send`).
- **Pull/act:** AJ DMs the paired bot in plain English; the paired OpenClaw agent runs the deterministic ops scripts below and replies. No custom bot — this is OpenClaw pairing routing DMs to an agent with shell access to `~/factory-core`.

This file is the agent's playbook. **You only act on what AJ asks. Nothing irreversible without an explicit command from him.** All scripts are $0/deterministic; report real numbers, never invent them.

## Command vocabulary

| AJ says (any phrasing) | You run | Then |
|---|---|---|
| "status" / "report" / "how are we" | `node ~/factory-core/ops/digest.mjs --json` | Summarize in plain English: per-SKU health, revenue, GTM lead/send stats, escalations, pending actions. |
| "revenue" / "money" | `node ~/factory-core/ops/operate.mjs --brief` | Report paying MRR per SKU. |
| "leads" / "gtm" | `node ~/factory-core/gtm/waimd/stats.mjs` | Report store total, queued, sent (7d/total), suppressed. |
| "source leads" / "refresh leads" | `node ~/factory-core/gtm/waimd/pipeline.mjs --commit --json` | Report how many new leads queued + the batch file. |
| "manual list" / "give me leads to call" | `node ~/factory-core/gtm/waimd/outreach/manual-list.mjs --n 25` | Send/summarize `gtm/waimd/data/manual-list.md` (top-urgent carriers + scripts). |
| "approve the waimd batch" / "send it" | `node --env-file=~/factory-core/.env ~/factory-core/gtm/waimd/send.mjs --batch <newest data/batches/*.json> --send --i-approve` | **The DM IS the approval.** Only proceed if `send.mjs` preflight rails pass; if a rail is missing (warmup env, postal address, daily cap), report exactly which and do NOT send. |
| "pause sending" / "stop outreach" | Set `WAIMD_DAILY_CAP=0` in `~/factory-core/.env` | Andon stop — the sender refuses immediately. Confirm done. |
| "resume sending at N" | Set `WAIMD_DAILY_CAP=N` in `~/factory-core/.env` | Confirm new cap. |
| reply to an escalation | per his instruction | Do exactly what he says; if it's a support reply, draft it and confirm before sending. |

## Hard rails (never cross without an explicit, specific command)
- Never flip `LIVE_CHARGES_ENABLED` or any publish/charge gate — that's the founder's D5 switch.
- Never send cold email unless `send.mjs`'s own rails pass AND AJ said to send.
- Never automate cold voice/SMS (TCPA). Phone/SMS = inbound or founder-manual only.
- Never delete data, force-push, or change DNS/Stripe/billing from a chat command. If asked, confirm it's truly intended and that it's reversible first.
- If unsure what he means, ask one clarifying question rather than guessing.

## Escalation (what reaches him unprompted)
The digest + heartbeat surface only what needs a human: site down, deliverability crash (bounce >2% / complaints >0.3%), payment failures, an angry/legal customer, or a compliance-misinformation risk. Everything else the factory handles silently and reports in the daily digest.
