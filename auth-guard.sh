#!/usr/bin/env bash
# auth-guard.sh — the factory's credential-invariant guard. Enforces the two-key model:
#   CLAUDE_CODE_OAUTH_TOKEN (sk-ant-oat01-…) runs the FACTORY; the Anthropic API key
#   (sk-ant-api03-…) is SKU-ONLY and must NEVER live in factory-core/.env.
# loop.sh already `unset`s ANTHROPIC_API_KEY before calling claude, but it does so SILENTLY.
# This guard makes a mis-placed key a LOUD, fail-closed stop instead of a quiet swallow.
# Called by loop.sh pre-flight and by `make auth-guard` / `make guard-test`. NEVER prints a key value.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# ENV_FILE override lets the acceptance tests point at a fixture; defaults to the real .env.
ENV_FILE="${ENV_FILE:-$HERE/.env}"

# An uncommented, non-empty assignment of VAR in the .env file — the durable config we guard.
# Grep the FILE (not the sourced env) so an ambient export in the founder's shell can't false-positive.
file_sets() { [ -f "$ENV_FILE" ] && grep -Eq "^[[:space:]]*$1=[^[:space:]#]" "$ENV_FILE"; }

# Read the OAuth token's *prefix only* (never the whole value) so we can type-check without leaking it.
OAUTH_VAL=""
if [ -f "$ENV_FILE" ]; then
  OAUTH_VAL="$(grep -E '^[[:space:]]*CLAUDE_CODE_OAUTH_TOKEN=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'"'"' \r')"
fi

fail() { echo "❌ auth-guard: $1" >&2; exit 4; }

# 1. A SKU API key must NEVER sit in the factory config.
if file_sets ANTHROPIC_API_KEY; then
  fail "ANTHROPIC_API_KEY found in factory-core/.env — API keys are SKU-ONLY and belong in a SKU repo's Railway env, NEVER the factory. loop.sh unsets it, but its presence here is a misconfiguration. Move it to the SKU."
fi
if file_sets ANTHROPIC_AUTH_TOKEN; then
  fail "ANTHROPIC_AUTH_TOKEN found in factory-core/.env — remove it; it outranks the OAuth token. The factory authenticates via CLAUDE_CODE_OAUTH_TOKEN only."
fi

# 2. The factory OAuth token must be present (fail-closed on empty).
if [ -z "$OAUTH_VAL" ]; then
  fail "CLAUDE_CODE_OAUTH_TOKEN is empty/absent in factory-core/.env — the factory has no agent identity. Set a 'claude setup-token' OAuth token (sk-ant-oat01-…)."
fi

# 3. …and it must be the right TYPE: an OAuth token, not an API key pasted into the wrong slot.
case "$OAUTH_VAL" in
  sk-ant-oat01-*) ;;  # correct
  sk-ant-api03-*) fail "CLAUDE_CODE_OAUTH_TOKEN holds an API key (sk-ant-api03-…), not an OAuth token — API keys are SKU-ONLY. Use a 'claude setup-token' token (sk-ant-oat01-…)." ;;
  *) fail "CLAUDE_CODE_OAUTH_TOKEN is not a recognized OAuth token (expected sk-ant-oat01-… from 'claude setup-token')." ;;
esac

echo "✅ auth-guard: factory credential invariant OK (OAuth token present, no API key in .env)."
