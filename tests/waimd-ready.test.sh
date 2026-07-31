#!/usr/bin/env bash
# tests/waimd-ready.test.sh — the pre-$70 readiness gate must be HONEST and FAIL-CLOSED.
# The whole point of ops/waimd-ready.mjs is that "not ready" can never be mistaken for approval to
# spend, so these tests assert the properties that make it trustworthy rather than its current output.
set -u
cd "$(dirname "$0")/.."
GATE="ops/waimd-ready.mjs"
fail=0
ok(){ echo "✓ $1"; }
no(){ echo "✗ $1"; fail=1; }

out=$(node "$GATE" --json 2>/dev/null); code=$?
q(){ printf '%s' "$out" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(String(eval(process.argv[1])))})" "$1"; }

# 1. It runs and emits a machine-readable verdict.
[ -n "$out" ] && ok "gate emits JSON" || no "gate emitted nothing"

# 2. Exit code and verdict agree — a red gate MUST exit non-zero, or CI would read it as a pass.
ready=$(q 'j.ready')
if [ "$ready" = "false" ] && [ "$code" != "0" ]; then ok "NOT READY exits non-zero (exit $code)"
elif [ "$ready" = "true" ] && [ "$code" = "0" ]; then ok "READY exits zero"
else no "verdict '$ready' disagrees with exit $code"; fi

# 3. The beta cannot be declared ready while the product repo is absent — the core fail-closed property.
repo=$(q "j.checks.find(c=>c.key==='repo').state")
if [ "$repo" != "GREEN" ]; then
  [ "$ready" = "false" ] && ok "no product repo ⇒ never READY" || no "went READY with no product repo"
else ok "product repo present (repo check GREEN)"; fi

# 4. Blocking checks that are RED or AMBER both prevent READY — unproven ≠ proven.
[ "$(q 'j.checks.filter(c=>c.blocking&&c.state!=="GREEN").length>0 ? (j.ready===false) : true')" = "true" ] \
  && ok "any non-green blocking check ⇒ NOT READY" || no "a non-green blocking check did not block"

# 5. The $70 spend line is present and explicitly non-blocking (it is a founder decision, not a test).
[ "$(q "j.checks.find(c=>c.key==='spend').blocking")" = "false" ] \
  && ok "\$70 authorization is a founder decision, not a gate check" || no "spend check mis-scoped"

# 6. The gate covers the founder's four conditions: engine, evals, wider tests, and the beta itself.
for k in engine eval honesty killgate ops beta e2e payments testmode; do
  [ "$(q "j.checks.some(c=>c.key==='$k')")" = "true" ] && ok "covers: $k" || no "missing check: $k"
done

# 7. It is read-only — a gate that mutates state cannot be trusted to report on it.
before=$(git status --porcelain 2>/dev/null | sort)
node "$GATE" >/dev/null 2>&1
after=$(git status --porcelain 2>/dev/null | sort)
[ "$before" = "$after" ] && ok "gate is read-only (no working-tree change)" || no "gate mutated the working tree"

[ "$fail" -eq 0 ] && echo "waimd-ready-test: OK" || { echo "waimd-ready-test: FAILED"; exit 1; }
