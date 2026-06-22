#!/usr/bin/env bash
# Acceptance tests for auth-guard.sh — the factory's two-key credential invariant.
# Uses ENV_FILE fixtures so we exercise the REAL sourcing path without touching the live .env.
# Fixture tokens are FAKE (sk-ant-oat01-FAKE / sk-ant-api03-FAKE), exactly like guard.test.sh's sk_live_FAKE.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$HERE/auth-guard.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }
no(){ echo "  ✗ $1"; fail=$((fail+1)); }

# AC-AUTH1 — valid: OAuth token present, no API key → guard PASSES (proves it isn't always-refusing)
printf 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-FAKE\n' > "$TMP/ok.env"
if ENV_FILE="$TMP/ok.env" bash "$GUARD" >/dev/null 2>&1; then ok "AUTH1 valid factory token passes"; else no "AUTH1 valid factory token passes"; fi

# AC-AUTH2 — a SKU API key mis-placed in factory .env → REFUSE
printf 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-FAKE\nANTHROPIC_API_KEY=sk-ant-api03-FAKE\n' > "$TMP/apikey.env"
if ENV_FILE="$TMP/apikey.env" bash "$GUARD" >/dev/null 2>&1; then no "AUTH2 refuses ANTHROPIC_API_KEY in .env"; else ok "AUTH2 refuses ANTHROPIC_API_KEY in .env"; fi

# AC-AUTH3 — ANTHROPIC_AUTH_TOKEN in factory .env → REFUSE
printf 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-FAKE\nANTHROPIC_AUTH_TOKEN=sk-ant-FAKE\n' > "$TMP/authtok.env"
if ENV_FILE="$TMP/authtok.env" bash "$GUARD" >/dev/null 2>&1; then no "AUTH3 refuses ANTHROPIC_AUTH_TOKEN in .env"; else ok "AUTH3 refuses ANTHROPIC_AUTH_TOKEN in .env"; fi

# AC-AUTH4 — missing OAuth token → REFUSE (fail-closed)
printf '\n' > "$TMP/empty.env"
if ENV_FILE="$TMP/empty.env" bash "$GUARD" >/dev/null 2>&1; then no "AUTH4 fail-closed on missing OAuth token"; else ok "AUTH4 fail-closed on missing OAuth token"; fi

# AC-AUTH5 — API key pasted into the OAuth slot (wrong type) → REFUSE
printf 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-api03-FAKE\n' > "$TMP/wrongtype.env"
if ENV_FILE="$TMP/wrongtype.env" bash "$GUARD" >/dev/null 2>&1; then no "AUTH5 refuses API key in OAuth slot"; else ok "AUTH5 refuses API key in OAuth slot"; fi

# AC-AUTH6 — a commented-out API key line must NOT trip the guard (it's not a live assignment)
printf 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-FAKE\n# ANTHROPIC_API_KEY=keep-unset\n' > "$TMP/commented.env"
if ENV_FILE="$TMP/commented.env" bash "$GUARD" >/dev/null 2>&1; then ok "AUTH6 ignores commented API key line"; else no "AUTH6 ignores commented API key line"; fi

echo "auth-guard tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
