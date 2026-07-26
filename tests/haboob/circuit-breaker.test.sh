#!/usr/bin/env bash
# circuit-breaker.test.sh
# Validates the address Circuit Breaker logic committed to property_bridge.ts.
# Does NOT call the ATTOM API. Uses node to execute a self-contained inline script
# that mirrors the validateAddress function exactly as committed to the repo.
# Run from the apex-factory-core root with: bash tests/haboob/circuit-breaker.test.sh

set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

VALIDATE_JS='
function validateAddress(address) {
  if (!address || address.trim().length < 5) {
    return { valid: false, reason: "Address is empty or too short to be a valid US street address." };
  }
  const normalized = address.trim();
  const hasStreetNumber = /\d/.test(normalized);
  const hasStreetName = /[a-zA-Z]{2,}/.test(normalized);
  if (!hasStreetNumber || !hasStreetName) {
    return { valid: false, reason: "Address does not contain a street number and street name. Received: " + normalized };
  }
  return { valid: true, reason: "passed" };
}
'

run_check() {
  local address="$1"
  local expected="$2"
  local label="$3"
  local result
  result=$(node -e "${VALIDATE_JS}; const r = validateAddress(${address}); process.stdout.write(r.valid ? 'valid' : 'invalid');")
  if [ "$result" = "$expected" ]; then
    pass "$label"
  else
    fail "$label (expected $expected, got $result)"
  fi
}

echo ""
echo "Running Circuit Breaker address validation tests..."
echo ""

run_check '""'                                        "invalid" "Empty string is blocked"
run_check '"   "'                                     "invalid" "Whitespace only is blocked"
run_check '"test"'                                    "invalid" "Single word under 5 chars is blocked"
run_check '"nostreet"'                                "invalid" "Word without digit is blocked"
run_check '"12345"'                                   "invalid" "Digits only without street name is blocked"
run_check '"1600 Pennsylvania Ave NW, Washington, DC 20500"' "valid" "Valid full address passes"
run_check '"742 Evergreen Terrace, Springfield, IL 62701"'   "valid" "Valid address passes"
run_check '"100 Main St"'                             "valid"   "Minimal valid street passes"
run_check '"9 E"'                                     "invalid" "Under minimum length is blocked"
run_check 'null'                                      "invalid" "Null is blocked"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "CIRCUIT BREAKER TEST SUITE FAILED"
  exit 1
else
  echo "CIRCUIT BREAKER TEST SUITE PASSED"
  exit 0
fi
