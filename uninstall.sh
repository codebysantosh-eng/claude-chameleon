#!/usr/bin/env bash
# uninstall.sh — remove claude-chameleon from machine or project.
# Preserves user-custom hooks (removes only forge.* namespaced hooks).
#
# Usage:
#   ./uninstall.sh                        # remove core from ~/.claude (machine uninstall)
#   ./uninstall.sh --project ~/my-app     # remove profiles from a project
#   ./uninstall.sh --dry-run              # preview without changes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
PROJECT_PATH=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_PATH="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if ! command -v node &> /dev/null; then
  echo "✗ Node.js is required to remove hooks from settings.json."
  exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "⚠ Dry run — no changes will be made."
  echo ""
fi

# ─── Project uninstall ────────────────────────────────────────────────────────

if [[ -n "$PROJECT_PATH" ]]; then
  echo "Removing profiles from project: ${PROJECT_PATH}"
  DRY_FLAG=""
  [[ "$DRY_RUN" == "true" ]] && DRY_FLAG="--dry-run"
  exec node "${SCRIPT_DIR}/install/activate-profiles.js" --project "${PROJECT_PATH}" --uninstall ${DRY_FLAG:+"$DRY_FLAG"}
fi

# ─── Machine uninstall (core) ─────────────────────────────────────────────────

echo "Uninstalling claude-chameleon core from ${CLAUDE_DIR}..."
echo ""

SETTINGS_PATH="${CLAUDE_DIR}/settings.json"

remove_link() {
  local target="$1"
  if [[ -L "$target" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "  [dry-run] remove symlink: $target"
    else
      rm "$target"
      echo "  ✓ removed: $target"
    fi
  elif [[ -f "$target" ]]; then
    echo "  ⚠ $target is a regular file (not a symlink) — skipping to avoid data loss"
  fi
}

echo "Removing core symlinks..."
for dir in agents commands rules; do
  src_dir="${SCRIPT_DIR}/core/${dir}"
  [[ -d "$src_dir" ]] || continue
  for file in "$src_dir"/*; do
    remove_link "${CLAUDE_DIR}/${dir}/$(basename "$file")"
  done
done
remove_link "${CLAUDE_DIR}/agents/stack-orchestrator.md"
remove_link "${CLAUDE_DIR}/agents/stack-orchestrator-messages.md"

echo ""
echo "Removing core hooks..."
DRY_FLAG=""
[[ "$DRY_RUN" == "true" ]] && DRY_FLAG="--dry-run"
node "${SCRIPT_DIR}/install/claude-chameleon-setup.js" --remove-hooks ${DRY_FLAG:+"$DRY_FLAG"}

echo ""
echo "Removing global config..."
GLOBAL_FORGE_YAML="${CLAUDE_DIR}/.forge.yaml"
if [[ -f "$GLOBAL_FORGE_YAML" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] would remove ${GLOBAL_FORGE_YAML}"
  else
    rm "$GLOBAL_FORGE_YAML"
    echo "  ✓ removed: ${GLOBAL_FORGE_YAML}"
  fi
fi

echo ""
echo "✓ Machine uninstall complete."
echo ""
echo "Note: Project .forge.yaml and .claude/ dirs in your projects were NOT removed."
echo "      To remove from a project: ./uninstall.sh --project <path>"
