#!/usr/bin/env bash
# install.sh — thin bash wrapper around forge-installer.js
# claude-chameleon: Claude Code's development kit that adapts to any stack.
#
# Usage:
#   ./install.sh --detect                          # auto-detect stack
#   ./install.sh --profile typescript,nextjs       # install specific profiles
#   ./install.sh --validate                        # health check
#   ./install.sh --dry-run --detect                # preview without changes
#   ./install.sh --project ~/my-app --detect       # target a different project

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
if ! ln -s /dev/null /tmp/forge-symlink-test 2>/dev/null; then
  echo "⚠ Symlink creation failed on this system."
  echo "  claude-chameleon requires symlink support (macOS/Linux)."
  exit 1
fi
rm -f /tmp/forge-symlink-test

echo "claude-chameleon — Claude Code's development kit that adapts to any stack."
echo ""

# Pass all arguments to forge-installer.js
exec node "${SCRIPT_DIR}/install/forge-installer.js" "$@"
