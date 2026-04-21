'use strict';

const fs = require('fs');
const path = require('path');

function symlinkIfNeeded(src, dest, dryRun) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    if (!dryRun) fs.mkdirSync(destDir, { recursive: true });
  }

  // Check if symlink already points to the correct target — skip to keep operation idempotent
  try {
    const cur = fs.readlinkSync(dest);
    if (cur === src) return; // already correct, nothing to do
    if (!dryRun) fs.unlinkSync(dest);
  } catch {
    // dest doesn't exist or is not a symlink — nothing to remove
  }

  if (dryRun) {
    process.stdout.write(`  [dry-run] symlink ${src} → ${dest}\n`);
  } else {
    fs.symlinkSync(src, dest);
  }
}

// Remove symlinks in dirPath whose targets start with targetPrefix but are NOT in keepTargets.
// Only touches symlinks — never regular files.
function pruneProfileSymlinks(dirPath, targetPrefix, keepTargets, dryRun = false) {
  if (!fs.existsSync(dirPath)) return;
  for (const file of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, file);
    let target;
    try {
      target = fs.readlinkSync(fullPath);
    } catch {
      continue; // not a symlink
    }
    if (target.startsWith(targetPrefix + path.sep) && !keepTargets.includes(target)) {
      if (dryRun) {
        process.stdout.write(`  [dry-run] would remove stale symlink: ${fullPath}\n`);
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  }
}

module.exports = { symlinkIfNeeded, pruneProfileSymlinks };
