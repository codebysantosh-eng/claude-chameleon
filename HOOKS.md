# Hook Authoring & Output Contract

How forge hooks talk to Claude Code. **Read this before writing a hook** — the contract is enforced by `core/hooks/scripts/lib/hook-io.js` and the `hooks-behavior` test suite.

## The three outcomes (all exit 0)

| Outcome | Emit | Effect |
|---------|------|--------|
| **Allow / neutral** | `{}` | Hook has nothing to say. The **normal permission flow proceeds**. |
| **Block** (PreToolUse) | `{ "decision": "block", "reason", "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason" } }` | Tool call is denied; reason shown to Claude. |
| **Warn** (non-blocking) | `{ "systemMessage": "…" }` | Message shown to the **user**; tool proceeds. |

### Hard-won rules

- **Never emit `decision: "approve"`.** On PreToolUse it's the legacy *auto-allow* — it silently bypasses the user's permission prompt. A neutral hook emits `{}`, not approve.
- **`systemMessage` is the only field surfaced to the user.** Non-standard fields (`type`, `message`) are **silently dropped** by the harness — a warn hook that uses them is a no-op. (Verified against the live harness.)
- **Block uses both forms.** `decision: "block"` (legacy) + `hookSpecificOutput.permissionDecision: "deny"` (current) for maximum compatibility across Claude Code versions.
- **`additionalContext`** (inside `hookSpecificOutput`) is fed to *Claude*, not the user — use it to add context, not to warn a human.

## Exit codes

- **0** — JSON on stdout is parsed for the outcome above.
- **2** — blocking error: stdout ignored, **stderr** fed to Claude (blocks PreToolUse). The kit prefers exit-0 JSON over exit-2.
- **other non-zero** — non-blocking error; the action is **not** blocked. So a crashing security hook *fails open* — which is why blocking hooks must fail **closed** (see below).

## Use the shared helper

```js
const { readInput, allow, deny, warn } = require('<rel>/lib/hook-io');
// core hooks:    './lib/hook-io'
// profile hooks: '../../../core/hooks/scripts/lib/hook-io'

readInput(run, { failClosed: true, label: 'forge.<scope>.<name>' }); // failClosed for BLOCKING hooks
function run(input) {
  // ... inspect input.tool_name / input.tool_input / input.tool_response ...
  if (bad) deny('why this is blocked');   // blocking
  if (smelly) warn('non-blocking nudge'); // warning
  allow();                                 // neutral default
}
```

- **Blocking hooks** (secret/force-push/bypass guards): pass `failClosed: true` — on unparseable input they `deny` rather than let the action through.
- **Warn hooks**: omit `failClosed` — on bad input they `allow` (don't block writes for a non-security nudge).
- The emit helpers build a fresh object and exit; they never mutate shared state.

## Wiring (`hooks.json`)

- IDs: `forge.core.<name>` (core) / `forge.<profile>.<name>` (profile). Unique per profile; suffix `-edit`/`-bash` when the same script serves multiple matchers.
- Command: `node {{FORGE_ROOT}}/...` — `{{FORGE_ROOT}}` is resolved at install/activation time.
- Event: `PreToolUse` to block; `PostToolUse` to warn after the fact (a Post hook can't block — the tool already ran).

## Extending the secret scanner

Profiles add patterns via the `FORGE_EXTRA_SECRET_PATTERNS` env var (a JSON array of `{pattern, flags, label}`) in their `hooks.json`. Stateful flags (`g`/`y`) are stripped automatically — the scanner runs one match per line.

## Testing

Every contract claim above is covered by the `hooks-behavior` suite in `profiles/tests/run-tests.sh` (block/allow/warn/neutral/fail-closed). Add a case there when you add a hook.
