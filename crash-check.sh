#!/usr/bin/env bash
# crash-check.sh — pure shell, $0, NO model calls. Runs every 30 min (launchd). Companion to the 6h
# heartbeat: recovers a CRASHED loop (marker present + tmux session dead). Does NOT cold-start
# (no marker = idle). The recovery relaunches loop.sh, which restarts the real loop — correct resilience.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SOCK="$HOME/.tmux/sock"; SESSION="${SESSION:-factory}"
# The loop runs in its own worktree (D12); its marker lives there. crash-check's own log stays in main.
. "$HERE/scripts/worktree.sh" 2>/dev/null || true
LOOP_RUNS="${LOOP_WORKTREE:-$HERE}/runs"
mkdir -p "$HERE/runs"; log="$HERE/runs/crash-check.log"; ts="$(date -u +%FT%TZ)"
note() { echo "$ts $*" >> "$log"; }

if tmux -S "$SOCK" has-session -t "$SESSION" 2>/dev/null; then
  note "alive"
elif [ -f "$LOOP_RUNS/loop.active" ]; then
  note "CRASHED — relaunching"
  bash "$HERE/loop.sh" launch >> "$log" 2>&1 || note "relaunch failed"
  openclaw system event --text "⚙️ factory crash-check recovered a dead loop ($ts)" --mode now 2>/dev/null || true
else
  note "idle (not launched)"
fi
tail -n 500 "$log" > "$log.tmp" 2>/dev/null && mv "$log.tmp" "$log" || true   # keep the log bounded
