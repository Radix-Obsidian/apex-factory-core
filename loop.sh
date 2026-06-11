#!/usr/bin/env bash
# loop.sh — the "Ralph loop" for the Apex factory. Runs the ECC loop-operator against PRD.md inside a
# tmux session, delegating tasks to the factory-* agents (each pinned to its rung in the model ladder —
# see MODELS.md). Hardened for unattended overnight runs: pre-flight auth, per-iteration timeout,
# failure backoff + circuit breaker, in-loop allowance gate, crash marker + immediate Telegram alert.
# ralphy is intentionally NOT used (untrusted until AgentShield clears it).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

SOCK="$HOME/.tmux/sock"
SESSION="${SESSION:-factory}"
MAX_ITERS="${MAX_ITERS:-25}"
PRD_FILE="${PRD_FILE:-$HERE/PRD.md}"        # override for dry-runs: PRD_FILE=evals/dryrun-PRD.md
LOOP_MODEL="${LOOP_MODEL:-claude-sonnet-4-6}" # Rung 2 default; escalate a whole run with LOOP_MODEL=claude-opus-4-8
ITER_TIMEOUT="${ITER_TIMEOUT:-1800}"        # hard cap per iteration (s) — a hung MCP/network call can't run all night
MAX_FAILS="${MAX_FAILS:-3}"                 # consecutive failures before the circuit breaker trips

# `timeout` is GNU coreutils — not always on macOS. Degrade gracefully (gtimeout, else no cap).
TIMEOUT_BIN="$(command -v timeout 2>/dev/null || command -v gtimeout 2>/dev/null || true)"
runto() { local s="$1"; shift; if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" "$s" "$@"; else "$@"; fi; }
load_env() { if [ -f "$HERE/.env" ]; then set -a; . "$HERE/.env"; set +a; fi; }
alert() { openclaw system event --text "$1" --mode now 2>/dev/null || true; }

run_loop() {
  mkdir -p "$HERE/runs"
  touch "$HERE/runs/loop.active"             # crash marker FIRST — before anything that can fail under set -e
  # On an UNEXPECTED death (set -e), fire an immediate alert and LEAVE the marker so the heartbeat recovers.
  trap 'rc=$?; [ "$rc" -ne 0 ] && alert "🔴 factory loop aborted (exit $rc) — see runs/loop.log"' EXIT

  load_env || true                            # missing/bad .env should degrade, not halt
  unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN # CLAUDE_CODE_OAUTH_TOKEN (subscription) must win the precedence chain

  # Rotate the prior log (preserve crash forensics across restarts), keep the last 5, then start fresh.
  local log="$HERE/runs/loop.log"
  [ -f "$log" ] && mv "$log" "${log%.log}.$(date -u +%Y%m%dT%H%M%S).log" 2>/dev/null || true
  ls -1t "$HERE"/runs/loop.*.log 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
  : > "$log"; rm -f "$HERE/runs/done.flag" "$HERE/runs/.fable-budget"   # reset the Fable per-run budget

  # Pre-flight auth: one cheap Haiku ping distinguishes an expired token from a real build error.
  if [ -z "${LOOP_CMD:-}" ]; then
    if ! runto 90 claude -p "Reply only: OK" --model claude-haiku-4-5-20251001 >/dev/null 2>&1; then
      alert "🔴 factory auth FAILED (token expired?) — re-run \`claude setup-token\`"
      echo "AUTH_PREFLIGHT_FAILED" | tee -a "$log"
      rm -f "$HERE/runs/loop.active"; return 0   # deliberate stop, needs human — don't auto-retry a dead token
    fi
  fi

  local i=0 ec=0 fails=0
  while [ "$i" -lt "$MAX_ITERS" ]; do
    i=$((i+1))
    echo "=== Ralph iteration $i / $MAX_ITERS ($(date -u +%FT%TZ)) ===" | tee -a "$log"

    # In-loop allowance gate (no-op unless CLAUDE_*_BUDGET set in .env) — stops burst-through a rate limit.
    if ! node "$HERE/usage.mjs" --claude-gate >>"$log" 2>&1; then
      echo "ALLOWANCE gate tripped — cooling down 300s" | tee -a "$log"; sleep 300; continue
    fi

    ec=0
    if [ -n "${LOOP_CMD:-}" ]; then
      runto "$ITER_TIMEOUT" bash -c "$LOOP_CMD" >>"$log" 2>&1 || ec=$?
    else
      runto "$ITER_TIMEOUT" claude -p "Act as the ECC loop-operator. Execute the next incomplete step in $PRD_FILE using TDD. Delegate each task to the right factory-* agent so it runs on its pinned model (factory-scout=reads, factory-builder=code, factory-reviewer=review, factory-planner=decomposition, factory-architect=novel architecture/Fable, factory-copy=customer copy). Use the lightest model that achieves the outcome; escalate up the ladder (MODELS.md) only when a better decision changes what ships. Obey .cursorrules, SOUL.md, HEARTBEAT.md. HARD STOP at the publish+charge gate — never flip live Stripe. When every PRD checkbox is complete, run: echo ALL_DONE > $HERE/runs/done.flag — then stop." \
        --model "$LOOP_MODEL" \
        --dangerously-skip-permissions >>"$log" 2>&1 || ec=$?
    fi

    # Completion: a dedicated sentinel file (robust) OR the token alone on its own line (anchored).
    if [ -f "$HERE/runs/done.flag" ] || grep -qE '^ALL_DONE$' "$log"; then
      echo "ALL_DONE — loop complete." | tee -a "$log"; break
    fi

    if [ "$ec" -ne 0 ]; then
      fails=$((fails+1))
      if [ "$fails" -ge "$MAX_FAILS" ]; then
        alert "🔴 factory loop circuit-broke after $fails consecutive failures (exit $ec) — see runs/loop.log"
        echo "CIRCUIT_BREAK after $fails consecutive failures" | tee -a "$log"; break
      fi
      local back=$(( (1 << fails) * 30 )); [ "$back" -gt 300 ] && back=300
      echo "iteration failed (exit $ec) — backoff ${back}s (fail $fails/$MAX_FAILS)" | tee -a "$log"; sleep "$back"
    else
      fails=0
    fi
  done

  rm -f "$HERE/runs/loop.active"               # deliberate finish (ALL_DONE / max iters / circuit-break) — no recovery
  alert "🏭 factory loop finished after $i iters (exit $ec)"
  echo "SHIPPED:$ec" | tee -a "$log"
  return 0                                     # handled — keep the EXIT trap quiet
}

case "${1:-launch}" in
  __run) run_loop ;;
  launch)
    command -v tmux   >/dev/null || { echo "tmux missing — brew install tmux"; exit 1; }
    command -v claude >/dev/null || { echo "claude CLI missing"; exit 1; }
    [ -n "$TIMEOUT_BIN" ] || echo "note: no 'timeout'/'gtimeout' — per-iteration cap disabled (brew install coreutils)"
    mkdir -p "$(dirname "$SOCK")"              # ensure ~/.tmux exists or tmux can't create the socket
    if tmux -S "$SOCK" has-session -t "$SESSION" 2>/dev/null; then
      echo "session '$SESSION' already running on $SOCK"; exit 0
    fi
    CAF=""; command -v caffeinate >/dev/null && CAF="caffeinate -i"   # keep the Mac awake for an overnight run
    tmux -S "$SOCK" new -d -s "$SESSION" "$CAF bash '$HERE/loop.sh' __run; echo done; sleep 10"
    echo "Launched tmux '$SESSION' on $SOCK."
    echo "Watch:  tmux -S $SOCK attach -t $SESSION"
    echo "Log:    tail -f $HERE/runs/loop.log"
    ;;
  *) echo "usage: loop.sh [launch|__run]"; exit 1 ;;
esac
