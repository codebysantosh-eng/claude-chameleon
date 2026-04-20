---
description: Interactive onboarding walkthrough — detect stack, show toolkit, give personalized first-step recommendation
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.

Run interactive onboarding for this project.

$ARGUMENTS

Steps:
1. **Detect context**
   - Read `.forge.yaml` → active profiles
   - Read `CLAUDE.md` if it exists
   - Check for existing tests, CI config, recent commits

2. **Show stack summary**
   - Active profiles and what they provide
   - Key commands (test, lint, build, audit)
   - Forbidden patterns for this stack

3. **Show toolkit**
   - Available commands and what they do
   - Available agents and when to use them
   - Available hooks and what they guard

4. **Personalized first step**
   Based on project state, recommend ONE action:
   - No tests? → `/add-tests`
   - No CLAUDE.md? → `/explore`
   - Build failing? → `/fix`
   - No security audit? → `/scan`
   - Ready to build? → `/tdd <feature>`

Onboarding is only useful if it's specific to the actual stack. Generic mode onboarding must clearly say "no profiles active — run `./install.sh --detect` to configure your stack."
