# HEARTBEAT.md

Apex runs this evaluation loop every 6 hours via OpenClaw cron (delivery: Telegram). Cheap LLM
reasoning here uses an **OpenRouter free model** (`openrouter/free`) — $0, ~4 cycles/day, well under
the 50 req/day free cap. It does NOT touch the shared Anthropic pool.

## 1. Resource survival check — read + analyze BOTH pools (`node usage.mjs`)
Apex runs `usage.mjs` to READ and ANALYZE both constrained resources. They are NOT the same kind of thing:

1. **Claude — subscription plan usage (NOT a dollar pool).** Auth is the Max OAuth login (no API key
   anywhere on the box), so builds are covered by the plan and bill **$0 per-token**. The real
   constraint is the plan's **rate limits** (5-hour rolling + weekly). `usage.mjs` reads local Claude
   Code transcripts and reports consumption as an **API-equivalent $ proxy** for the 5h and 7d windows,
   with the **Opus share** called out — Opus burns the allowance fastest, so cheap steps (heartbeats,
   trend scans, tests) should route to Sonnet/Haiku. Hard-flags only against a budget you set in `.env`.
2. **Higgsfield — generation credits (a real, finite shared pool).** `usage.mjs` reads live credits via
   `higgsfield account status`. Every image/video spends it; below `HIGGSFIELD_MIN_CREDITS` → halt media.
3. **Stripe** net is read at gate-time (test phase = no charging yet).

**Verdict rule:** if Higgsfield is below its floor (or unreadable), **halt non-essential media FIRST**
(most expensive, genuinely depletable resource); then, if a set Claude budget is exceeded, drop
exploratory sub-agents and focus the conversion funnel. NEVER let this stall the loop — degrade, don't hang.

## 2. Market telemetry
1. Re-index the deployed MEP for search.
2. Track checkout drop-off. If abandonment > 60%, rewrite the Hormozi risk-reversal string (must
   pass the copywriter-auditor hook) and redeploy the preview. NOTE: a redeploy that changes the
   live charging surface still requires the publish+charge gate.

## 3. Agent health
1. Check `~/.tmux/sock` for dead `loop-operator` (Ralph) loops.
2. Restart stalled sub-agents automatically.
3. Verify the Higgsfield CLI token still works headless; if not, switch media to the graceful-skip
   path and flag it in the Telegram report rather than hanging.

## 4. The gate — never auto-flip
- HEARTBEAT NEVER flips the storefront to live charging. The switch from test → live Stripe requires
  the founder's `PUBLISH_APPROVAL_TOKEN` over Telegram. HEARTBEAT may *request* approval; it may not
  grant it.
