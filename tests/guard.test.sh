#!/usr/bin/env bash
# Acceptance tests for deploy-guard.sh — AC3 (preview refuses live key) + AC4 (the gate).
# Uses ENV_FILE fixtures so we exercise the REAL sourcing path without touching the live .env.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$HERE/deploy-guard.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }
no(){ echo "  ✗ $1"; fail=$((fail+1)); }

# AC3 — preview REFUSES a live key
printf 'STRIPE_SECRET_KEY=sk_live_FAKE\n' > "$TMP/live.env"
if ENV_FILE="$TMP/live.env" bash "$GUARD" preview >/dev/null 2>&1; then no "AC3  preview refuses live key"; else ok "AC3  preview refuses live key"; fi

# AC3b — preview ALLOWS a test key
printf 'STRIPE_SECRET_KEY=sk_test_OK\n' > "$TMP/test.env"
if ENV_FILE="$TMP/test.env" bash "$GUARD" preview >/dev/null 2>&1; then ok "AC3b preview allows test key"; else no "AC3b preview allows test key"; fi

# AC4 — gate SEALED (no stored token) refuses publish
printf '\n' > "$TMP/sealed.env"
if ENV_FILE="$TMP/sealed.env" bash "$GUARD" publish >/dev/null 2>&1; then no "AC4  sealed gate refuses publish"; else ok "AC4  sealed gate refuses publish"; fi

# AC4b — armed gate refuses a MISMATCHED approval
printf 'PUBLISH_APPROVAL_TOKEN=secret123\n' > "$TMP/armed.env"
if APPROVAL=wrong ENV_FILE="$TMP/armed.env" bash "$GUARD" publish >/dev/null 2>&1; then no "AC4b armed gate refuses mismatch"; else ok "AC4b armed gate refuses mismatch"; fi

# AC4c — armed gate OPENS on a MATCHING approval (proves it isn't always-refusing)
if APPROVAL=secret123 ENV_FILE="$TMP/armed.env" bash "$GUARD" publish >/dev/null 2>&1; then ok "AC4c armed gate opens on match"; else no "AC4c armed gate opens on match"; fi

# D27/D28 — the guard must know the CURRENT gateway too. A guard that only recognises the RETIRED
# provider would wave a live Polar token straight through a preview deploy.
printf 'WAIMD_HOUSING_POLAR_RO_KEY=polar_oat_LIVEFAKE\n' > "$TMP/polar-live.env"
if ENV_FILE="$TMP/polar-live.env" bash "$GUARD" preview >/dev/null 2>&1; then no "AC3c preview refuses live POLAR token"; else ok "AC3c preview refuses live POLAR token"; fi

printf 'POLAR_ACCESS_TOKEN=polar_oat_LIVEFAKE\n' > "$TMP/polar-live2.env"
if ENV_FILE="$TMP/polar-live2.env" bash "$GUARD" preview >/dev/null 2>&1; then no "AC3d preview refuses POLAR_ACCESS_TOKEN"; else ok "AC3d preview refuses POLAR_ACCESS_TOKEN"; fi

printf 'WAIMD_HOUSING_POLAR_RO_KEY=polar_oat_sandbox_OK\n' > "$TMP/polar-sandbox.env"
if ENV_FILE="$TMP/polar-sandbox.env" bash "$GUARD" preview >/dev/null 2>&1; then ok "AC3e preview allows a Polar SANDBOX token"; else no "AC3e preview allows a Polar SANDBOX token"; fi

echo "guard tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
