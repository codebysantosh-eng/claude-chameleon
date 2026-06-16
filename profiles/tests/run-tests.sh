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

  # rules.md must be <= 4 lines (the always-on limit documented in CLAUDE.md / AUTHORING.md)
  if [[ -f "${profile_dir}/rules.md" ]]; then
    line_count=$(wc -l < "${profile_dir}/rules.md")
    if [[ $line_count -le 4 ]]; then
      pass "${profile}/rules.md <= 4 lines ($line_count)"
    else
      fail "${profile}/rules.md <= 4 lines" "Got ${line_count} lines — exceeds the 4-line always-on limit"
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

# Mock PHP Laravel project
LARAVEL_PROJECT="${TEST_TMPDIR}/laravel-app"
mkdir -p "${LARAVEL_PROJECT}/app/Http/Controllers"
touch "${LARAVEL_PROJECT}/artisan"
echo '{"require": {"laravel/framework": "^11.0"}}' > "${LARAVEL_PROJECT}/composer.json"

echo ""
echo "  Fixture projects created:"
echo "  Django:   $DJANGO_PROJECT"
echo "  FastAPI:  $FASTAPI_PROJECT"
echo "  TypeScript: $TS_PROJECT"
echo "  Symfony:  $PHP_PROJECT"
echo "  Laravel:  $LARAVEL_PROJECT"
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

# Test Laravel detection
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${LARAVEL_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('php-laravel'));
process.exit(line && line.includes('✓') ? 0 : 1);
" 2>/dev/null; then
  pass "php-laravel detected on Laravel project"
else
  fail "php-laravel detected on Laravel project" "Profile not in detect output"
fi

# Test that Laravel does NOT falsely detect on a Symfony project
if node -e "
const {spawnSync} = require('child_process');
const r = spawnSync('node', ['${INSTALLER}', '--project', '${PHP_PROJECT}', '--forge-root', '${REPO_ROOT}', '--dry-run', '--yes'], {encoding:'utf8'});
const lines = r.stdout.split('\n');
const line = lines.find(l => l.includes('php-laravel'));
process.exit(line && line.includes('✓') ? 1 : 0);
" 2>/dev/null; then
  pass "php-laravel NOT falsely detected on Symfony project"
else
  fail "php-laravel NOT falsely detected on Symfony project" "Laravel was activated on a Symfony project"
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

HD="${REPO_ROOT}/core/hooks/scripts"
HR=$(mktemp)
# Predicates over the parsed hook output `r` (see HOOKS.md for the contract).
DENY="r.decision==='block'||(r.hookSpecificOutput&&r.hookSpecificOutput.permissionDecision==='deny')"
WARN="typeof r.systemMessage==='string'"
NEUTRAL="!(${DENY})&&!r.systemMessage"

# run a hook with a payload, assert the parsed output satisfies a node predicate
assert_hook() { # label hookpath payload predicate
  : > "$HR"
  printf '%s' "$3" | node "$2" > "$HR" 2>/dev/null
  if node -e "const r=JSON.parse(require('fs').readFileSync('${HR}','utf8'));process.exit((${4})?0:1);" 2>/dev/null; then
    pass "$1"
  else
    fail "$1" "got: $(cat ${HR})"
  fi
}

if run_suite "hooks-smoke"; then
# Benign input → valid JSON and NOT a block (neutral = {} under the new contract).
BENIGN='{"tool_name":"Write","tool_input":{"file_path":"/tmp/t.txt","content":"hello world"}}'
for script in secret-detector.js large-file-warn.js env-gitignore-guard.js block-hook-bypass.js block-force-push.js; do
  [[ -f "${HD}/${script}" ]] || continue
  assert_hook "hook smoke: ${script} valid JSON + allows benign input" "${HD}/${script}" "$BENIGN" "!(${DENY})"
done
fi  # end "hooks-smoke" suite

if run_suite "hooks-behavior"; then
# Assembled so this test file itself doesn't trip the live secret-detector on write.
SK="sk_""live_""AAAABBBBCCCCDDDD1111"
assert_hook "secret-detector blocks a real secret"        "${HD}/secret-detector.js" "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"a.js\",\"content\":\"key=${SK}\"}}" "$DENY"
assert_hook "secret-detector allows a placeholder"        "${HD}/secret-detector.js" '{"tool_name":"Write","tool_input":{"file_path":"a.js","content":"password = \"changeme123\""}}' "$NEUTRAL"
assert_hook "secret-detector fails closed on bad input"   "${HD}/secret-detector.js" 'garbage-not-json' "$DENY"
assert_hook "block-force-push blocks --force"             "${HD}/block-force-push.js" '{"tool_name":"Bash","tool_input":{"command":"git push --force"}}' "$DENY"
assert_hook "block-force-push allows a chained -f flag"   "${HD}/block-force-push.js" '{"tool_name":"Bash","tool_input":{"command":"git push origin main && grep -f p.txt"}}' "$NEUTRAL"
assert_hook "block-hook-bypass blocks commit -n"          "${HD}/block-hook-bypass.js" '{"tool_name":"Bash","tool_input":{"command":"git commit -n -m x"}}' "$DENY"
assert_hook "block-hook-bypass allows a plain commit"     "${HD}/block-hook-bypass.js" '{"tool_name":"Bash","tool_input":{"command":"git commit -m ok"}}' "$NEUTRAL"
assert_hook "warn hook emits systemMessage"               "${REPO_ROOT}/profiles/typescript/hooks/console-log-warn.js" '{"tool_name":"Write","tool_input":{"file_path":"x.ts","content":"console.log(1)"}}' "$WARN"
assert_hook "warn hook stays neutral on bad input"        "${REPO_ROOT}/profiles/typescript/hooks/console-log-warn.js" 'garbage-not-json' "$NEUTRAL"
fi  # end "hooks-behavior" suite

if run_suite "lib-unit"; then
# yaml: 2-space AND 4-space lists, comments, quotes
node -e "const {parseSimpleYaml:p}=require('${REPO_ROOT}/install/lib/yaml.js');
const a=p('profiles:\n  - typescript\n  - nextjs'), b=p('# c\nprofiles:\n    - typescript');
process.exit(a.profiles.length===2 && b.profiles[0]==='typescript' ? 0:1);" 2>/dev/null \
  && pass "yaml: parses 2-space and 4-space lists" || fail "yaml: parses 2-space and 4-space lists"

# hooks.js: merge→remove round-trip preserves user keys, strips forge, and is non-mutating
node -e "const {mergeHooksIntoSettings:m,removeForgeHooksFromSettings:r}=require('${REPO_ROOT}/install/lib/hooks.js');
const orig={userKey:1};
const merged=m({hooks:{PreToolUse:[{matcher:'Bash',hooks:[{id:'forge.core.x',type:'command',command:'node {{FORGE_ROOT}}/x.js'}]}]}},orig,'/r');
const cleaned=r(merged,'forge.');
process.exit(orig.hooks===undefined && merged.userKey===1 && cleaned.userKey===1 && cleaned.hooks===undefined ? 0:1);" 2>/dev/null \
  && pass "hooks.js: pure merge/remove round-trip preserves user keys" || fail "hooks.js: pure merge/remove round-trip preserves user keys"

# hooks.js: remove also strips legacy id-less entries by command path
node -e "const {removeForgeHooksFromSettings:r}=require('${REPO_ROOT}/install/lib/hooks.js');
const s={hooks:{PreToolUse:[{matcher:'Bash',hooks:[{type:'command',command:'node /x/core/hooks/scripts/secret-detector.js'}]}]}};
const c=r(s,'forge.');
process.exit(c.hooks===undefined ? 0:1);" 2>/dev/null \
  && pass "hooks.js: removes legacy id-less hooks by command path" || fail "hooks.js: removes legacy id-less hooks by command path"

# hooks.js: {{NODE}} token resolves to the absolute interpreter (never trusts PATH)
node -e "const {mergeHooksIntoSettings:m}=require('${REPO_ROOT}/install/lib/hooks.js');
const merged=m({hooks:{PreToolUse:[{matcher:'Bash',hooks:[{id:'forge.core.x',type:'command',command:'{{NODE}} {{FORGE_ROOT}}/x.js'}]}]}},{},{forgeRoot:'/r',nodePath:'/abs/node'});
const cmd=merged.hooks.PreToolUse[0].hooks[0].command;
process.exit(cmd==='/abs/node /r/x.js' ? 0:1);" 2>/dev/null \
  && pass "hooks.js: {{NODE}} token resolves to absolute interpreter" || fail "hooks.js: {{NODE}} token resolves to absolute interpreter"

# hooks.js: legacy bare 'node ' command is rewritten to the absolute interpreter (safety net)
node -e "const {mergeHooksIntoSettings:m}=require('${REPO_ROOT}/install/lib/hooks.js');
const merged=m({hooks:{PreToolUse:[{matcher:'Bash',hooks:[{id:'forge.core.x',type:'command',command:'node {{FORGE_ROOT}}/x.js'}]}]}},{},{forgeRoot:'/r',nodePath:'/abs/node'});
const cmd=merged.hooks.PreToolUse[0].hooks[0].command;
process.exit(cmd==='/abs/node /r/x.js' ? 0:1);" 2>/dev/null \
  && pass "hooks.js: legacy bare 'node' rewritten to absolute interpreter" || fail "hooks.js: legacy bare 'node' rewritten to absolute interpreter"

# hooks.js: a node path with spaces (Herd/nvm on macOS) is shell-quoted into the command.
# Regression for 'sh: /Users/.../Application: No such file or directory' (exit 127).
node -e "const {mergeHooksIntoSettings:m}=require('${REPO_ROOT}/install/lib/hooks.js');
const nodePath='/Users/x/Library/Application Support/Herd/node/bin/node';
const merged=m({hooks:{PreToolUse:[{matcher:'Bash',hooks:[{id:'forge.core.x',type:'command',command:'{{NODE}} {{FORGE_ROOT}}/x.js'}]}]}},{},{forgeRoot:'/r',nodePath});
const cmd=merged.hooks.PreToolUse[0].hooks[0].command;
const expected=\"'/Users/x/Library/Application Support/Herd/node/bin/node' /r/x.js\";
process.exit(cmd===expected ? 0:1);" 2>/dev/null \
  && pass "hooks.js: node path with spaces is shell-quoted" || fail "hooks.js: node path with spaces is shell-quoted"

# hooks.js: the quoted command actually EXECUTES under a stripped PATH when the interpreter
# lives in a directory with a space — the real-world failure, not just a string shape.
SPACED_BIN="${TEST_TMPDIR}/with space/bin"
mkdir -p "$SPACED_BIN"
ln -sf "$(command -v node)" "${SPACED_BIN}/node"
node -e "
const {mergeHooksIntoSettings:m}=require('${REPO_ROOT}/install/lib/hooks.js');
const {spawnSync}=require('child_process');
const nodePath='${SPACED_BIN}/node';
const merged=m({hooks:{PreToolUse:[{matcher:'Write',hooks:[{id:'forge.core.x',type:'command',command:'{{NODE}} {{FORGE_ROOT}}/core/hooks/scripts/large-file-warn.js'}]}]}},{},{forgeRoot:'${REPO_ROOT}',nodePath});
const cmd=merged.hooks.PreToolUse[0].hooks[0].command;
const r=spawnSync(cmd,{shell:true,input:'{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/t.txt\",\"content\":\"hi\"}}',env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME},timeout:10000});
process.exit(r.status===0 ? 0:1);" 2>/dev/null \
  && pass "hooks.js: spaced interpreter path executes under stripped PATH" || fail "hooks.js: spaced interpreter path executes under stripped PATH"
fi  # end "lib-unit" suite

# ─── 8. Handoff Generator ────────────────────────────────────────────────────
# The orchestrator handoff is generated deterministically by install/print-handoff.js
# (no LLM formatting). These tests pin the contract: success shape, routing/collision,
# and explicit (never silent) generic-mode blocks with reason codes.

if run_suite "handoff"; then

HANDOFF="${REPO_ROOT}/install/print-handoff.js"

# run the generator against a fixture project, assert a node predicate over stdout string `out`
assert_handoff() { # label project predicate
  if node -e "
const {spawnSync}=require('child_process');
const r=spawnSync('node',['${HANDOFF}','--forge-root','${REPO_ROOT}','--project','$2'],{encoding:'utf8'});
const out=r.stdout||'';
process.exit((($3)) && r.status===0 ? 0:1);
" 2>/dev/null; then
    pass "$1"
  else
    fail "$1" "predicate failed"
  fi
}

# success: single profile emits a well-formed, versioned handoff block
H_TS="${TEST_TMPDIR}/handoff-ts"
mkdir -p "$H_TS"
printf 'profiles:\n  - typescript\n' > "${H_TS}/.forge.yaml"
assert_handoff "handoff: success block for typescript" "$H_TS" \
  "out.includes('<<<FORGE_HANDOFF>>>') && out.includes('<<<END_FORGE_HANDOFF>>>') && out.includes('HANDOFF_VERSION: 1') && out.includes('ACTIVE_PROFILES: typescript |') && out.includes('test:npx vitest run') && out.includes('COLLISION_RULE: first listed profile wins')"

# routing + collision: the first-listed profile claims shared extensions
H_COL="${TEST_TMPDIR}/handoff-collision"
mkdir -p "$H_COL"
printf 'profiles:\n  - typescript\n  - nextjs\n' > "${H_COL}/.forge.yaml"
assert_handoff "handoff: first-listed profile wins extension collision" "$H_COL" \
  "out.includes('FILE_ROUTING: .ts,.tsx,.mts,.cts') && out.includes('.jsx,.js') && out.split('ACTIVE_PROFILES:').length===3"

# null command surfaces as 'none', never a blank/garbage command
H_PRISMA="${TEST_TMPDIR}/handoff-prisma"
mkdir -p "$H_PRISMA"
printf 'profiles:\n  - prisma\n' > "${H_PRISMA}/.forge.yaml"
assert_handoff "handoff: null test command renders as 'none'" "$H_PRISMA" \
  "out.includes('ACTIVE_PROFILES: prisma |') && out.includes('test:none')"

# generic: no .forge.yaml → explicit generic block, never a silent absence
H_NONE="${TEST_TMPDIR}/handoff-none"
mkdir -p "$H_NONE"
assert_handoff "handoff: explicit generic block when no .forge.yaml" "$H_NONE" \
  "out.includes('<<<FORGE_GENERIC_MODE>>>') && out.includes('REASON: no-forge-yaml') && !out.includes('<<<FORGE_HANDOFF>>>')"

# generic: unknown profile → broken-profile reason
H_BROKEN="${TEST_TMPDIR}/handoff-broken"
mkdir -p "$H_BROKEN"
printf 'profiles:\n  - nonexistent-profile\n' > "${H_BROKEN}/.forge.yaml"
assert_handoff "handoff: broken-profile reason for unknown profile" "$H_BROKEN" \
  "out.includes('<<<FORGE_GENERIC_MODE>>>') && out.includes('REASON: broken-profile')"

# bad forge-root → forge-root-not-readable, and still exits 0 (generic mode is not a crash)
if node -e "
const {spawnSync}=require('child_process');
const r=spawnSync('node',['${HANDOFF}','--forge-root','${TEST_TMPDIR}/does-not-exist','--project','${H_TS}'],{encoding:'utf8'});
const out=r.stdout||'';
process.exit(out.includes('REASON: forge-root-not-readable') && r.status===0 ? 0:1);
" 2>/dev/null; then
  pass "handoff: forge-root-not-readable when kit root missing (exit 0)"
else
  fail "handoff: forge-root-not-readable when kit root missing (exit 0)" "wrong reason or nonzero exit"
fi

fi  # end "handoff" suite

# ─── 9. Doctor (kit coherence) ───────────────────────────────────────────────
# forge-doctor statically audits the whole kit's internal cross-references. These
# tests prove it passes the committed kit AND catches injected coherence faults —
# so the doctor itself can't silently rot.

if run_suite "doctor"; then

DOCTOR="${REPO_ROOT}/install/forge-doctor.js"

# positive: the committed kit is coherent
if node "$DOCTOR" --forge-root "$REPO_ROOT" >/dev/null 2>&1; then
  pass "doctor: committed kit passes clean"
else
  fail "doctor: committed kit passes clean" "doctor reported errors on the committed kit — run: node install/forge-doctor.js"
fi

# Build a cheap copy of just what the doctor reads, then inject faults.
DOC_COPY="${TEST_TMPDIR}/kit-copy"
mkdir -p "$DOC_COPY"
for d in core agents profiles install CLAUDE.md; do cp -R "${REPO_ROOT}/${d}" "${DOC_COPY}/"; done

# sanity: the untouched copy is also clean
if node "$DOCTOR" --forge-root "$DOC_COPY" >/dev/null 2>&1; then
  pass "doctor: clean copy passes"
else
  fail "doctor: clean copy passes" "copy diverged from source"
fi

# fault 1: invalid agent model (violates the two-tier rule)
node -e 'const fs=require("fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("model: opus","model: sonnet"))' "${DOC_COPY}/core/agents/architect.md"
if node "$DOCTOR" --forge-root "$DOC_COPY" >/dev/null 2>&1; then
  fail "doctor: detects invalid agent model" "doctor passed a kit with model: sonnet"
else
  pass "doctor: detects invalid agent model"
fi
cp "${REPO_ROOT}/core/agents/architect.md" "${DOC_COPY}/core/agents/architect.md"

# fault 2: CLAUDE.md depth table drifts from the command files (drop /scan)
node -e 'const fs=require("fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("`/scan`, ",""))' "${DOC_COPY}/CLAUDE.md"
if node "$DOCTOR" --forge-root "$DOC_COPY" >/dev/null 2>&1; then
  fail "doctor: detects depth-table drift" "doctor passed a kit with /scan missing from the depth table"
else
  pass "doctor: detects depth-table drift"
fi
cp "${REPO_ROOT}/CLAUDE.md" "${DOC_COPY}/CLAUDE.md"

# fault 3: a profile loses its #a11y section (the a11y rule dereferences it)
node -e 'const fs=require("fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\n## a11y\n/," \n## REMOVED\n"))' "${DOC_COPY}/profiles/nextjs/skills/SKILL.md"
if node "$DOCTOR" --forge-root "$DOC_COPY" >/dev/null 2>&1; then
  fail "doctor: detects missing #a11y section" "doctor passed a profile with no ## a11y"
else
  pass "doctor: detects missing #a11y section"
fi
cp "${REPO_ROOT}/profiles/nextjs/skills/SKILL.md" "${DOC_COPY}/profiles/nextjs/skills/SKILL.md"

# fault 4: an agent is instructed to use a tool it isn't granted (security-scanner class)
node -e 'const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");s=s.replace("tools: Read, Grep, Glob, Bash, Edit","tools: Read, Grep, Glob, Bash");fs.writeFileSync(p,s)' "${DOC_COPY}/core/agents/security-scanner.md"
if node "$DOCTOR" --forge-root "$DOC_COPY" >/dev/null 2>&1; then
  fail "doctor: detects tool/instruction mismatch" "doctor passed an agent told to use an ungranted tool"
else
  pass "doctor: detects tool/instruction mismatch"
fi
cp "${REPO_ROOT}/core/agents/security-scanner.md" "${DOC_COPY}/core/agents/security-scanner.md"

fi  # end "doctor" suite

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "═══════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
