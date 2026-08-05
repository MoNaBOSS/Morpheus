/**
 * Morpheus CLI integration consent.
 *
 * The inherited behaviour rewrote the user's HKCU `PATH` on **every** packaged
 * launch, with no prompt and no way to decline. That is a persistent,
 * user-visible system change made without consent, and it left a stale entry
 * behind whenever the install directory moved.
 *
 * Morpheus makes it an explicit, one-time choice:
 *
 *   - `undecided` — never touch PATH; offer the choice in Setup and Settings.
 *   - `enabled`   — install once, then stop asking. Re-verified only when the
 *                   resolved CLI directory actually changes.
 *   - `disabled`  — never install, and remove a previously added entry.
 *
 * The decision lives in the Morpheus user-data directory rather than the
 * renderer-writable settings store, because it gates a system mutation.
 *
 * See docs/releases/0.1.1-ACCEPTANCE.md §2.11-2.12.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type CliIntegrationChoice = 'undecided' | 'enabled' | 'disabled';

export type CliIntegrationState = {
  choice: CliIntegrationChoice;
  /** CLI directory that was applied, so a moved install can be re-applied. */
  appliedCliDir?: string;
  decidedAt?: string;
  appliedAt?: string;
};

const FILE_VERSION = 1;

type PersistedState = CliIntegrationState & { v: number };

export function cliIntegrationStatePath(userDataDir: string): string {
  return join(userDataDir, 'morpheus', 'cli-integration.json');
}

export function readCliIntegrationState(userDataDir: string): CliIntegrationState {
  try {
    const raw = readFileSync(cliIntegrationStatePath(userDataDir), 'utf8');
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || typeof parsed !== 'object') return { choice: 'undecided' };
    const choice = parsed.choice;
    if (choice !== 'enabled' && choice !== 'disabled' && choice !== 'undecided') {
      return { choice: 'undecided' };
    }
    return {
      choice,
      appliedCliDir: typeof parsed.appliedCliDir === 'string' ? parsed.appliedCliDir : undefined,
      decidedAt: typeof parsed.decidedAt === 'string' ? parsed.decidedAt : undefined,
      appliedAt: typeof parsed.appliedAt === 'string' ? parsed.appliedAt : undefined,
    };
  } catch {
    // Absent or unreadable state means the user has not chosen yet. Defaulting
    // to `undecided` fails closed: no PATH mutation happens.
    return { choice: 'undecided' };
  }
}

export function writeCliIntegrationState(userDataDir: string, state: CliIntegrationState): void {
  const target = cliIntegrationStatePath(userDataDir);
  mkdirSync(dirname(target), { recursive: true });
  const payload: PersistedState = { v: FILE_VERSION, ...state };
  // Atomic: a torn write must not leave the consent record ambiguous.
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(temporary, target);
}

/**
 * Whether a PATH mutation may run on this launch.
 *
 * `undecided` is never sufficient. `enabled` re-applies only when the resolved
 * CLI directory differs from the one recorded, so a normal launch does no work.
 */
export function shouldApplyCliIntegration(
  state: CliIntegrationState,
  currentCliDir: string | null,
): boolean {
  if (state.choice !== 'enabled') return false;
  if (!currentCliDir) return false;
  return state.appliedCliDir !== currentCliDir;
}

/** Whether a previously applied PATH entry needs removing. */
export function shouldRemoveCliIntegration(state: CliIntegrationState): boolean {
  return state.choice === 'disabled' && Boolean(state.appliedCliDir);
}
