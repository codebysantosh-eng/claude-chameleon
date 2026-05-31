#!/usr/bin/env bash
# forge-worktree-add.sh — git worktree add + auto-link the source checkout's profiles.
#
# Usage:
#   forge-worktree-add.sh <source-checkout> <worktree-path> <branch> [extra git worktree args...]
#
# Example (Herd):
#   forge-worktree-add.sh ~/Herd/jetton-webapp ~/Herd/jetton-webapp-es-999 ES-999/my-feature
#
# Tip: alias it, e.g. `alias wta="$FORGE_ROOT/install/forge-worktree-add.sh ~/Herd/jetton-webapp"`
set -euo pipefail

SRC="$1"; WT="$2"; shift 2
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

git -C "$SRC" worktree add "$WT" "$@"
node "${SCRIPT_DIR}/link-worktree.js" --worktree "$WT" --source "$SRC"
