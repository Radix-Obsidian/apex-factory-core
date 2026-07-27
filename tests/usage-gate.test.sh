#!/usr/bin/env bash
# tests/usage-gate.test.sh — D23/D24 spend-gate acceptance. The control that can most hurt (Opus runaway).
# Uses a synthetic HOME with one recent Opus transcript line so every gate path is deterministic, regardless
# of the real ~/.claude data. Asserts: default passes (opt-in gate OFF), armed trips, the floor guards against
# a false trip, PCT=1 disables, and the pre-existing budget gate still fires.
set -u
cd "$(dirname "$0")/.."
FIX="$(mktemp -d)"
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/.claude/projects/t"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# one recent Opus call: proxy = (100k*5 + 50k*25)/1e6 = $1.75, 100% Opus share in the 5h window
printf '%s\n' "{\"timestamp\":\"$NOW\",\"requestId\":\"t1\",\"message\":{\"id\":\"m1\",\"model\":\"claude-opus-4-8\",\"usage\":{\"input_tokens\":100000,\"output_tokens\":50000}}}" > "$FIX/.claude/projects/t/x.jsonl"

fail=0
check() { # $1 desc  $2 want-exit  then env assignments
  local desc="$1" want="$2"; shift 2
  env HOME="$FIX" "$@" node usage.mjs --claude-gate >/dev/null 2>&1; local got=$?
  if [ "$got" = "$want" ]; then echo "✓ $desc (exit $got)"; else echo "✗ $desc — want $want got $got"; fail=1; fi
}

check "default: opt-in Opus gate OFF → pass"        0
check "armed runaway → BLOCKED"                     1  CLAUDE_OPUS_GATE=1 CLAUDE_OPUS_PCT=0.5 CLAUDE_OPUS_MIN_PROXY=0
check "armed but floor guards (no false trip)"      0  CLAUDE_OPUS_GATE=1 CLAUDE_OPUS_PCT=0.5 CLAUDE_OPUS_MIN_PROXY=999999
check "armed but PCT=1 disables"                    0  CLAUDE_OPUS_GATE=1 CLAUDE_OPUS_PCT=1 CLAUDE_OPUS_MIN_PROXY=0
check "pre-existing budget gate still fires"        1  CLAUDE_5H_BUDGET=0

[ "$fail" -eq 0 ] && echo "usage-gate-test: OK" || { echo "usage-gate-test: FAILED"; exit 1; }
