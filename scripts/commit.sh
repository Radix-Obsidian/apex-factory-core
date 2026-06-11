#!/usr/bin/env bash
# commit.sh — scoped, safe commit helper. NEVER leaves a blind `git add -A` standing: it stages exactly
# ONE ownership zone, secret-scans the staged diff, then commits. The pre-commit zone guard is the backstop.
#   scripts/commit.sh "message"                  → factory/core zone (everything EXCEPT .gitzones roots)
#   scripts/commit.sh --zone recycled "message"  → only files under recycled/
#   add --push to also push the current branch.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"

zones=()
[ -f "$ROOT/.gitzones" ] && while IFS= read -r l; do
  l="${l%%#*}"; l="$(printf '%s' "$l" | xargs)"; [ -n "$l" ] && zones+=("${l%/}/")
done < "$ROOT/.gitzones"

ZONE="core"; PUSH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --zone) ZONE="$2"; shift 2;;
    --push) PUSH=1; shift;;
    *) MSG="$1"; shift;;
  esac
done
[ -n "${MSG:-}" ] || { echo "usage: commit.sh [--zone <name>] [--push] \"message\""; exit 1; }

# Stage exactly one zone.
git reset -q  # clear the index so we start from a known state
if [ "$ZONE" = "core" ]; then
  git add -A
  for z in "${zones[@]}"; do git reset -q -- "$z" >/dev/null 2>&1 || true; done   # drop every isolated zone
else
  git add -A -- "$ZONE/" >/dev/null 2>&1 || git add -A -- "$ZONE" >/dev/null 2>&1
fi

staged="$(git diff --cached --name-only)"
[ -n "$staged" ] || { echo "nothing staged in zone '$ZONE' — nothing to commit"; exit 0; }

# Secret leak guard (real key VALUES, not prose).
if git diff --cached | grep -nE 'oat01-[A-Za-z0-9]{8}|sk_live_[A-Za-z0-9]{10}|sk-ant-api03-[A-Za-z0-9]{8}|re_[A-Za-z0-9]{12}|bot[0-9]{6}:AA[A-Za-z0-9_-]{20}'; then
  echo "✗ commit BLOCKED: a real secret value appears in the staged diff — unstage/scrub it first." >&2; exit 1
fi

echo "zone '$ZONE' — staging:"; printf '  %s\n' $staged
git commit -m "$MSG"
[ "$PUSH" -eq 1 ] && git push
echo "✓ committed zone '$ZONE'"
