#!/usr/bin/env bash
# tests/waimd-gate.test.sh — the waimd-housing validation gate (PRD §23 metrics, §24 kill criteria).
# Proves every §24 verdict fires on the right fixture, that kills exit non-zero (so a kill can never be
# mistaken for a pass), and that a missing/malformed metrics file is handled without a false verdict.
set -u
cd "$(dirname "$0")/.."
GATE="ops/waimd-gate.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0
ok(){ echo "✓ $1"; }
no(){ echo "✗ $1"; fail=1; }

# run <desc> <expected-verdict> <expected-exit> <json>
run(){
  local desc="$1" want="$2" wantx="$3" json="$4" f="$TMP/m.json" out code verdict
  printf '%s' "$json" > "$f"
  out=$(node "$GATE" "$f" --json 2>&1); code=$?
  verdict=$(printf '%s' "$out" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(JSON.parse(s).verdict)}catch{process.stdout.write('PARSE_ERROR')}})")
  if [ "$verdict" = "$want" ] && [ "$code" = "$wantx" ]; then ok "$desc → $want (exit $code)"
  else no "$desc → got '$verdict' exit $code, want '$want' exit $wantx"; fi
}

# ── §24 the four verdicts ──
run "budget spent, funnel dry" "KILL ACQUISITION" 1 \
  '{"ad_spend_usd":70,"qualified_missions":4,"fulfilled_missions":4,"solvable_missions":4,"purchases":0}'
run "10 fulfilled, 0 purchases" "KILL PROPOSITION" 1 \
  '{"ad_spend_usd":60,"qualified_missions":12,"fulfilled_missions":10,"solvable_missions":9,"purchases":0}'
run "10 fulfilled, 2 purchases" "INVESTIGATE" 0 \
  '{"ad_spend_usd":60,"qualified_missions":12,"fulfilled_missions":10,"solvable_missions":9,"purchases":2}'
run "10 fulfilled, 3 purchases" "CONTINUE" 0 \
  '{"ad_spend_usd":60,"qualified_missions":12,"fulfilled_missions":10,"solvable_missions":9,"purchases":3}'

# ── boundaries: a kill must not fire early, and the acquisition kill outranks a thin funnel ──
run "under budget, few missions" "INSUFFICIENT DATA" 0 \
  '{"ad_spend_usd":40,"qualified_missions":3,"fulfilled_missions":3,"solvable_missions":3,"purchases":0}'
run "9 fulfilled is still early" "INSUFFICIENT DATA" 0 \
  '{"ad_spend_usd":60,"qualified_missions":11,"fulfilled_missions":9,"solvable_missions":8,"purchases":0}'
run "budget spent, 5 missions clears floor" "INSUFFICIENT DATA" 0 \
  '{"ad_spend_usd":70,"qualified_missions":5,"fulfilled_missions":5,"solvable_missions":5,"purchases":1}'

# ── metric math (PRD §23): CAC = spend/qualified, solvability = solvable/fulfilled, paid = purchases/solvable ──
metrics=$(printf '%s' '{"ad_spend_usd":140,"qualified_missions":10,"fulfilled_missions":10,"solvable_missions":8,"purchases":4}' > "$TMP/n.json"; node "$GATE" "$TMP/n.json" --json)
chk(){ printf '%s' "$metrics" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s).metrics;process.exit(String(m['$1'])==='$2'?0:1)})"; }
chk cac_usd 14 && ok "CAC math (140/10 = \$14)" || no "CAC math"
chk cac_ok true && ok "CAC \$14 meets the ≤\$14 target (boundary inclusive)" || no "CAC boundary"
chk solvability_pct 80 && ok "solvability math (8/10 = 80%)" || no "solvability math"
chk solvability_ok true && ok "80% meets the ≥80% target (boundary inclusive)" || no "solvability boundary"
chk paid_decision_rate_pct 50 && ok "paid rate math (4/8 = 50%)" || no "paid rate math"

# ── robustness: no file = no verdict (never a false kill); malformed = loud exit 2 ──
node "$GATE" "$TMP/does-not-exist.json" >/dev/null 2>&1 && ok "missing metrics → exit 0, no verdict" || no "missing metrics should exit 0"
printf 'not json' > "$TMP/bad.json"; node "$GATE" "$TMP/bad.json" >/dev/null 2>&1; [ $? = 2 ] && ok "malformed metrics → exit 2" || no "malformed metrics should exit 2"
printf '[1,2]' > "$TMP/arr.json"; node "$GATE" "$TMP/arr.json" >/dev/null 2>&1; [ $? = 2 ] && ok "non-object metrics → exit 2" || no "non-object metrics should exit 2"

[ "$fail" -eq 0 ] && echo "waimd-gate-test: OK" || { echo "waimd-gate-test: FAILED"; exit 1; }
