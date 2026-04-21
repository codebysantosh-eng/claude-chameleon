# Adding a New Profile to claude-chameleon

This guide covers everything needed to add a new tech stack profile from scratch.

---

## Profile Structure

Each profile is a directory under `profiles/<your-stack>/` with 5 required files plus optional additions:

```
profiles/<your-stack>/
├── rules.md          # ~4 lines, always-on, loads every session
├── context.md        # markdown tables + frontmatter, on-demand deep tasks
├── commands.json     # machine-readable command map
├── hooks.json        # stack-specific safety hooks
├── skills/SKILL.md   # deep reference with named ## sections
├── hooks/            # (optional) hook script implementations
└── mcp.json          # (optional) MCP server declarations
```

---

## Step 1: Create the directory

```bash
mkdir -p profiles/<your-stack>/{skills,hooks}
```

---

## Step 2: Write `context.md` (with frontmatter)

The frontmatter declares detectors and threshold. The body uses **markdown tables only** (not prose, not key-value).

```markdown
---
name: your-stack
displayName: Human-readable Name
detectors:
  - file: <key-file>
    weight: 4
  - file-contains: [<dep-file>, "<package-name>"]
    weight: 3
  - glob: "**/*.<ext>"
    weight: 2
threshold: 5
---

| Category | Tool | Notes |
|----------|------|-------|
| Test | <test-tool> | Coverage via <coverage-tool> |
| Lint | <lint-tool> | |
| Format | <format-tool> | |
...

| Skill topic | Reference |
|-------------|-----------|
| Testing | skills/SKILL.md#testing |
| Security | skills/SKILL.md#security |
```

### Detector weights guide

| Weight | Signal type | Example |
|--------|-------------|---------|
| 4 | Definitive — only exists in this stack | `manage.py`, `symfony.lock`, `artisan` |
| 3 | Strong — dependency in lockfile/manifest | `"django"` in requirements.txt |
| 2 | Weak — file extension (many stacks share) | `**/*.py`, `**/*.js` |

**Threshold must require 2+ signals.** Single-signal activation = false positives on any project with that extension.

### Three detector types

| Type | Syntax | How evaluated |
|------|--------|--------------|
| `file` | `file: tsconfig.json` | Check file exists |
| `glob` | `glob: "src/**/*.ts"` | Any matching file exists |
| `file-contains` | `file-contains: [req.txt, "django"]` | Case-insensitive grep |

`file-contains` is always case-insensitive. `Django==4.2` and `django>=4.0` both match `"django"`.

---

## Step 3: Write `rules.md` (~4 lines max)

Installed into `~/.claude/rules/<name>.md`. **Loads every session for every command.** Keep it tiny.

```markdown
# Active Stack: <Name>
COMMANDS: test=<cmd> | lint=<cmd> | format=<cmd> | audit=<cmd>
FILES: <glob>
FORBIDDEN: <pattern> → <alternative>
```

Rules:
- 4 lines max (stack identity, COMMANDS, FILES, FORBIDDEN)
- Embed commands inline so routine commands never need `context.md`
- Everything else belongs in `context.md`

---

## Step 4: Write `commands.json`

Machine-readable. Never loaded as LLM context. Used by `activate-profiles.js` and `forge-ci-runner.js`.

```json
{
  "profile": "your-stack",
  "filePatterns": ["**/*.<ext>", "path/to/specific/**"],
  "commands": {
    "test": "<test command>",
    "lint": "<lint command>",
    "format": "<format command>",
    "format-check": "<format check command — must exit non-zero if files are unformatted>",
    "typecheck": "<typecheck command or null>",
    "build": "<build command or null>",
    "audit": "<audit command>",
    "e2e": "<e2e command or null>",
    "coverage": "<coverage command>",
    "logs": "<command to tail/view app logs — used by /incident during triage>"
  }
}
```

**Required vs optional keys** (JSON cannot carry comments — use this table as the source of truth):

| Status | Keys |
|--------|------|
| Required — must be present (may be `null` for ORM/library profiles) | `test`, `lint`, `format`, `build`, `audit`, `coverage`, `format-check`, `logs` |
| Optional — may be omitted entirely | `typecheck`, `e2e` |

**Multi-profile collision tiebreaker**: if two profiles' `filePatterns` match the same file, the profile listed **first in `.forge.yaml`** wins. Users order profiles by priority. Path-based patterns (`src/**/*.js`) take priority over extension-only patterns (`**/*.js`).

**Composer scripts note (PHP)**: always route commands through `composer run-script` — `composer test` is idiomatic, `./vendor/bin/phpunit` is a fallback.

---

## Step 5: Write `hooks.json`

All hook IDs **must** follow `forge.<profile-name>.<hook-name>` — never just `forge.python.*` for a profile named `python-django`.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "id": "forge.your-stack.some-guard",
            "type": "command",
            "command": "node {{FORGE_ROOT}}/profiles/your-stack/hooks/some-guard.js"
          }
        ],
        "matcher": "Write"
      }
    ],
    "PostToolUse": []
  }
}
```

(Add `PostToolUse` or `Stop` entries here if needed — same structure as `PreToolUse`.)

Use `{{FORGE_ROOT}}` as a placeholder — `activate-profiles.js` resolves it to the actual path at activation time.

Hook scripts must read stdin as JSON (Claude Code passes tool input via stdin), emit a JSON decision, and exit 0.

```javascript
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
// ... check input.tool_name, input.tool_input ...
console.log(JSON.stringify({ decision: 'approve' }));  // or 'block' with 'reason'
```

**Secret patterns**: your hooks.json can set `FORGE_EXTRA_SECRET_PATTERNS` env var to add stack-specific patterns on top of `core/hooks/scripts/secret-detector.js`. Never replace core patterns.

---

## Step 6 (optional): Write `mcp.json`

Declares MCP servers that activate alongside the profile. Only include this file if a specific MCP server meaningfully benefits this stack.

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "npx",
      "args": ["-y", "<mcp-package>", "$DATABASE_URL"]
    }
  },
  "env_vars": ["DATABASE_URL"]
}
```

**Two placeholder styles — use the right one for secrets:**

| Style | Example | When to use |
|-------|---------|-------------|
| `$VAR_NAME` | `"$DATABASE_URL"` | **Secrets** — resolved at MCP server startup from `process.env`; never written to settings.json |
| `{{VAR_NAME}}` | `"{{PROJECT_ROOT}}"` | **Non-sensitive build-time values** — resolved at activation time; written into settings.json |

Use `$VAR_NAME` for any credential or token. Use `{{VAR_NAME}}` only for things like paths or project names that are safe to store.

If a `$VAR_NAME` env var is absent at activation time, the server is registered but warns at startup. If a `{{VAR_NAME}}` placeholder is unresolved, **that server is skipped** and the user is warned. Activation of the rest of the profile continues.

**Which MCP servers are appropriate per stack:**

| Stack | Server | Secret required? |
|-------|--------|-----------------|
| `prisma` | `@prisma/mcp-server` | No — reads `prisma/schema.prisma` from cwd |
| `nextjs` | `@playwright/mcp` | No — browser automation |
| `python-django` / `python-fastapi` | `@modelcontextprotocol/server-postgres` | Yes — `DATABASE_URL` |

Avoid adding MCP servers that duplicate what hooks already provide or that require secrets not commonly available in `.env` files.

---

## Step 7: Write `skills/SKILL.md`

Prose + code examples. Named `## heading` sections — `context.md` references these by anchor.

```markdown
# <Stack Name> Skills

## testing
[Test patterns, fixtures, mocking for this stack]

## security
[Security patterns specific to this stack]

## <topic>
[Deep reference — prose is fine here, examples must be readable]
```

Rules:
- Use prose + code examples (not tables) — code must be readable to be applied
- Name sections with `##` anchors matching what `context.md` references
- Each section should be self-contained — agents load one section at a time
- Keep each `##` section focused on one concern and under ~200 tokens (~800 chars); split multi-topic sections (e.g. `## resilience-http` and `## resilience-queue`) so agents load only what they need

---

## Checklist before submitting

- [ ] Required files present: rules.md, context.md, commands.json, hooks.json, skills/SKILL.md
- [ ] `commands.json` has all 8 required keys present: `test`, `lint`, `format`, `build`, `audit`, `coverage`, `format-check`, `logs` (may be `null` for ORM/library profiles; `typecheck` and `e2e` may be omitted entirely)
- [ ] Any scripts referenced in `hooks.json` exist under `hooks/`
- [ ] Optional mcp.json uses `$VAR_NAME` (not `{{VAR_NAME}}`) for any secret args so credentials are never written to settings.json
- [ ] Hook IDs namespaced `forge.<profile-name>.<hook-name>`
- [ ] `rules.md` ≤ 4 lines
- [ ] `context.md` uses markdown tables (not key-value, not prose)
- [ ] `skills/SKILL.md` has named `##` sections that `context.md` references by anchor
- [ ] Detector threshold requires 2+ signals (no single-file activation)
- [ ] **Detector passes the automated test suite** — add your profile's fixture to `profiles/tests/run-tests.sh` (positive + negative case) and verify `./profiles/tests/run-tests.sh detect` passes
- [ ] `file-contains` patterns cover all common dependency file formats for this stack
- [ ] Secret patterns (if any) extend, not replace, `core/hooks/scripts/secret-detector.js`

---

## Common Mistakes

### 1. Threshold too low — activates on unrelated projects

```yaml
# BAD: single weak signal — any project with a .py file matches
detectors:
  - glob: "**/*.py"
    weight: 3
threshold: 2
```

Fix: require at least one strong signal (weight 3+) plus one weak signal (weight 2+). Use a definitive file (weight 4) when possible.

### 2. Generic glob matches everything

```yaml
# BAD: matches all projects
detectors:
  - glob: "**/*.json"
    weight: 5
```

Fix: use specific filenames (`package.json`) or `file-contains` with a specific dependency string.

### 3. Hook ID missing namespace — causes silent collision

```json
{ "id": "coverage-warn" }                        // BAD — collides globally
{ "id": "forge.python-django.coverage-warn" }    // GOOD
```

### 4. `context.md` too long — defeats token efficiency

Keep `context.md` to 2–3 markdown tables (~20 rows max). Move detailed patterns and code examples to `skills/SKILL.md`. If `context.md` exceeds 20 rows, split into skills sections.

### 5. `rules.md` too long — always-on cost per session grows

`rules.md` loads every session including git commits. Keep it to 4 lines max. Everything else belongs in `context.md`.

### 6. Not testing detectors before submitting

Run `node install/activate-profiles.js --project <real-django-project> --dry-run` and verify the detected profiles. Then run against a TypeScript-only project and verify the Django profile is not listed.

---

## Profile update story

claude-chameleon uses symlinks only — no copy mode. Once installed, a `git pull` on the `claude-chameleon` repo instantly updates every project using that install. No `--update` command needed.

---

## Hook ID collision resolution

If two profiles use the same file extension (e.g., both `python-django` and `python-fastapi` active with `.py` files), the profile listed **first in `.forge.yaml`** wins for command routing. Hooks from both profiles coexist in `settings.json` and fire independently.

To remove all profiles from a project: `./uninstall.sh --project <path>`. To remove a single profile, edit `.forge.yaml` to remove that profile name, then re-run `/explore` to re-activate and prune stale symlinks. Wipe forge core entirely: `./uninstall.sh`.
