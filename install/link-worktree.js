#!/usr/bin/env node
'use strict';
/**
 * link-worktree.js — share a checkout's activated profiles into a git worktree.
 *
 * Profile activation is per-checkout and gitignored, so a new worktree starts without it.
 * This symlinks the two local profile artifacts from a source checkout into the worktree:
 *   .claude/rules.local        (profile rule symlinks)
 *   .claude/settings.local.json (merged profile hooks + local settings)
 * Both are branch-agnostic (their contents point at absolute forge paths), so sharing is safe.
 * The committed parts of .claude (team commands/hooks/settings.json) travel via git on their own.
 *
 * Usage: node install/link-worktree.js --worktree <path> --source <main-checkout>
 */

const fs = require('fs');
const path = require('path');

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

const worktree = arg('--worktree');
const source = arg('--source');
if (!worktree || !source) {
  process.stderr.write('Usage: node install/link-worktree.js --worktree <path> --source <main-checkout>\n');
  process.exit(1);
}
if (path.resolve(worktree) === path.resolve(source)) {
  process.stderr.write('✗ --worktree and --source are the same path.\n');
  process.exit(1);
}

const wtClaude = path.join(worktree, '.claude');
if (!fs.existsSync(wtClaude)) fs.mkdirSync(wtClaude, { recursive: true });

let linked = 0;
for (const item of ['rules.local', 'settings.local.json']) {
  const src = path.join(path.resolve(source), '.claude', item);
  if (!fs.existsSync(src)) { process.stdout.write(`  skip ${item} — not present in source (activate it there first)\n`); continue; }
  const dst = path.join(wtClaude, item);

  let st = null;
  try { st = fs.lstatSync(dst); } catch { /* absent */ }
  if (st && st.isSymbolicLink()) {
    if (fs.readlinkSync(dst) === src) { process.stdout.write(`  ok ${item} (already linked)\n`); linked++; continue; }
    fs.unlinkSync(dst);
  } else if (st) {
    // Never clobber a real file/dir — back it up first.
    fs.renameSync(dst, dst + '.bak');
    process.stdout.write(`  backed up existing ${item} → ${item}.bak\n`);
  }
  fs.symlinkSync(src, dst);
  process.stdout.write(`  linked ${item} → ${src}\n`);
  linked++;
}

process.stdout.write(linked > 0
  ? `✓ Worktree shares ${source}'s profiles. (Core hooks/agents/commands already work machine-wide.)\n`
  : '⚠ Nothing linked — run /explore in the source checkout first to activate profiles.\n');
