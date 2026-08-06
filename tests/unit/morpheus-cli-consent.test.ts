import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  cliIntegrationStatePath,
  readCliIntegrationState,
  shouldApplyCliIntegration,
  shouldRemoveCliIntegration,
  writeCliIntegrationState,
} from '@electron/main/cli-integration-consent';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-cli-consent-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
const freshDir = () => join(scratch, `case-${(counter += 1)}`);

describe('CLI integration consent', () => {
  it('defaults to undecided, so a normal launch never touches PATH', () => {
    const state = readCliIntegrationState(freshDir());
    expect(state.choice).toBe('undecided');
    expect(shouldApplyCliIntegration(state, 'C:\\Morpheus\\cli')).toBe(false);
  });

  it('fails closed when the state file is corrupt', () => {
    const dir = freshDir();
    mkdirSync(join(dir, 'morpheus'), { recursive: true });
    writeFileSync(cliIntegrationStatePath(dir), '{ not json', 'utf8');

    const state = readCliIntegrationState(dir);
    expect(state.choice).toBe('undecided');
    expect(shouldApplyCliIntegration(state, 'C:\\Morpheus\\cli')).toBe(false);
  });

  it('rejects an unrecognised stored choice rather than trusting it', () => {
    const dir = freshDir();
    mkdirSync(join(dir, 'morpheus'), { recursive: true });
    writeFileSync(cliIntegrationStatePath(dir), JSON.stringify({ v: 1, choice: 'always-yes' }), 'utf8');
    expect(readCliIntegrationState(dir).choice).toBe('undecided');
  });

  it('persists an explicit choice atomically and reloads it', () => {
    const dir = freshDir();
    writeCliIntegrationState(dir, { choice: 'enabled', decidedAt: '2026-08-05T00:00:00.000Z' });

    expect(existsSync(cliIntegrationStatePath(dir))).toBe(true);
    // No temp file is left behind by the rename.
    expect(existsSync(`${cliIntegrationStatePath(dir)}.tmp`)).toBe(false);
    expect(JSON.parse(readFileSync(cliIntegrationStatePath(dir), 'utf8')).v).toBe(1);
    expect(readCliIntegrationState(dir).choice).toBe('enabled');
  });

  it('applies once when enabled, then stops asking', () => {
    const enabled = { choice: 'enabled' as const };
    expect(shouldApplyCliIntegration(enabled, 'C:\\Morpheus\\cli')).toBe(true);

    // After it has been applied for that directory, a normal launch does nothing.
    const applied = { choice: 'enabled' as const, appliedCliDir: 'C:\\Morpheus\\cli' };
    expect(shouldApplyCliIntegration(applied, 'C:\\Morpheus\\cli')).toBe(false);
  });

  it('re-applies when the install directory actually moves', () => {
    const applied = { choice: 'enabled' as const, appliedCliDir: 'C:\\Old\\cli' };
    expect(shouldApplyCliIntegration(applied, 'C:\\New\\cli')).toBe(true);
  });

  it('never applies when disabled, and offers removal of a stale entry', () => {
    const disabled = { choice: 'disabled' as const, appliedCliDir: 'C:\\Morpheus\\cli' };
    expect(shouldApplyCliIntegration(disabled, 'C:\\Morpheus\\cli')).toBe(false);
    expect(shouldRemoveCliIntegration(disabled)).toBe(true);

    // Nothing to remove if it was never applied.
    expect(shouldRemoveCliIntegration({ choice: 'disabled' })).toBe(false);
  });

  it('does nothing when the CLI directory cannot be resolved', () => {
    expect(shouldApplyCliIntegration({ choice: 'enabled' }, null)).toBe(false);
  });
});

describe('startup wiring', () => {
  it('gates the PATH mutation on an explicit enabled choice', () => {
    const main = readFileSync(join(__dirname, '..', '..', 'electron', 'main', 'index.ts'), 'utf8');
    // The inherited behaviour called this unconditionally on every packaged launch.
    expect(main).toContain("cliConsent.choice === 'enabled'");
    expect(main).toContain('readCliIntegrationState');
  });
});
