/**
 * One-time ClawX → Morpheus user-data import.
 *
 * Changing the Electron application id moves `app.getPath('userData')` from the
 * ClawX directory to the Morpheus one, so an existing user would otherwise open
 * 0.1.1 and find an empty profile.
 *
 * Safety rules, in priority order:
 *
 *  1. **Never destroy the source.** The ClawX profile is only ever read. If the
 *     user rolls back to ClawX, their data is exactly where they left it.
 *  2. **Never overwrite the destination.** If a Morpheus profile already has a
 *     given file, the import leaves it alone.
 *  3. **Validate before accepting.** JSON that does not parse is skipped and
 *     reported, not copied blindly.
 *  4. **Partial failure is survivable.** Each entry is independent; a failure is
 *     recorded and the rest continue.
 *  5. **Run once.** A completion marker prevents re-import, so deletions the
 *     user makes in Morpheus are never silently undone on the next launch.
 *
 * OpenClaw's own runtime data lives in `~/.openclaw` and is shared, not copied:
 * it is keyed by the OpenClaw runtime, not by the desktop application id.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export const MIGRATION_VERSION = 1;

/**
 * Files and directories worth importing.
 *
 * Deliberately narrow: settings and Morpheus-owned data only. Chromium caches,
 * GPU caches, service-worker state and logs are intentionally excluded — they
 * are large, regenerable, and can carry stale application identity.
 */
export const MIGRATABLE_ENTRIES: readonly string[] = Object.freeze([
  'config.json',
  'settings.json',
  'Local Storage',
  'morpheus',
]);

/** Entries that must never be imported even if present. */
export const EXCLUDED_ENTRIES: readonly string[] = Object.freeze([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Network',
  'logs',
  'Crashpad',
  'Singleton',
]);

export type MigrationOutcome =
  | { status: 'already-migrated'; completedAt: string }
  | { status: 'no-source' }
  | { status: 'destination-populated' }
  | { status: 'migrated'; imported: string[]; skipped: MigrationSkip[] }
  | { status: 'failed'; reason: string };

export type MigrationSkip = { entry: string; reason: string };

export type MigrationRecord = {
  v: number;
  completedAt: string;
  sourceDir: string;
  imported: string[];
  skipped: MigrationSkip[];
};

export function migrationMarkerPath(morpheusUserData: string): string {
  return join(morpheusUserData, 'morpheus', 'migration.json');
}

export function readMigrationRecord(morpheusUserData: string): MigrationRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(migrationMarkerPath(morpheusUserData), 'utf8')) as MigrationRecord;
    return parsed && typeof parsed.completedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeMigrationRecord(morpheusUserData: string, record: MigrationRecord): void {
  const target = migrationMarkerPath(morpheusUserData);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  // Atomic rename: a crash mid-write must not leave a marker that claims a
  // migration completed when it did not.
  renameSync(temporary, target);
}

/** Rejects unparseable JSON so a corrupt source file is never imported. */
export function validateImportedFile(path: string): { ok: true } | { ok: false; reason: string } {
  if (!path.toLowerCase().endsWith('.json')) return { ok: true };
  try {
    JSON.parse(readFileSync(path, 'utf8'));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `invalid JSON: ${error instanceof Error ? error.message : 'unknown'}` };
  }
}

/** Recursive copy that never overwrites and never follows into excluded names. */
function copyEntry(source: string, destination: string, skipped: MigrationSkip[], label: string): number {
  const stats = statSync(source);

  if (stats.isDirectory()) {
    let copied = 0;
    mkdirSync(destination, { recursive: true });
    for (const child of readdirSync(source)) {
      if (EXCLUDED_ENTRIES.includes(child)) continue;
      copied += copyEntry(join(source, child), join(destination, child), skipped, `${label}/${child}`);
    }
    return copied;
  }

  if (!stats.isFile()) {
    skipped.push({ entry: label, reason: 'not a regular file' });
    return 0;
  }

  // Rule 2: never overwrite anything already in the Morpheus profile.
  if (existsSync(destination)) {
    skipped.push({ entry: label, reason: 'destination already exists' });
    return 0;
  }

  const validation = validateImportedFile(source);
  if (!validation.ok) {
    skipped.push({ entry: label, reason: validation.reason });
    return 0;
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return 1;
}

export type MigrationOptions = {
  /** Legacy ClawX userData directory. */
  sourceDir: string;
  /** Current Morpheus userData directory. */
  destinationDir: string;
  now?: () => Date;
};

/**
 * Imports a ClawX profile into Morpheus exactly once.
 *
 * Returns a typed outcome rather than throwing: a failed import must not stop
 * the application from starting with an empty-but-working profile.
 */
export function migrateClawXProfile(options: MigrationOptions): MigrationOutcome {
  const { sourceDir, destinationDir } = options;
  const now = options.now ?? (() => new Date());

  const existing = readMigrationRecord(destinationDir);
  if (existing) return { status: 'already-migrated', completedAt: existing.completedAt };

  if (!sourceDir || !existsSync(sourceDir)) return { status: 'no-source' };

  // Same directory means the identity change has not taken effect; importing
  // a directory onto itself would be meaningless.
  if (sourceDir === destinationDir) return { status: 'no-source' };

  const imported: string[] = [];
  const skipped: MigrationSkip[] = [];

  try {
    mkdirSync(destinationDir, { recursive: true });

    for (const entry of MIGRATABLE_ENTRIES) {
      const source = join(sourceDir, entry);
      if (!existsSync(source)) continue;
      try {
        const count = copyEntry(source, join(destinationDir, entry), skipped, entry);
        if (count > 0) imported.push(entry);
      } catch (error) {
        // Rule 4: one bad entry must not abort the whole import.
        skipped.push({ entry, reason: error instanceof Error ? error.message : 'copy failed' });
      }
    }

    writeMigrationRecord(destinationDir, {
      v: MIGRATION_VERSION,
      completedAt: now().toISOString(),
      sourceDir,
      imported,
      skipped,
    });

    return { status: 'migrated', imported, skipped };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'unknown failure' };
  }
}

/**
 * Best-effort guess at the legacy ClawX userData directory, given the Morpheus
 * one. Both sit beside each other under the same Electron userData parent.
 */
export function resolveLegacyClawXUserData(morpheusUserData: string): string | null {
  const parent = dirname(morpheusUserData);
  for (const name of ['ClawX', 'clawx']) {
    const candidate = join(parent, name);
    if (candidate !== morpheusUserData && existsSync(candidate)) return candidate;
  }
  return null;
}
