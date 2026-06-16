# claude-chameleon

> Claude Code's development kit that adapts to any stack.

## What This Is

claude-chameleon is a composable Claude Code system: one generic set of agents, commands, hooks, and rules — with additive **tech-stack profiles** that inject the right context for each stack. No agent duplication. No separate install per language.

## Structure

```
claude-chameleon/
├── core/
│   ├── agents/          # 10 generic agents
│   ├── commands/        # 19 generic commands (with depth frontmatter)
│   ├── rules/           # 7 generic rules (always-on)
│   └── hooks/           # Core safety hooks (forge.core.*)
├── profiles/
│   ├── typescript/      # TypeScript profile
│   ├── nextjs/          # Next.js App Router profile
│   ├── prisma/          # Prisma ORM profile
│   ├── python-django/   # Python + Django profile
│   ├── python-fastapi/  # Python + FastAPI profile
│   ├── php-symfony/     # PHP + Symfony profile
│   ├── php-laravel/     # PHP + Laravel profile
│   └── tests/           # Profile test suite
├── agents/
│   ├── stack-orchestrator.md           # Profile loader for deep commands
│   └── stack-orchestrator-messages.md  # Recovery messages for generic-mode failures (one per REASON)
├── install/
│   ├── claude-chameleon-setup.js  # Core install logic (Node.js)
│   ├── activate-profiles.js       # Per-project profile activator (Node.js)
│   ├── forge-ci-runner.js         # CI command runner (Node.js)
│   ├── print-handoff.js           # Deterministic stack-orchestrator handoff generator (Node.js)
│   ├── forge-doctor.js            # Static kit-coherence auditor (Node.js) — CI gate
│   └── lib/
│       ├── yaml.js                # Shared YAML parser/writer
│       ├── symlink.js             # Symlink helpers
│       ├── hooks.js               # Hook merge/remove helpers
│       └── mcp.js                 # MCP server merge/remove helpers
├── install.sh           # Thin bash wrapper (core install only)
├── uninstall.sh         # Removes core or project profiles
├── AUTHORING.md         # Guide for adding new profiles
└── CLAUDE.md            # This file
```

## How Profiles Work

Each profile provides 5 required files (plus optional `mcp.json`):

| File | Token cost | Loads when |
|------|-----------|-----------|
| `rules.md` | Always-on, ~4 lines | Every session |
| `context.md` | On-demand, ~80-100 tokens | Deep commands only |
| `commands.json` | Zero | Machine-readable only |
| `hooks.json` | Zero | Merged at install time |
| `skills/SKILL.md` | Section-on-demand | Agent reads per file |
| `mcp.json` | Zero (optional) | Merged at install time — activates MCP servers |

## Agent → Command Map

"Specialist agent" = the dedicated agent a command delegates to. Independently, every `deep` command also invokes `stack-orchestrator` for profile context (see Command Depth) — so `/onboard` and `/incident` have no *specialist* agent but still spawn the orchestrator.

| Specialist agent | Commands |
|-------|---------|
| architect | `/design` |
| tdd-developer | `/tdd` |
| error-resolver | `/fix` |
| code-inspector | `/inspect` |
| security-scanner | `/scan` |
| e2e-runner | `/e2e` |
| performance-profiler | `/profile` |
| code-explorer | `/explore` |
| docs-writer | `/docs` |
| dependency-manager | `/deps` |
| code-inspector + security-scanner + performance-profiler | `/audit` (composes all three in one sweep) |
| stack-orchestrator | (invoked by every deep command) |
| *(no specialist)* | `/refactor`, `/add-tests`, `/learn`, `/healthcheck`, `/onboard`, `/incident`, `/pre-deploy`, `/pr` |

## Command Depth

| Depth | Commands | Orchestrator? |
|-------|----------|--------------|
| `routine` | `/tdd`, `/fix`, `/healthcheck`, `/refactor`, `/add-tests`, `/pre-deploy`, `/docs`, `/deps`, `/pr` | No — reads `rules.md`; agents may load `skills/SKILL.md` sections on demand |
| `deep` | `/scan`, `/inspect`, `/design`, `/e2e`, `/profile`, `/incident`, `/onboard`, `/audit` | Yes — loads `context.md` + `skills/SKILL.md` sections |
| `explore` | `/explore`, `/learn` | No |

## Installation

Two-step setup — run once per machine, then once per project:

```bash
# Step 1: Install core globally (once per machine)
./install.sh

# Step 2: Activate stack profiles per project (run /explore in Claude Code)
# /explore detects the stack and prompts to set up profiles

# Validate core installation
./install.sh --validate

# Preview without changes
./install.sh --dry-run

# Remove profiles from a project
./uninstall.sh --project ~/my-app

# Remove core from this machine
./uninstall.sh
```

## .forge.yaml (two files, two purposes)

**`~/.claude/.forge.yaml`** — global, machine-specific, never committed:
```yaml
forge_version: "1.0.0"
forge_root: "/home/user/Projects/claude-chameleon"
```

**`project/.forge.yaml`** — project-level, committed to git, no machine-specific paths:
```yaml
forge_version: "1.0.0"
profiles:
  - typescript
  - nextjs
```

Teammates clone the repo, run `./install.sh` once (sets their own `forge_root`), and profile symlinks work automatically via the committed `.forge.yaml`.

First listed profile wins on file extension collision.

## Conventions

- Profile hook IDs: `forge.<profile-name>.<hook-name>` (never shared between profiles)
- Core hook IDs: `forge.core.<hook-name>`
- `rules.md`: ≤ 4 lines (loads every session)
- `context.md`: markdown tables, on-demand only
- `skills/SKILL.md`: prose + code, named `##` sections, loaded by section
- Install: symlinks only — `git pull` on claude-chameleon updates all installs
- Orchestrator handoff: generated **deterministically** by `install/print-handoff.js` (not hand-formatted by the LLM). The `stack-orchestrator` agent runs it and returns stdout verbatim. Success → a versioned `<<<FORGE_HANDOFF>>>` block; any failure → an explicit `<<<FORGE_GENERIC_MODE>>>` block with a `REASON:` code (never a silent absence). Field names are a contract consumed by every deep command and specialist agent — change them in the generator and the docs together. Pinned by the `handoff` test suite.

## What to commit from `.claude/`

| Path | Commit? | Why |
|------|---------|-----|
| `.claude/.forge.yaml` | **No** — global, machine-specific | Contains your local `forge_root` path |
| `project/.forge.yaml` | **Yes** | Declares profiles for the team |
| `.claude/settings.json` | **No** — personal | Contains your hooks + personal Claude settings |
| `.claude/rules/*.md` (symlinks) | **No** | Recreated by `/explore` from each teammate's `forge_root` |
| `.claude/mcp/*.js` (wrappers) | **No** | Contain absolute paths; regenerated at activation |

Add to your project's `.gitignore`:
```
.claude/settings.json
.claude/mcp/
.claude/rules/
```

## Adding a New Profile

See [AUTHORING.md](AUTHORING.md) for the complete guide, and [HOOKS.md](HOOKS.md) for the hook output contract (allow `{}` / `deny` / `warn` via `systemMessage`) before writing any hook.

## Worktrees

Core (agents/commands/rules/hooks) works in every git worktree automatically — it's installed machine-wide and the hooks use absolute paths. Stack **profiles** are per-checkout, so a new worktree starts without them. To share a checkout's profiles into a worktree:

```bash
node install/link-worktree.js --worktree <path> --source <main-checkout>
# or, for new worktrees: install/forge-worktree-add.sh <source> <worktree-path> <branch>
```

This symlinks the gitignored profile artifacts (`rules.local`, `settings.local.json`) from the source checkout. Commit the project's `.forge.yaml` so the profile *declaration* travels to all worktrees via git.

## Platform Support

- macOS / Linux: supported
- Windows: requires WSL2 (symlinks and bash unavailable on native Windows)

## Running Profile Tests

```bash
./profiles/tests/run-tests.sh           # all tests (includes handoff + doctor suites)
./profiles/tests/run-tests.sh format    # format validation only
./profiles/tests/run-tests.sh detect    # detector scoring only
./profiles/tests/run-tests.sh handoff   # deterministic handoff contract only
./profiles/tests/run-tests.sh doctor    # kit-coherence audit only
```

## Kit Coherence (forge-doctor)

`install/forge-doctor.js` statically audits the whole kit's internal cross-references and fails CI on any contradiction. Run it before opening a PR:

```bash
node install/forge-doctor.js
```

It checks, among other things:
- every command's `depth` is valid **and matches the CLAUDE.md Command Depth table**
- `deep` commands invoke `stack-orchestrator` + reference the `<<<FORGE_HANDOFF>>>` contract; non-deep commands don't
- every agent named in a command exists; every agent has a valid two-tier `model` (opus|haiku) and known tools
- an agent told to use a **tool** in its body actually has that tool granted (catches the security-scanner-class bug)
- every profile has the required files, a `## a11y` section, valid `commands.json` keys, and a `rules.md` ≤ 4 lines
- every `skills/SKILL.md#section` referenced from a `context.md` resolves
- every `~/.claude/rules/<x>.md` reference resolves to a real core rule
- the handoff generator, orchestrator doc, and deep commands all agree on the contract field names

The `doctor` test suite proves the auditor both passes the committed kit and catches injected faults.
