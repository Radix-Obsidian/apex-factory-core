#!/usr/bin/env bash
# heartbeat.sh — mechanical health + P&L snapshot. Run by OpenClaw cron every 6h (Telegram).
# $0: reads only local state + cached tokens. Degrades gracefully where data isn't wired yet.
# NEVER prints a secret value.
set -uo pipefail   # NOT -e: a heartbeat must never die mid-check
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && { set -a; . "$HERE/.env"; set +a; }
SOCK="$HOME/.tmux/sock"; SESSION="${SESSION:-factory}"

echo "🏭 Apex HEARTBEAT — $(date -u +%FT%TZ)"

# 1. Agent health — restart a dead loop (HEARTBEAT.md §3)
if tmux -S "$SOCK" has-session -t "$SESSION" 2>/dev/null; then
  echo "• loop: ALIVE ($SESSION)"
else
  echo "• loop: DEAD — restarting"
  if [ -n "${DRY_RESTART:-}" ]; then
    echo "  ↳ (dry: would relaunch via loop.sh — DRY_RESTART set, no credit burn)"
  elif bash "$HERE/loop.sh" launch >/dev/null 2>&1; then echo "  ↳ relaunched"; else echo "  ↳ relaunch skipped (claude/tmux not ready)"; fi
fi

# 2. Media token (Higgsfield headless) — HEARTBEAT.md §3
if command -v higgsfield >/dev/null && higgsfield auth token >/dev/null 2>&1; then
  echo "• higgsfield: token OK (headless media available)"
else
  echo "• higgsfield: token MISSING — media on graceful-skip path"
fi

# 3. P&L survival (shared-pool aware) — HEARTBEAT.md §1. Honest about what's not wired yet.
if [ -n "${STRIPE_SECRET_KEY:-}" ]; then echo "• stripe: configured (net read at gate-time)"; else echo "• stripe: n/a (test phase — no charging)"; fi
echo "• openrouter heartbeat burn: ~\$0 (free tier)"
if [ -n "${PUBLISH_APPROVAL_TOKEN:-}" ]; then echo "• gate: ARMED (token set)"; else echo "• gate: SEALED (no token — cannot charge)"; fi
echo "  ↳ Anthropic + Higgsfield are SHARED across 3 projects — burn conservatively; halt media first."
