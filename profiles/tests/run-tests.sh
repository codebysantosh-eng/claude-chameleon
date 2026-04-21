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
INSTALLER="${REPO_ROOT}/install/activate-profiles.js"

PASS=0
FAIL=0
FILTER="${1:-all}"

# Initialize temp resources early so the single trap can safely clean them up.
seen_ids_file=""
TEST_TMPDIR=""
HOOK_RESULT_TMP=""

cleanup() {
  rm -f "${seen_ids_file:-}"
  rm -f "${HOOK_RESULT_TMP:-}"
  rm -rf "${TEST_TMPDIR:-}"
}
trap cleanup EXIT

# ─── Helpers ──────────────────────────────────────────────────────────────────

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; echo "    $2"; FAIL=$((FAIL + 1)); }

# run_suite prints a banner and returns 0 if the suite should run, 1 if filtered out.
# Callers wrap suite bodies in `if run_suite "name"; then ... fi`.
run_suite() {
  local name="$1"
  if [[ "$FILTER" != "all" && "$FILTER" != "$name" ]]; then
    return 1
  fi
  echo ""
  echo "─── $name ───────────────────────────────────────────────────"
  return 0
}

# ─── 1. Profile Format Validation ────────────────────────────────────────────

if run_suite "format"; then

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

  # mcp.json must be valid JSON if present
  if [[ -f "${profile_dir}/mcp.json" ]]; then
    if node -e "JSON.parse(require('fs').readFileSync('${profile_dir}/mcp.json','utf8'))" 2>/dev/null; then
      pass "${profile}/mcp.json is valid JSON"
      if node -e "const m=JSON.parse(require('fs').readFileSync('${profile_dir}/mcp.json','utf8')); if(!m.mcpServers||typeof m.mcpServers!=='object') process.exit(1)" 2>/dev/null; then
        pass "${profile}/mcp.json has mcpServers object"
      else
        fail "${profile}/mcp.json has mcpServers object" "Missing or invalid mcpServers key"
      fi
    else
      fail "${profile}/mcp.json is valid JSON" "JSON parse error"
    fi
  fi

  # rules.md must be <= 5 lines (4 content lines + 1 trailing newline)
  if [[ -f "${profile_dir}/rules.md" ]]; then
    line_count=$(wc -l < "${profile_dir}/rules.md")
    if [[ $line_count -le 5 ]]; then
      pass "${profile}/rules.md <= 5 lines ($line_count)"
    else
      fail "${profile}/rules.md <= 5 lines" "Got ${line_count} lines — exceeds 4-line always-on limit"
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

# commands.json schema validation — check required keys exist
for profile_dir in "${PROFILES_DIR}"/*/; do
  profile=$(basename "$profile_dir")
  [[ "$profile" == "tests" ]] && continue
  cmds_file="${profile_dir}/commands.json"
  [[ -f "$cmds_file" ]] || continue
  for key in test lint format build audit coverage format-check logs; do
    if node -e "const c=JSON.parse(require('fs').readFileSync('${cmds_file}','utf8')).commands||{}; if(!(Object.prototype.hasOwnProperty.call(c,'${key}'))) process.exit(1)" 2>/dev/null; then
      pass "${profile}/commands.json has '${key}' key"
    else
      fail "${profile}/commands.json has '${key}' key" "Missing required key '${key}'"
    fi
  done
done

fi  # end "format" suite

# ─── 2. Hook ID Uniqueness ────────────────────────────────────────────────────

if run_suite "hooks"; then

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
for id in "${all_ids[@]}"; do
  if grep -qxF "$id" "$seen_ids_file" 2>/dev/null; then
    fail "Unique hook ID: $id" "Duplicate found across profiles"
  else
    echo "$id" >> "$seen_ids_file"
    pass "Unique hook ID: $id"
  fi
done

fi  # end "hooks" suite

# ─── 3. Detector Scoring ──────────────────────────────────────────────────────

# TEST_TMPDIR is created unconditionally so later suites (case-insensitive,
# coldstart) can reuse it. Cleanup is handled by the single EXIT trap above.
TEST_TMPDIR=$(mktemp -d)

if run_suite "detect"; then

# Mock Django project
DJANGO_PROJECT="${TEST_TMPDIR}/django-app"
mkdir -p "${DJANGO_PROJECT}/scrapers"
touch "${DJANGO_PROJECT}/manage.py"
echo "django==4.2" > "${DJANGO_PROJECT}/requirements.txt"
echo '{"name": "django-app"}' > "${DJANGO_PROJECT}/package.json"  # bundler present too

# Mock FastAPI project
FASTAPI_PROJECT="${TEST_TMPDIR}/fastapi-app"
mkdir -p "${FASTAPI_PROJECT}/app"
echo "fastapi==0.100.0" > "${FASTAPI_PROJECT}/requirements.txt"
cat > "${FASTAPI_PROJECT}/pyproject.toml" << 'EOF'
[project]
dependencies = ["fastapi"]
EOF

# Mock TypeScript project
TS_PROJECT="${TEST_TMPDIR}/ts-app"
mkdir -p "${TS_PROJECT}/src"
echo '{}' > "${TS_PROJECT}/tsconfig.json"
touch "${TS_PROJECT}/src/index.ts"
echo '{"dependencies": {"typescript": "^5.0.0"}}' > "${TS_PROJECT}/package.json"

# Mock PHP Symfony project
PHP_PROJECT="${TEST_TMPDIR}/symfony-app"
mkdir -p "${PHP_PROJECT}/src/Controller"
touch "${PHP_PROJECT}/symfony.lock"
echo '{"require": {"symfony/framework-bundle": "^7.0"}}' > "${PHP_PROJECT}/composer.json"

# Mock Prisma project
PRISMA_PROJECT="${TEST_TMPDIR}/prisma-app"
mkdir -p "${PRISMA_PROJECT}/prisma"
touch "${PRISMA_PROJECT}/prisma/schema.prisma"
echo '{"dependencies": {"@prisma/client": "^5.0.0"}}' > "${PRISMA_PROJECT}/package.json"

# Mock Next.js project
NEXTJS_PROJECT="${TEST_TMPDIR}/nextjs-app"
mkdir -p "${NEXTJS_PROJECT}/app"
touch "${NEXTJS_PROJECT}/next.config.js"
echo '{"dependencies": {"next": "^14.0.0"}}' > "${NEXTJS_PROJECT}/package.json"
touch "${NEXTJS_PROJECT}/app/page.tsx"

echo ""
echo "  Fixture projects created:"
echo "  Django:   $DJANGO_PROJECT"
echo "  FastAPI:  $FASTAPI_PROJECT"
echo "  TypeScript: $TS_PROJECT"
echo "  Symfony:  $PHP_PROJECT"
echo "  Prisma:   $PRISMA_PROJECT"
echo "  Next.js:  $NEXTJS_PROJECT"
echo ""

# Test that Django detects on Django project
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${DJANGO_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('python-django'));
process.exit(line && line.includes('✓') ? 0 : 1);
" 2>/dev/null; then
  pass "python-django detected on Django project"
else
  fail "python-django detected on Django project" "Profile not in detect output"
fi

# Test that TypeScript does NOT detect on Django project (no tsconfig.json, no .ts files)
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${DJANGO_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
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
const r = spawnSync('node', ['${INSTALLER}', '--project', '${TS_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('typescript'));
process.exit(line && line.includes('✓') ? 0 : 1);
" 2>/dev/null; then
  pass "typescript detected on TypeScript project"
else
  fail "typescript detected on TypeScript project" "Profile not in detect output"
fi

# Test FastAPI detection
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${FASTAPI_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('python-fastapi'));
process.exit(line && line.includes('✓') ? 0 : 1);
" 2>/dev/null; then
  pass "python-fastapi detected on FastAPI project"
else
  fail "python-fastapi detected on FastAPI project" "Profile not in detect output"
fi

# Test Symfony detection
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${PHP_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('php-symfony'));
process.exit(line && line.includes('✓') ? 0 : 1);
" 2>/dev/null; then
  pass "php-symfony detected on Symfony project"
else
  fail "php-symfony detected on Symfony project" "Profile not in detect output"
fi

# Test Prisma detection
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${PRISMA_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('prisma'));
process.exit(line && line.includes('✓') ? 0 : 1);
" 2>/dev/null; then
  pass "prisma detected on Prisma project"
else
  fail "prisma detected on Prisma project" "Profile not in detect output"
fi

# Test Next.js detection
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${NEXTJS_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('nextjs'));
process.exit(line && line.includes('✓') ? 0 : 1);
" 2>/dev/null; then
  pass "nextjs detected on Next.js project"
else
  fail "nextjs detected on Next.js project" "Profile not in detect output"
fi

# Cross-profile false-positive: python-fastapi must NOT activate on a pure Django project
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${DJANGO_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const fastapiLine = lines.find(l => l.includes('python-fastapi'));
process.exit(fastapiLine && fastapiLine.includes('✓') ? 1 : 0);
" 2>/dev/null; then
  pass "python-fastapi NOT falsely detected on Django project"
else
  fail "python-fastapi NOT falsely detected on Django project" "FastAPI was activated on a Django-only project"
fi

# Cross-profile false-positive: python-django must NOT activate on a pure FastAPI project
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${FASTAPI_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const djangoLine = lines.find(l => l.includes('python-django'));
process.exit(djangoLine && djangoLine.includes('✓') ? 1 : 0);
" 2>/dev/null; then
  pass "python-django NOT falsely detected on FastAPI project"
else
  fail "python-django NOT falsely detected on FastAPI project" "Django was activated on a FastAPI-only project"
fi

fi  # end "detect" suite

# ─── 4. Case-insensitive file-contains detection ──────────────────────────────

if run_suite "case-insensitive"; then

# Test that Django==4.2 (capitalized) matches 'django' detector
CASE_PROJECT="${TEST_TMPDIR}/case-test"
mkdir -p "$CASE_PROJECT"
echo "Django==4.2" > "${CASE_PROJECT}/requirements.txt"  # capital D
touch "${CASE_PROJECT}/manage.py"

if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${CASE_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('python-django'));
process.exit(line && line.includes('✓') ? 0 : 1);
" 2>/dev/null; then
  pass "file-contains is case-insensitive (Django==4.2 matches 'django')"
else
  fail "file-contains is case-insensitive" "Django==4.2 not matched by lowercase detector"
fi

fi  # end "case-insensitive" suite

# ─── 5. Cold Start (no .forge.yaml) ──────────────────────────────────────────

if run_suite "coldstart"; then

NO_CONFIG_PROJECT="${TEST_TMPDIR}/no-config"
mkdir -p "$NO_CONFIG_PROJECT"

# Should not crash, should print detection message.
# Use an explicit timeout so a hung installer cannot stall the suite, and
# surface stderr so CI logs show real crash details.
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${NO_CONFIG_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8', timeout: 30000});
if (r.status !== 0) { process.stderr.write(r.stderr || ''); }
process.exit(r.status === 0 ? 0 : 1);
"; then
  pass "cold start (no .forge.yaml) exits cleanly"
else
  fail "cold start (no .forge.yaml) exits cleanly" "Process crashed or timed out"
fi

fi  # end "coldstart" suite

# ─── 6. Core Rules Token Cap ─────────────────────────────────────────────────

if run_suite "corerules"; then

CORE_RULES_DIR="${REPO_ROOT}/core/rules"
MAX_CORE_RULE_LINES=60

for rule_file in "${CORE_RULES_DIR}"/*.md; do
  [[ -f "$rule_file" ]] || continue
  rule_name=$(basename "$rule_file")
  line_count=$(wc -l < "$rule_file")
  if [[ $line_count -le $MAX_CORE_RULE_LINES ]]; then
    pass "core/rules/${rule_name} <= ${MAX_CORE_RULE_LINES} lines ($line_count)"
  else
    fail "core/rules/${rule_name} <= ${MAX_CORE_RULE_LINES} lines" "Got ${line_count} lines — trim always-on context"
  fi
done

fi  # end "corerules" suite

# ─── 7. Hook Script Smoke Tests ───────────────────────────────────────────────

if run_suite "hooks-smoke"; then

HOOK_SCRIPTS_DIR="${REPO_ROOT}/core/hooks/scripts"

# Each hook must emit valid JSON with a 'decision' field when given a benign Write input
BENIGN_PAYLOAD='{"tool_name":"Write","tool_input":{"file_path":"/tmp/test.txt","content":"hello world"}}'
HOOK_RESULT_TMP=$(mktemp)

for script in secret-detector.js large-file-warn.js env-gitignore-guard.js block-hook-bypass.js block-force-push.js; do
  hook_path="${HOOK_SCRIPTS_DIR}/${script}"
  [[ -f "$hook_path" ]] || continue
  # Truncate result file so a crashed hook cannot leak the prior iteration's
  # JSON (which would otherwise register as a false pass).
  : > "$HOOK_RESULT_TMP"
  if echo "$BENIGN_PAYLOAD" | node "$hook_path" > "$HOOK_RESULT_TMP" 2>/dev/null; then
    if node -e "
const r = JSON.parse(require('fs').readFileSync('${HOOK_RESULT_TMP}', 'utf8'));
if (!r.decision) process.exit(1);
" 2>/dev/null; then
      pass "hook smoke: ${script} emits valid JSON with 'decision' field"
    else
      fail "hook smoke: ${script} emits valid JSON with 'decision' field" "no decision field in output: $(cat ${HOOK_RESULT_TMP})"
    fi
  else
    fail "hook smoke: ${script} emits valid JSON with 'decision' field" "non-zero exit from hook script"
  fi
done

fi  # end "hooks-smoke" suite

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "═══════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
