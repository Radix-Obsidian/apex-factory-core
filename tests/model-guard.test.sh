#!/usr/bin/env bash
# tests/model-guard.test.sh — fail-closed model-guard acceptance (D23).
# Asserts Opus/Fable is BLOCKED (exit 2) on non-code work and ALLOWED (exit 0) for code.
set -u
cd "$(dirname "$0")/.."
fail=0
run() { echo "$1" | node hooks/model-guard.mjs >/dev/null 2>&1; echo $?; }
expect() { # $1=desc  $2=want_exit  $3=json
  got=$(run "$3")
  if [ "$got" = "$2" ]; then echo "✓ $1 (exit $got)"; else echo "✗ $1 — want exit $2, got $got"; fail=1; fi
}
expect "copy+opus BLOCKED"            2 '{"tool_name":"Task","tool_input":{"subagent_type":"factory-copy","model":"claude-opus-4-8"}}'
expect "operator+opus BLOCKED"        2 '{"tool_name":"Task","tool_input":{"subagent_type":"factory-operator","model":"claude-opus-4-8"}}'
expect "generic+fable+report BLOCKED" 2 '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","model":"claude-fable-5","task_type":"report"}}'
expect "builder+opus ALLOWED"         0 '{"tool_name":"Task","tool_input":{"subagent_type":"factory-builder","model":"claude-opus-4-8"}}'
expect "planner+opus ALLOWED"         0 '{"tool_name":"Task","tool_input":{"subagent_type":"factory-planner","model":"claude-opus-4-8"}}'
expect "generic+sonnet ALLOWED"       0 '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","model":"claude-sonnet-4-6"}}'
expect "scout+default ALLOWED"        0 '{"tool_name":"Task","tool_input":{"subagent_type":"factory-scout"}}'
expect "generic+opus+code ALLOWED"    0 '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","model":"claude-opus-4-8","task_type":"refactor-multifile"}}'
[ "$fail" -eq 0 ] && echo "model-guard-test: OK" || { echo "model-guard-test: FAILED"; exit 1; }
