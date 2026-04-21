# Stack Orchestrator — Recovery Messages

Read a specific section when the matching failure condition fires. Include it in your output after the compact one-liner from the failure outputs table.

---

## broken-symlink

```
⚠ Broken forge installation detected.
  ✗ [file] — BROKEN SYMLINK

The claude-chameleon source may have moved or been deleted.
Re-run from the kit directory:
  cd [forge_root] && ./install.sh

Then re-activate this project:
  node [forge_root]/install/activate-profiles.js --project . --yes

Running in GENERIC MODE until fixed.
```

---

## not-installed

```
⚠ Forge not installed on this machine.

~/.claude/.forge.yaml not found — claude-chameleon core has not been set up.

To install:
  git clone <forge-repo> ~/claude-chameleon
  cd ~/claude-chameleon && ./install.sh

Running in GENERIC MODE until installed.
```

---

## forge-root-not-readable

```
⚠ Broken forge installation.

forge_root in ~/.claude/.forge.yaml is not readable — the kit may have moved.
Re-run ./install.sh from the new kit directory to update forge_root.

Running in GENERIC MODE until fixed.
```

---

## no-forge-yaml

```
⚠ No .forge.yaml found in this project.

This project has not been configured with claude-chameleon.
To configure: run /explore in this project.

Running in GENERIC MODE.
Commands will use generic tooling without stack-specific guidance.
```
