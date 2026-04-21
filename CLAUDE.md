# claude-chameleon

> Claude Code's development kit that adapts to any stack.

## What This Is

claude-chameleon is a composable Claude Code system: one generic set of agents, commands, hooks, and rules — with additive **tech-stack profiles** that inject the right context for each stack. No agent duplication. No separate install per language.

## Structure

```
claude-chameleon/
├── core/
│   ├── agents/          # 8 generic agents
│   ├── commands/        # 15 generic commands (with depth frontmatter)
│   ├── rules/           # 5 generic rules (always-on)
│   └── hooks/           # Core safety hooks (forge.core.*)
├── profiles/
│   ├── typescript/      # TypeScript profile
│   ├── nextjs/          # Next.js App Router profile
│   ├── prisma/          # Prisma ORM profile
│   ├── python-django/   # Python + Django profile
│   ├── python-fastapi/  # Python + FastAPI profile
│   ├── php-symfony/     # PHP + Symfony profile
│   └── tests/           # Profile test suite
├── agents/
│   ├── stack-orchestrator.md           # Profile loader for deep commands
│   └── stack-orchestrator-messages.md  # Handoff message templates
├── install/
│   ├── claude-chameleon-setup.js  # Core install logic (Node.js)
│   ├── activate-profiles.js       # Per-project profile activator (Node.js)
│   ├── forge-ci-runner.js         # CI command runner (Node.js)
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

| Agent | Commands |
|-------|---------|
| architect | `/design` |
| tdd-developer | `/tdd` |
| error-resolver | `/fix` |
| code-inspector | `/inspect` |
| security-scanner | `/scan` |
| e2e-runner | `/e2e` |
| performance-profiler | `/profile` |
| code-explorer | `/explore` |
| stack-orchestrator | (invoked by deep commands) |
| *(none)* | `/refactor`, `/add-tests`, `/learn`, `/healthcheck`, `/onboard`, `/incident`, `/pre-deploy` |

## Command Depth

| Depth | Commands | Orchestrator? |
|-------|----------|--------------|
| `routine` | `/tdd`, `/fix`, `/healthcheck`, `/refactor`, `/add-tests`, `/pre-deploy` | No — reads `rules.md`; agents may load `skills/SKILL.md` sections on demand |
| `deep` | `/scan`, `/inspect`, `/design`, `/e2e`, `/profile`, `/incident`, `/onboard` | Yes — loads `context.md` + `skills/SKILL.md` sections |
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

See [AUTHORING.md](AUTHORING.md) for the complete guide.

## Platform Support

- macOS / Linux: supported
- Windows: requires WSL2 (symlinks and bash unavailable on native Windows)

## Running Profile Tests

```bash
./profiles/tests/run-tests.sh           # all tests
./profiles/tests/run-tests.sh format    # format validation only
./profiles/tests/run-tests.sh detect    # detector scoring only
```
