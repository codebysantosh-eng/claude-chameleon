#!/usr/bin/env bash
# uninstall.sh — remove claude-chameleon from a project
# Preserves user-custom hooks (removes only forge.* namespaced hooks).
#
# Usage:
#   ./uninstall.sh                        # uninstall from ~/.claude
#   ./uninstall.sh --project ~/my-app     # uninstall from specific project
#   ./uninstall.sh --dry-run              # preview without changes
#   ./uninstall.sh --profile typescript   # remove only one profile

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
PROJECT_PATH=""
DRY_RUN=false
PROFILE_ONLY=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_PATH="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --profile) PROFILE_ONLY="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ "$DRY_RUN" == "true" ]]; then
  echo "⚠ Dry run — no changes will be made."
  echo ""
fi

# Node.js required for settings.json manipulation
if ! command -v node &> /dev/null; then
  echo "✗ Node.js is required to remove hooks from settings.json."
  exit 1
fi

SETTINGS_PATH="${CLAUDE_DIR}/settings.json"

# Remove a symlink (or warn if it's a real file)
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

# Remove profile symlinks
remove_profile() {
  local name="$1"
  remove_link "${CLAUDE_DIR}/rules/profile-${name}.md"
}

# Remove core symlinks
remove_core() {
  for dir in agents commands rules; do
    local src_dir="${SCRIPT_DIR}/core/${dir}"
    [[ -d "$src_dir" ]] || continue
    for file in "$src_dir"/*; do
      remove_link "${CLAUDE_DIR}/${dir}/$(basename "$file")"
    done
  done
  remove_link "${CLAUDE_DIR}/agents/stack-orchestrator.md"
}

# Remove forge hooks from settings.json using Node.js
remove_hooks() {
  local prefix="$1"
  if [[ ! -f "$SETTINGS_PATH" ]]; then return; fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] remove hooks with prefix '${prefix}' from settings.json"
    return
  fi

  node - "$SETTINGS_PATH" "$prefix" << 'EOF'
const fs = require('fs');
const settingsPath = process.argv[1];
const prefix = process.argv[2];

let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { process.exit(0); }

const hooks = settings.hooks || {};
for (const phase of ['PreToolUse', 'PostToolUse', 'Stop']) {
  if (!hooks[phase]) continue;
  hooks[phase] = hooks[phase]
    .map(entry => ({
      ...entry,
      hooks: (entry.hooks || []).filter(h => !h.id.startsWith(prefix)),
    }))
    .filter(entry => (entry.hooks || []).length > 0);
  if (hooks[phase].length === 0) delete hooks[phase];
}

if (Object.keys(hooks).length === 0) delete settings.hooks;

if (Object.keys(settings).length === 0) {
  fs.unlinkSync(settingsPath);
  console.log('  ✓ settings.json removed (empty)');
} else {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`  ✓ hooks with prefix '${prefix}' removed from settings.json`);
}
EOF
}

echo "Uninstalling claude-chameleon..."
echo ""

if [[ -n "$PROFILE_ONLY" ]]; then
  # Remove a single profile only
  echo "Removing profile: ${PROFILE_ONLY}"
  remove_profile "$PROFILE_ONLY"
  remove_hooks "forge.${PROFILE_ONLY}."
else
  # Remove all forge components
  echo "Removing core..."
  remove_core

  echo ""
  echo "Removing all profile symlinks..."
  # Find all profile symlinks in rules/
  for link in "${CLAUDE_DIR}/rules/profile-"*.md; do
    [[ -e "$link" || -L "$link" ]] || continue
    remove_link "$link"
  done

  echo ""
  echo "Removing all forge hooks..."
  remove_hooks "forge."
fi

echo ""
echo "✓ Uninstall complete."
if [[ "$DRY_RUN" == "false" ]]; then
  echo ""
  echo "Note: .forge.yaml in your project was NOT removed — delete it manually if no longer needed."
  echo "Note: Backups in .backup-* directories (if any) are untouched."
fi
