#!/usr/bin/env bash
# tests/honesty-auditor.test.sh — the "never lie" gate (METHOD.md §5; waimd-housing PRD §11 + §19).
# Proves the honesty-auditor PreToolUse hook BLOCKS fabricated social proof, fabricated personas, fake
# scarcity/inventory, invented "verified" badges, and availability certainty without CONFIRMED-grade
# evidence — and PASSES honest evidence-backed copy, the §12 Decision Card, the money-back guarantee
# the copywriter gate requires, non-copy files, and the auditable honesty-ok override.
set -u
cd "$(dirname "$0")/.."
HOOK="hooks/honesty-auditor.mjs"
fail=0
ok(){ echo "✓ $1"; }
no(){ echo "✗ $1"; fail=1; }

# Build the hook's stdin JSON safely (handles quotes, ★, ✓, em-dashes) and return the hook's exit code.
code(){ node -e 'process.stdout.write(JSON.stringify({tool_name:"Write",tool_input:{file_path:process.argv[1],content:process.argv[2]}}))' "$1" "$2" | node "$HOOK" >/dev/null 2>&1; echo $?; }
blocks(){ local d="$1" c; c=$(code "$2" "$3"); [ "$c" = "2" ] && ok "BLOCK  $d" || no "BLOCK  $d (exit $c, want 2)"; }
allows(){ local d="$1" c; c=$(code "$2" "$3"); [ "$c" = "0" ] && ok "ALLOW  $d" || no "ALLOW  $d (exit $c, want 0)"; }

# ── must BLOCK: fabricated social proof (§19 "no fake reviews", "no vanity counters") ──
blocks "invented social-proof counter"     "app/landing.html" "Trusted by 12,000 travel nurses."
blocks "fake star rating"                  "components/hero.md" "Rated 4.9 stars by nurses nationwide."
blocks "join N social proof"               "marketing/cta.md" "Join 8,000 nurses who moved stress-free."

# ── must BLOCK: fabricated personas (§19 "no fake nurses") ──
blocks "fake nurse testimonial"            "app/landing.md" "\"WAIMD found me a place in 2 days.\" — Sarah R., ICU travel nurse"

# ── must BLOCK: fake scarcity/inventory (§19 "no fake inventory") ──
blocks "fake inventory counter"            "app/pricing.md" "Only 2 homes left near your assignment — book now."
blocks "fake viewers counter"              "app/offer.md" "17 nurses viewing this listing right now."

# ── must BLOCK: invented trust badges (§19 "no invented 'verified' badges") ──
blocks "invented verified badge"           "app/landing.md" "✓ Verified landlord on every match."
blocks "blanket 'every listing verified'"  "marketing/hero.md" "Every listing is verified before you see it."

# ── must BLOCK: certainty without CONFIRMED-grade evidence (§11) ──
blocks "certainty with no evidence at all" "app/landing.md" "Availability confirmed for your exact move-in dates."
blocks "certainty backed only by CHECKED"  "app/landing.md" "Availability confirmed. Source last checked 2h ago. CHECKED"
blocks "certainty backed only by a date"   "app/offer.md" "Guaranteed available as of 2026-07-27."

# ── must ALLOW: honest, evidenced, or out of scope ──
allows "CONFIRMED token authorizes it"     "app/landing.md" "Availability confirmed — CONFIRMED 2026-07-27."
allows "landlord confirmation authorizes"  "app/landing.md" "Availability confirmed by the landlord on 2026-07-27."
allows "PRD §12 Decision Card (CHECKED)"   "app/decision-card.md" "Availability: CHECKED · Source last checked: 2h 14m ago. Watch-outs: pet policy unclear."
allows "money-back guarantee (Hormozi)"    "app/pricing.md" "We surface 3 evidence-backed housing choices for your confirmed assignment. If we can't find 3, you pay \$0 — full refund, money-back guarantee."
allows "honest '3 choices' product copy"   "app/hero.md" "One confirmed assignment in, get 3 real housing options — no fluff, full refund guarantee if we miss."
allows "evidenced verification claim"      "app/landing.md" "Verified listing — CONFIRMED by the leasing office on 2026-07-27."
allows "non-copy file is ignored"          "src/engine.ts" "if (unitsLeft === 2) return 'only 2 left';"
allows "honesty-ok override for real proof" "app/landing.md" "<!-- honesty-ok: 3 real pilot reviews in ops/inbox/waimd-housing.jsonl --> Rated 5 stars by our first 3 pilots. Money-back guarantee."

[ "$fail" -eq 0 ] && echo "honesty-auditor-test: OK" || { echo "honesty-auditor-test: FAILED"; exit 1; }
