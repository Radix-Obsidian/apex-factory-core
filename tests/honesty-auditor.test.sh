#!/usr/bin/env bash
# tests/honesty-auditor.test.sh — the "never lie" gate (METHOD.md §5). Proves the honesty-auditor
# PreToolUse hook BLOCKS fabricated social proof, fake scarcity/inventory, and un-timestamped
# availability certainty on customer-facing copy — and PASSES honest, evidence-backed copy, the
# money-back guarantee the copywriter gate requires, non-copy files, and the honesty-ok override.
set -u
cd "$(dirname "$0")/.."
HOOK="hooks/honesty-auditor.mjs"
fail=0
ok(){ echo "✓ $1"; }
no(){ echo "✗ $1"; fail=1; }

# Build the hook's stdin JSON safely (handles quotes, ★, commas) and return the hook's exit code.
code(){ node -e 'process.stdout.write(JSON.stringify({tool_name:"Write",tool_input:{file_path:process.argv[1],content:process.argv[2]}}))' "$1" "$2" | node "$HOOK" >/dev/null 2>&1; echo $?; }
blocks(){ local d="$1" c; c=$(code "$2" "$3"); [ "$c" = "2" ] && ok "BLOCK  $d" || no "BLOCK  $d (exit $c, want 2)"; }
allows(){ local d="$1" c; c=$(code "$2" "$3"); [ "$c" = "0" ] && ok "ALLOW  $d" || no "ALLOW  $d (exit $c, want 0)"; }

# ── must BLOCK (fabrication) ──
blocks "invented social-proof counter"     "app/landing.html" "Trusted by 12,000 travel nurses."
blocks "fake star rating"                  "components/hero.md" "Rated 4.9 stars by nurses nationwide."
blocks "join N social proof"               "marketing/cta.md" "Join 8,000 nurses who moved stress-free."
blocks "fake inventory counter"            "app/pricing.md" "Only 2 homes left near your assignment — book now."
blocks "fake viewers counter"              "app/offer.md" "17 nurses viewing this listing right now."
blocks "un-timestamped availability cert." "app/landing.md" "Availability confirmed for your exact move-in dates."

# ── must ALLOW (honest / evidenced / out of scope) ──
allows "evidenced availability (date+CONFIRMED)" "app/landing.md" "Availability CONFIRMED as of 2026-07-27 for your dates."
allows "honest value + money-back guarantee"     "app/pricing.md" "We surface 3 evidence-backed housing choices for your confirmed assignment. Full refund if we can't find 3 — money-back guarantee."
allows "product's own '3 choices' language"      "app/hero.md" "One confirmed assignment in, get 3 real housing options — no fluff, full refund guarantee if we miss."
allows "non-copy file is ignored"                "src/engine.ts" "if (unitsLeft === 2) return 'only 2 left';"
allows "honesty-ok override for real proof"      "app/landing.md" "<!-- honesty-ok: 3 real pilot reviews in ops/inbox/waimd-housing.jsonl --> Rated 5 stars by our first 3 pilots. Money-back guarantee."

[ "$fail" -eq 0 ] && echo "honesty-auditor-test: OK" || { echo "honesty-auditor-test: FAILED"; exit 1; }
