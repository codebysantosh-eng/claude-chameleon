---
description: Production incident response — triage, diagnose, mitigate, resolve, communicate, post-mortem
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator returns a `<<<FORGE_GENERIC_MODE>>>` block instead, proceed without profile-specific context.

Initiate incident response for:

$ARGUMENTS

## Phase 1: Triage (< 5 minutes)
- Severity: P1 (service down) / P2 (degraded) / P3 (minor)
- Impact: who is affected, how many users
- Start time: when did it begin

## Phase 2: Diagnose
- Check logs for errors:
  1. Check active profile's `commands.json` for a `logs` command — use it if defined
  2. Otherwise check for a `LOG_PATH` or `LOG_DIR` env var in the project
  3. Otherwise use stack defaults: Node → `pm2 logs` or `journalctl -u <service>`; Django/FastAPI → `journalctl` or app log file; PHP → `tail -f storage/logs/laravel.log`
  4. If none apply, ask the user where logs are before proceeding
- Check recent deploys (`git log --oneline -10`)
- Check dependencies / external services
- Identify the likely root cause

**Delegate the deep dive when it pays off** (keep the incident timeline in this thread; spawn specialists for focused sub-investigations and fold their findings back in):
- Suspected code regression in a known area → `error-resolver` (`model: opus`) to pinpoint and fix-forward the breaking change.
- Suspected breach, leaked secret, or exploited endpoint → `security-scanner` (`model: opus`) to confirm the vector and patch CRITICAL/HIGH.
- Suspected performance/resource exhaustion (latency, OOM, connection pool) → `performance-profiler` (`model: opus`) to locate the hotspot with a measurement.
- Forward the `<<<FORGE_HANDOFF>>>` block into any specialist you spawn.

## Phase 3: Mitigate
- Fix forward (fastest safe fix) OR rollback (revert last deploy)
- Choose based on: time to fix vs. time to rollback
- Deploy mitigation

## Phase 4: Verify recovery
- Confirm error rate returned to baseline
- Confirm user-facing functionality restored
- Monitor for 10 minutes

## Phase 5: Communicate
Draft status update for stakeholders (concise, non-technical):
- What happened
- Impact duration
- Current status
- Next steps

## Phase 6: Post-mortem (after recovery)
- Timeline of events
- Root cause
- What worked / what didn't
- Action items to prevent recurrence
