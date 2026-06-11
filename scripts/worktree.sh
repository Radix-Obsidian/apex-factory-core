#!/usr/bin/env bash
# worktree.sh — AI-native parallel-agent isolation. The autonomous loop runs in its OWN git worktree on
# its OWN branch (loop/auto), so it never shares a working tree or index with interactive founder sessions
# on `main`. A blind `git add -A` by the loop can ONLY touch the loop's worktree — founder edits on `main`
# are physically unreachable. This is the structural backstop above the ownership-zone guard (see DECISIONS
# D11/D12): zones stop cross-subproject mixing within a tree; worktrees stop cross-SESSION clobbering.
#
# Safe to source (sets LOOP_WORKTREE/LOOP_BRANCH/WT_MAIN + defines ensure_worktree, NO side effects) or run:
#   scripts/worktree.sh ensure   # create/sync the loop worktree (idempotent), (re)link .env
#   scripts/worktree.sh path     # print the worktree path
#   scripts/worktree.sh status   # show all worktrees + the loop branch
#   scripts/worktree.sh remove   # tear the worktree down (keeps the loop/auto branch + its history)

# This file lives at <tree>/scripts/worktree.sh and is ALWAYS sourced from the MAIN tree
# (loop.sh launch / heartbeat.sh / crash-check.sh), so scripts/.. is the primary working tree. Resolved
# without invoking git, so heartbeat/crash-check can find the loop marker even under a bare launchd PATH.
WT_MAIN="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)"
LOOP_BRANCH="${LOOP_BRANCH:-loop/auto}"
LOOP_WORKTREE="${LOOP_WORKTREE:-$WT_MAIN/.worktrees/loop}"   # gitignored; override for a sibling/external path

# Create the loop worktree if missing; otherwise fast-forward it to main when it's clean and not ahead, so
# every run starts from the latest harness WITHOUT silently discarding any divergent loop commits.
ensure_worktree() {
  local main="$WT_MAIN" wt="$LOOP_WORKTREE" br="$LOOP_BRANCH"
  command -v git >/dev/null 2>&1 || { echo "✗ git not on PATH — cannot prepare worktree" >&2; return 1; }
  git -C "$main" worktree prune 2>/dev/null || true
  if [ -d "$wt" ] && git -C "$wt" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local ahead behind dirty
    behind="$(git -C "$wt" rev-list --count "$br"..main 2>/dev/null || echo 0)"   # commits on main not on loop branch
    ahead="$(git -C "$wt" rev-list --count main.."$br" 2>/dev/null || echo 0)"    # commits on loop branch not on main
    dirty="$(git -C "$wt" status --porcelain 2>/dev/null)"
    if [ -z "$dirty" ] && [ "$ahead" = "0" ] && [ "$behind" != "0" ]; then
      git -C "$wt" merge --ff-only main >/dev/null 2>&1 || true                   # sync to latest main harness
    elif [ -n "$dirty" ] || [ "$ahead" != "0" ]; then
      echo "note: $br is dirty or ahead of main — leaving as-is (inspect/merge it deliberately)" >&2
    fi
  else
    if git -C "$main" show-ref --verify --quiet "refs/heads/$br"; then
      git -C "$main" worktree add "$wt" "$br" >/dev/null 2>&1 \
        || { echo "✗ could not add worktree $wt for existing branch $br" >&2; return 1; }
    else
      git -C "$main" worktree add -b "$br" "$wt" main >/dev/null 2>&1 \
        || { echo "✗ could not create worktree $wt ($br)" >&2; return 1; }
    fi
  fi
  # The loop needs the gitignored .env (subscription OAuth token) for headless auth — symlink it in.
  # .env stays gitignored in the worktree too, so it is never checked out or committed.
  [ -e "$main/.env" ] && ln -sfn "$main/.env" "$wt/.env" 2>/dev/null || true
  return 0
}

# Act only when executed directly; do nothing on `source`.
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then
  set -uo pipefail
  case "${1:-path}" in
    ensure) ensure_worktree && echo "✓ loop worktree ready: $LOOP_WORKTREE ($LOOP_BRANCH)" ;;
    path)   printf '%s\n' "$LOOP_WORKTREE" ;;
    status) git -C "$WT_MAIN" worktree list; echo "loop branch: $LOOP_BRANCH" ;;
    remove) git -C "$WT_MAIN" worktree remove --force "$LOOP_WORKTREE" 2>/dev/null \
              && echo "✓ removed $LOOP_WORKTREE (branch $LOOP_BRANCH + history kept)" \
              || echo "nothing to remove (no worktree at $LOOP_WORKTREE)" ;;
    *) echo "usage: worktree.sh [ensure|path|status|remove]" >&2; exit 1 ;;
  esac
fi
