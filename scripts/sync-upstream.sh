#!/usr/bin/env bash
# Fork-sync: rebase this fork's master onto upstream/master and re-verify the
# fork-owned game capability against the new base. The strategy and conflict
# playbook live in .agents/notes/implemented/process/2026-08-18-fork-sync-strategy.md.
#
# Usage:
#   scripts/sync-upstream.sh          # rebase onto upstream/master and run gates (no push)
#   scripts/sync-upstream.sh --push   # same, then publish with --force-with-lease
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Reusing rerere resolutions is the point of the weekly-rebase strategy.
git config rerere.enabled true >/dev/null 2>&1 || true
git config rerere.autoupdate true >/dev/null 2>&1 || true

git fetch upstream
BASE=upstream/master
HEAD_BEFORE=$(git rev-parse fork/master)

git checkout -B sync/upstream "$HEAD_BEFORE"
git rebase "$BASE"

echo "Rebased onto $(git rev-parse --short "$BASE"). Running the focused gates…"

# The game group is the fork's divergence; its tests plus the doc gates are
# the evidence a rebase must preserve.
pnpm exec vitest run packages/game
pnpm run doc-sync
pnpm run lint
pnpm exec tsc -b tsconfig.host.json

if [[ "${1:-}" == "--push" ]]; then
  git push --force-with-lease=fork/master:"$HEAD_BEFORE" fork HEAD:master
  git checkout master
  git branch -D sync/upstream
  echo "Published. fork/master is now $(git rev-parse --short fork/master)."
else
  echo "Rebase and gates succeeded on branch sync/upstream — review, then rerun with --push."
fi
