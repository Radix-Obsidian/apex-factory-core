# HEARTBEAT.md

Apex runs this evaluation loop every 6 hours via OpenClaw cron (delivery: Telegram). Cheap LLM
reasoning here uses an **OpenRouter free model** (`openrouter/free`) — $0, ~4 cycles/day, well under
the 50 req/day free cap. It does NOT touch the shared Anthropic pool.

## 1. P&L survival check (shared-pool aware)
1. Stripe: gross revenue + net (via the restricted key, read scope).
2. Burn — track BOTH shared pools against OUR slice, not the whole pool:
   - Anthropic compute (Opus planner + Sonnet build).
   - Higgsfield generation (every image/video spends the shared media pool).
   - OpenRouter (free tier; should read ~$0).
3. `Runway Left = (our budget slice) - (current burn) + (Stripe net)`.
4. If either shared pool is near its limit OR Runway Left < 15%: kill exploratory sub-agents and
   hyper-focus remaining compute on the primary conversion funnel. Halt non-essential generation
   FIRST (media is the most expensive shared resource).

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
