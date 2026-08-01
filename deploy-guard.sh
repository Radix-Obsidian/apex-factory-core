#!/usr/bin/env bash
# deploy-guard.sh — the factory's single irreversible boundary.
#   preview  = autonomous path, TEST mode only (refuses any live key).
#   publish  = THE GATE: live charging, requires the founder's approval token. Fail-closed.
# Called by the loop-operator at the deploy step and by `make gate` / `make guard-test`.
# NEVER prints a key value.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# ENV_FILE override lets the acceptance tests point at a fixture; defaults to the real .env.
ENV_FILE="${ENV_FILE:-$HERE/.env}"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

MODE="${1:-preview}"
# Every credential that could charge a customer. D28 retired Stripe as a paywall, but the vars are still
# checked: a leftover live Stripe key on a host is exactly the hazard the retirement is meant to close.
# Polar is the current gateway (D27), so its live tokens are refused on the autonomous path too — a
# guard that only knows the OLD provider is no guard at all.
SK="${STRIPE_SECRET_KEY:-}"
POLAR="${POLAR_ACCESS_TOKEN:-${WAIMD_HOUSING_POLAR_RO_KEY:-}}"

# A token is "live" when it is NOT explicitly a sandbox/test credential.
#   Stripe: sk_live_ / rk_live_
#   Polar:  polar_oat_ / polar_pat_ production tokens; sandbox tokens carry a sandbox marker.
is_live() {
  case "$1" in
    sk_live_*|rk_live_*) return 0 ;;
    *sandbox*|*_test_*|sk_test_*|rk_test_*) return 1 ;;
    polar_oat_*|polar_pat_*|polar_*) return 0 ;;
    *) return 1 ;;
  esac
}

case "$MODE" in
  preview)
    # Autonomous path: a live key must NEVER reach a preview deploy.
    if [ -n "$SK" ] && is_live "$SK"; then
      echo "❌ deploy-guard: preview REFUSED — STRIPE_SECRET_KEY is a LIVE key. Use test/restricted." >&2
      echo "   (Stripe is RETIRED as a paywall (D28) — this key should be revoked, not downgraded.)" >&2
      exit 3
    fi
    if [ -n "$POLAR" ] && is_live "$POLAR"; then
      echo "❌ deploy-guard: preview REFUSED — a LIVE Polar token is set. Use a sandbox token." >&2
      exit 3
    fi
    echo "✅ deploy-guard: preview OK (TEST mode)."
    if [ -n "${DEPLOY_CMD:-}" ]; then echo "→ $DEPLOY_CMD"; bash -c "$DEPLOY_CMD"; else echo "(dry: no DEPLOY_CMD — would run 'railway up')"; fi
    ;;
  publish)
    # THE GATE. Live charging. Fail-closed: empty stored token => can never open.
    if [ -z "${PUBLISH_APPROVAL_TOKEN:-}" ]; then
      echo "🔒 GATE: publish REFUSED — no PUBLISH_APPROVAL_TOKEN in .env (gate sealed)." >&2; exit 2
    fi
    if [ "${APPROVAL:-}" != "$PUBLISH_APPROVAL_TOKEN" ]; then
      echo "🔒 GATE: publish REFUSED — APPROVAL token missing/mismatch. Founder approves via Telegram." >&2; exit 2
    fi
    echo "✅ GATE OPEN: approval matched — live charging authorized."
    if [ -n "${DEPLOY_CMD:-}" ]; then bash -c "$DEPLOY_CMD"; else echo "(dry: would run live 'railway up')"; fi
    ;;
  *) echo "usage: deploy-guard.sh [preview|publish]" >&2; exit 1 ;;
esac
