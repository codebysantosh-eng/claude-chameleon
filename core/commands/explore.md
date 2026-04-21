---
description: Map the codebase and activate stack profiles. Run this first on any new project, then /onboard to see the toolkit.
depth: explore
---

Use the `code-explorer` agent to map:

$ARGUMENTS

If no specific scope is given, explore the entire project.

Produce:
1. Detected tech stack and active profiles
2. Annotated directory structure
3. Traced key flows (2–3 most important)
4. Conventions and patterns
5. Onboarding guide (how to run, test, deploy)
6. CLAUDE.md ready to commit

Cross-reference detected stack with `.forge.yaml` if it exists.

---

## Profile Activation (runs after mapping)

After the code-explorer agent completes, activate stack profiles for this project:

1. Read `~/.claude/.forge.yaml` to get `forge_root`.
   - If missing, tell the user: "claude-chameleon core not installed. Run `./install.sh` first." and stop.

2. Run via Bash:
   ```
   node {forge_root}/install/activate-profiles.js --project . --dry-run
   ```
   This prints detected profiles and scores without making changes.

3. Show the user: "Detected: [profiles]. Set up project profiles? [y/n]"

4. On yes: run via Bash:
   ```
   node {forge_root}/install/activate-profiles.js --project . --yes
   ```
   This creates `.claude/rules/` symlinks and writes `.forge.yaml`.

5. On no: continue without activation. No files are written.

**Note:** This command has side effects when profiles are activated — it writes `.claude/` symlinks and `.forge.yaml` to the project. Commit **only** `.forge.yaml` so teammates inherit the same profile selection; the `.claude/` directory contains machine-specific symlinks and personal settings that must stay in `.gitignore` (see CLAUDE.md → "What to commit from `.claude/`").
