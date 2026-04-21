#!/usr/bin/env bash
# install.sh — one-time machine setup for claude-chameleon.
# Installs core agents/commands/rules into ~/.claude and records forge_root.
# Profile activation happens per-project via /explore.
#
# Usage:
#   ./install.sh              # install core globally (run once per machine)
#   ./install.sh --validate   # verify core installation is healthy
#   ./install.sh --dry-run    # preview without making changes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Windows check (before anything else)
if [[ "${OS:-}" == "Windows_NT" ]]; then
  echo "✗ claude-chameleon requires WSL2 on Windows."
  echo "  Install WSL2 and re-run from a WSL terminal."
  exit 1
fi

# Node.js check
if ! command -v node &> /dev/null; then
  echo "✗ Node.js 20+ is required but not found."
  echo "  Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -e "console.log(process.versions.node.split('.')[0])")
if [[ "$NODE_VERSION" -lt 20 ]]; then
  echo "✗ Node.js 20+ required (found v$(node --version | tr -d 'v'))."
  echo "  Upgrade at https://nodejs.org"
  exit 1
fi

# Symlink support check
SYMLINK_TEST="$(mktemp -u /tmp/forge-symlink-test-XXXXXX)"
trap 'rm -f "$SYMLINK_TEST"' EXIT
if ! ln -s /dev/null "$SYMLINK_TEST" 2>/dev/null; then
  echo "⚠ Symlink creation failed on this system."
  echo "  claude-chameleon requires symlink support (macOS/Linux)."
  exit 1
fi

echo "claude-chameleon — Claude Code's development kit that adapts to any stack."
echo ""

# Pass all arguments to claude-chameleon-setup.js
exec node "${SCRIPT_DIR}/install/claude-chameleon-setup.js" "$@"
