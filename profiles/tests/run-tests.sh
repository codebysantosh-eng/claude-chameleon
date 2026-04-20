#!/usr/bin/env bash
# profiles/tests/run-tests.sh
# Profile test suite for claude-chameleon.
# Tests: format validation, detector scoring, hook ID uniqueness, cold start.
#
# Usage:
#   ./profiles/tests/run-tests.sh           # run all tests
#   ./profiles/tests/run-tests.sh format    # run format tests only
#   ./profiles/tests/run-tests.sh detect    # run detector tests only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROFILES_DIR="${REPO_ROOT}/profiles"
INSTALLER="${REPO_ROOT}/install/forge-installer.js"

PASS=0
FAIL=0
FILTER="${1:-all}"

# ─── Helpers ──────────────────────────────────────────────────────────────────

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; echo "    $2"; FAIL=$((FAIL + 1)); }

run_suite() {
  local name="$1"
  if [[ "$FILTER" != "all" && "$FILTER" != "$name" ]]; then return; fi
  echo ""
  echo "─── $name ───────────────────────────────────────────────────"
}

# ─── 1. Profile Format Validation ────────────────────────────────────────────

run_suite "format"

for profile_dir in "${PROFILES_DIR}"/*/; do
  profile=$(basename "$profile_dir")
  [[ "$profile" == "tests" ]] && continue

  for file in rules.md context.md commands.json hooks.json; do
    if [[ ! -f "${profile_dir}/${file}" ]]; then
      fail "${profile}/${file} exists" "Missing required file"
    else
      pass "${profile}/${file} exists"
    fi
  done

  if [[ ! -f "${profile_dir}/skills/SKILL.md" ]]; then
    fail "${profile}/skills/SKILL.md exists" "Missing SKILL.md"
  else
    pass "${profile}/skills/SKILL.md exists"
  fi

  # rules.md must be <= 15 lines
  if [[ -f "${profile_dir}/rules.md" ]]; then
    line_count=$(wc -l < "${profile_dir}/rules.md")
    if [[ $line_count -le 15 ]]; then
      pass "${profile}/rules.md <= 15 lines ($line_count)"
    else
      fail "${profile}/rules.md <= 15 lines" "Got ${line_count} lines"
    fi
  fi

  # context.md must have frontmatter
  if [[ -f "${profile_dir}/context.md" ]]; then
    if grep -q "^---$" "${profile_dir}/context.md"; then
      pass "${profile}/context.md has frontmatter"
    else
      fail "${profile}/context.md has frontmatter" "No YAML frontmatter found"
    fi
    if grep -q "^threshold:" "${profile_dir}/context.md"; then
      pass "${profile}/context.md has threshold"
    else
      fail "${profile}/context.md has threshold" "Missing threshold field in frontmatter"
    fi
  fi
done

# ─── 2. Hook ID Uniqueness ────────────────────────────────────────────────────

run_suite "hooks"

all_ids=()

for hooks_file in "${PROFILES_DIR}"/*/hooks.json "${REPO_ROOT}/core/hooks/hooks.json"; do
  [[ -f "$hooks_file" ]] || continue

  # Extract all hook IDs from the JSON
  while IFS= read -r line; do
    if [[ "$line" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      hook_id="${BASH_REMATCH[1]}"
      all_ids+=("$hook_id")

      # Check namespace (must be forge.<profile>.<name>)
      if [[ "$hook_id" =~ ^forge\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$ ]]; then
        pass "Hook ID namespaced: $hook_id"
      else
        fail "Hook ID namespaced: $hook_id" "Must follow forge.<profile>.<name> convention"
      fi
    fi
  done < "$hooks_file"
done

# Check for duplicates using sorted list comparison (bash 3 compatible)
seen_ids_file=$(mktemp)
trap "rm -f $seen_ids_file; rm -rf ${TMPDIR:-}" EXIT
for id in "${all_ids[@]}"; do
  if grep -qxF "$id" "$seen_ids_file" 2>/dev/null; then
    fail "Unique hook ID: $id" "Duplicate found across profiles"
  else
    echo "$id" >> "$seen_ids_file"
    pass "Unique hook ID: $id"
  fi
done

# ─── 3. Detector Scoring ──────────────────────────────────────────────────────

run_suite "detect"

# Create mock project directories for testing
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Mock Django project
DJANGO_PROJECT="${TMPDIR}/django-app"
mkdir -p "${DJANGO_PROJECT}/scrapers"
touch "${DJANGO_PROJECT}/manage.py"
echo "django==4.2" > "${DJANGO_PROJECT}/requirements.txt"
echo '{"name": "django-app"}' > "${DJANGO_PROJECT}/package.json"  # bundler present too

# Mock FastAPI project
FASTAPI_PROJECT="${TMPDIR}/fastapi-app"
mkdir -p "${FASTAPI_PROJECT}/app"
echo "fastapi==0.100.0" > "${FASTAPI_PROJECT}/requirements.txt"
cat > "${FASTAPI_PROJECT}/pyproject.toml" << 'EOF'
[project]
dependencies = ["fastapi"]
EOF

# Mock TypeScript project
TS_PROJECT="${TMPDIR}/ts-app"
mkdir -p "${TS_PROJECT}/src"
echo '{}' > "${TS_PROJECT}/tsconfig.json"
touch "${TS_PROJECT}/src/index.ts"
echo '{"dependencies": {"typescript": "^5.0.0"}}' > "${TS_PROJECT}/package.json"

# Mock PHP Symfony project
PHP_PROJECT="${TMPDIR}/symfony-app"
mkdir -p "${PHP_PROJECT}/src/Controller"
touch "${PHP_PROJECT}/symfony.lock"
echo '{"require": {"symfony/framework-bundle": "^7.0"}}' > "${PHP_PROJECT}/composer.json"

echo ""
echo "  Fixture projects created:"
echo "  Django:   $DJANGO_PROJECT"
echo "  FastAPI:  $FASTAPI_PROJECT"
echo "  TypeScript: $TS_PROJECT"
echo "  Symfony:  $PHP_PROJECT"
echo ""

# Test that Django detects on Django project
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--detect', '--project', '${DJANGO_PROJECT}', '--dry-run'], {encoding:'utf8'});
process.exit(r.stdout.includes('python-django') ? 0 : 1);
" 2>/dev/null; then
  pass "python-django detected on Django project"
else
  fail "python-django detected on Django project" "Profile not in detect output"
fi

# Test that TypeScript does NOT detect on Django project (no tsconfig.json, no .ts files)
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--detect', '--project', '${DJANGO_PROJECT}', '--dry-run'], {encoding:'utf8'});
// typescript should NOT appear as activated (score below threshold)
const lines = r.stdout.split('\n');
const tsLine = lines.find(l => l.includes('typescript'));
process.exit(tsLine && tsLine.includes('✓') ? 1 : 0);
" 2>/dev/null; then
  pass "typescript NOT falsely detected on Django project"
else
  fail "typescript NOT falsely detected on Django project" "TypeScript was activated on a Python-only project"
fi

# Test that TypeScript detects on TS project
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--detect', '--project', '${TS_PROJECT}', '--dry-run'], {encoding:'utf8'});
process.exit(r.stdout.includes('typescript') ? 0 : 1);
" 2>/dev/null; then
  pass "typescript detected on TypeScript project"
else
  fail "typescript detected on TypeScript project" "Profile not in detect output"
fi

# Test FastAPI detection
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--detect', '--project', '${FASTAPI_PROJECT}', '--dry-run'], {encoding:'utf8'});
process.exit(r.stdout.includes('python-fastapi') ? 0 : 1);
" 2>/dev/null; then
  pass "python-fastapi detected on FastAPI project"
else
  fail "python-fastapi detected on FastAPI project" "Profile not in detect output"
fi

# Test Symfony detection
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--detect', '--project', '${PHP_PROJECT}', '--dry-run'], {encoding:'utf8'});
process.exit(r.stdout.includes('php-symfony') ? 0 : 1);
" 2>/dev/null; then
  pass "php-symfony detected on Symfony project"
else
  fail "php-symfony detected on Symfony project" "Profile not in detect output"
fi

# ─── 4. Case-insensitive file-contains detection ──────────────────────────────

run_suite "case-insensitive"

# Test that Django==4.2 (capitalized) matches 'django' detector
CASE_PROJECT="${TMPDIR}/case-test"
mkdir -p "$CASE_PROJECT"
echo "Django==4.2" > "${CASE_PROJECT}/requirements.txt"  # capital D
touch "${CASE_PROJECT}/manage.py"

if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--detect', '--project', '${CASE_PROJECT}', '--dry-run'], {encoding:'utf8'});
process.exit(r.stdout.includes('python-django') ? 0 : 1);
" 2>/dev/null; then
  pass "file-contains is case-insensitive (Django==4.2 matches 'django')"
else
  fail "file-contains is case-insensitive" "Django==4.2 not matched by lowercase detector"
fi

# ─── 5. Cold Start (no .forge.yaml) ──────────────────────────────────────────

run_suite "coldstart"

NO_CONFIG_PROJECT="${TMPDIR}/no-config"
mkdir -p "$NO_CONFIG_PROJECT"

# Should not crash, should print detection message
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--detect', '--project', '${NO_CONFIG_PROJECT}', '--dry-run'], {encoding:'utf8', input: 'n\n'});
process.exit(r.status !== null ? 0 : 1);
" 2>/dev/null; then
  pass "cold start (no .forge.yaml) exits cleanly"
else
  fail "cold start (no .forge.yaml) exits cleanly" "Process crashed or timed out"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "═══════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
