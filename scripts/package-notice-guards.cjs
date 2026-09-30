const { readdirSync, rmSync } = require('fs');
const { join } = require('path');

// Keep existing attribution assets regardless of suffix/case, including
// LICENSE-MIT, COPYING.LESSER and THIRD_PARTY_NOTICES.markdown.
function isPackageNoticeFile(name) {
  return /(?:^|[._ -])(?:licen[cs]es?|notices?|copying|copyright)(?=$|[._ -])/i.test(name);
}

// A pruned documentation/test tree may still contain notice assets. Keep only
// those files and their parent directories, not the rest of the documentation.
function pruneDirectoryPreservingNotices(dir) {
  let removed = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return removed; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += pruneDirectoryPreservingNotices(full);
    } else if (!entry.isFile() || !isPackageNoticeFile(entry.name)) {
      try { rmSync(full, { force: true }); removed++; } catch { /* preserve on failure */ }
    }
  }
  try {
    if (readdirSync(dir).length === 0) { rmSync(dir, { recursive: true }); removed++; }
  } catch { /* preserve on failure */ }
  return removed;
}

module.exports = { isPackageNoticeFile, pruneDirectoryPreservingNotices };
