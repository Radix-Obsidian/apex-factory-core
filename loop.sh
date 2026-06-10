#!/usr/bin/env bash
# loop.sh — the "Ralph loop" for the Apex factory.
# Runs ECC's loop-operator against PRD.md inside a tmux session on the stable socket,
# pings Telegram via OpenClaw on exit. ralphy is intentionally NOT used (untrusted until
# AgentShield clears it).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

SOCK="$HOME/.tmux/sock"
SESSION="${SESSION:-factory}"
MAX_ITERS="${MAX_ITERS:-25}"
PRD_FILE="${PRD_FILE:-$HERE/PRD.md}"   # override for dry-runs: PRD_FILE=evals/dryrun-PRD.md

load_env() { if [ -f "$HERE/.env" ]; then set -a; . "$HERE/.env"; set +a; fi; }

run_loop() {
  load_env
  mkdir -p "$HERE/runs"
  local log="$HERE/runs/loop.log" i=0 ec=0
  : > "$log"
  while [ "$i" -lt "$MAX_ITERS" ]; do
    i=$((i+1))
    echo "=== Ralph iteration $i / $MAX_ITERS ($(date -u +%FT%TZ)) ===" | tee -a "$log"
    # Once ECC is installed, `claude` has the loop-operator + TDD agents available.
    # --dangerously-skip-permissions = unattended mode; the publish+charge gate is enforced
    # both in-prompt AND by the deploy guard, so this never charges customers on its own.
    if [ -n "${LOOP_CMD:-}" ]; then
      # Dry-run/plumbing override (e.g. LOOP_CMD='echo ALL_DONE') — no claude, no shared-credit burn.
      bash -c "$LOOP_CMD" >>"$log" 2>&1 || ec=$?
    else
      claude -p "Act as the ECC loop-operator. Execute the next incomplete step in $PRD_FILE using TDD. Obey .cursorrules, SOUL.md, HEARTBEAT.md. HARD STOP at the publish+charge gate — never flip live Stripe. When every PRD checkbox is complete, print the literal token ALL_DONE and stop." \
        --dangerously-skip-permissions >>"$log" 2>&1 || ec=$?
    fi
    if grep -q "ALL_DONE" "$log"; then echo "ALL_DONE — loop complete." | tee -a "$log"; break; fi
  done
  openclaw system event --text "🏭 factory loop finished after $i iters (exit $ec)" --mode now 2>/dev/null || true
  echo "SHIPPED:$ec" | tee -a "$log"
}

case "${1:-launch}" in
  __run) run_loop ;;
  launch)
    command -v tmux   >/dev/null || { echo "tmux missing — brew install tmux"; exit 1; }
    command -v claude >/dev/null || { echo "claude CLI missing"; exit 1; }
    mkdir -p "$(dirname "$SOCK")"   # ensure ~/.tmux exists or tmux can't create the socket
    if tmux -S "$SOCK" has-session -t "$SESSION" 2>/dev/null; then
      echo "session '$SESSION' already running on $SOCK"; exit 0
    fi
    tmux -S "$SOCK" new -d -s "$SESSION" "bash '$HERE/loop.sh' __run; echo done; sleep 10"
    echo "Launched tmux '$SESSION' on $SOCK."
    echo "Watch:  tmux -S $SOCK attach -t $SESSION"
    echo "Log:    tail -f $HERE/runs/loop.log"
    ;;
  *) echo "usage: loop.sh [launch|__run]"; exit 1 ;;
esac
