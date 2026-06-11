#!/usr/bin/env bash
# heartbeat.sh — mechanical health + P&L snapshot. Run by OpenClaw cron every 6h (Telegram).
# $0: reads only local state + cached tokens. Degrades gracefully where data isn't wired yet.
# NEVER prints a secret value.
set -uo pipefail   # NOT -e: a heartbeat must never die mid-check
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && { set -a; . "$HERE/.env"; set +a; }
SOCK="$HOME/.tmux/sock"; SESSION="${SESSION:-factory}"
# The loop runs in its own worktree (D12) — its liveness marker lives there, not in the main tree.
. "$HERE/scripts/worktree.sh" 2>/dev/null || true
LOOP_RUNS="${LOOP_WORKTREE:-$HERE}/runs"

echo "🏭 Apex HEARTBEAT — $(date -u +%FT%TZ)"

# 1. Agent health — restart a dead loop (HEARTBEAT.md §3)
if tmux -S "$SOCK" has-session -t "$SESSION" 2>/dev/null; then
  echo "• loop: ALIVE ($SESSION)"
elif [ -f "$LOOP_RUNS/loop.active" ]; then
  # marker present + session gone = it was launched and CRASHED → recover (production resilience)
  echo "• loop: CRASHED — recovering"
  if [ -n "${DRY_RESTART:-}" ]; then
    echo "  ↳ (dry: would relaunch via loop.sh — DRY_RESTART set, no credit burn)"
  elif bash "$HERE/loop.sh" launch >/dev/null 2>&1; then echo "  ↳ relaunched"; else echo "  ↳ relaunch skipped (claude/tmux not ready)"; fi
else
  # no marker = never launched → do NOT cold-start the factory on a timer; first launch is deliberate
  echo "• loop: idle (not launched) — awaiting \`make launch\`; heartbeat recovers crashes, it does not cold-start"
fi

# 2. Media token (Higgsfield headless) — HEARTBEAT.md §3
if command -v higgsfield >/dev/null && higgsfield auth token >/dev/null 2>&1; then
  echo "• higgsfield: token OK (headless media available)"
else
  echo "• higgsfield: token MISSING — media on graceful-skip path"
fi

# 3. Resource analysis — READ + ANALYZE both constrained pools (HEARTBEAT.md §1).
#    Claude = subscription plan usage ($0 billed; proxy $ for consumption); Higgsfield = live credits.
node "$HERE/usage.mjs" || echo "• usage analyzer unavailable (node?) — skipping resource read"

# 4. Treasury + gate
if [ -n "${STRIPE_SECRET_KEY:-}" ]; then echo "• stripe: configured (net read at gate-time)"; else echo "• stripe: n/a (test phase — no charging)"; fi
if [ -n "${PUBLISH_APPROVAL_TOKEN:-}" ]; then echo "• gate: ARMED (token set)"; else echo "• gate: SEALED (no token — cannot charge)"; fi
