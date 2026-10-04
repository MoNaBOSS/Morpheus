// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
// @ts-expect-error Native ESM qualification helper has no TS declaration.
import { assertRetainedUpgradeState, assertUpgradeBaseline, QUALIFIED_BASELINE_SOURCE, QUALIFIED_BASELINE_VERSION, QUALIFIED_BASELINE_INSTALLER } from '../../scripts/windows/installed-upgrade-policy.mjs';

const installerHash = 'a'.repeat(64);
const baseline = () => ({ source: QUALIFIED_BASELINE_SOURCE, version: QUALIFIED_BASELINE_VERSION,
  name: 'morpheus', appId: 'app.morpheus.desktop', installerName: QUALIFIED_BASELINE_INSTALLER, trackedClean: true,
  installerSha256: installerHash, applicationSha256: 'b'.repeat(64), applicationArchiveSha256: 'c'.repeat(64) });
const retained = () => ({ preferredName: 'CI Companion', personality: 'balanced', microphoneEnabled: false, ambientEnabled: false,
  account: { id: 'fixture-account', model: 'fixture/model', vendorId: 'openrouter', label: 'Synthetic account', authMode: 'api_key', enabled: true },
  defaultAccountId: 'fixture-account', keyPresent: true, coreRunId: 'fixture-core-report',
  memory: { memoryId: 'memory-fixture', title: 'Synthetic preference', text: 'Keep the synthetic local preference.',
    kind: 'preference', sensitivity: 'normal', providerUse: 'local-only', enabled: true } });

describe('pinned installed previous-version qualification', () => {
  it('accepts the recorded qualified13 source and exact independent CI bytes for a newer candidate', () => {
    expect(assertUpgradeBaseline(baseline(), '1.2.0-preview.16', installerHash)).toEqual(baseline());
    expect(assertUpgradeBaseline(baseline(), '1.2.0', installerHash)).toEqual(baseline());
  });
  it('refuses arbitrary source/product/baseline names and dirty builds before installer execution', () => {
    for (const change of [{ source: 'd'.repeat(40) }, { version: '1.2.0-preview.12' }, { name: 'clawx' }, { appId: 'other.product' },
      { installerName: '../other.exe' }, { trackedClean: false }]) {
      expect(() => assertUpgradeBaseline({ ...baseline(), ...change }, '1.2.0-preview.16', installerHash)).toThrow('pinned clean Morpheus baseline');
    }
    expect(() => assertUpgradeBaseline({ ...baseline(), applicationArchiveSha256: '' }, '1.2.0-preview.16', installerHash)).toThrow('incomplete');
    expect(() => assertUpgradeBaseline(baseline(), '1.2.0-preview.16', 'd'.repeat(64))).toThrow('byte identity mismatch');
  });
  it.each(['1.2.0-preview.13', '1.2.0-preview.12', '1.1.9', 'not-a-version'])('refuses same-version/downgrade or invalid upgrade candidate %s', (candidate) => {
    expect(() => assertUpgradeBaseline(baseline(), candidate, installerHash)).toThrow('must be newer');
  });
  it('requires protected account, saved default/model/metadata, mute, memory policy and durable Core history retention', () => {
    expect(() => assertRetainedUpgradeState(retained(), retained())).not.toThrow();
    for (const change of [{ keyPresent: false }, { defaultAccountId: 'sibling' }, { microphoneEnabled: true }, { ambientEnabled: true },
      { preferredName: 'Changed' }, { personality: 'Changed' }, { coreRunId: 'new-report' },
      { account: { ...retained().account, model: 'other/model' } }, { account: { ...retained().account, label: 'Changed' } },
      { memory: { ...retained().memory, providerUse: 'allowed' } }, { memory: { ...retained().memory, text: 'Changed' } }]) {
      expect(() => assertRetainedUpgradeState(retained(), { ...retained(), ...change })).toThrow('were not retained');
    }
    expect(() => assertRetainedUpgradeState({}, retained())).toThrow('were not retained');
  });
  it('builds the pinned baseline in a separate hosted job and requires its artifact before the guarded qualifier', () => {
    const workflow = YAML.parse(readFileSync(join(process.cwd(), '.github/workflows/morpheus-installed-windows.yml'), 'utf8'));
    const old = workflow.jobs['baseline-windows'];
    expect(old['runs-on']).toBe('windows-latest');
    expect(old.steps[0].with.ref).toBe(QUALIFIED_BASELINE_SOURCE);
    expect(old.steps.find((step: { name?: string }) => step.name === 'Rebuild unsigned preview.13 baseline without owner data').env.CSC_IDENTITY_AUTO_DISCOVERY).toBe('false');
    const current = workflow.jobs['installed-windows'];
    expect(current.needs).toBe('baseline-windows');
    const download = current.steps.findIndex((step: { uses?: string }) => step.uses?.startsWith('actions/download-artifact'));
    const qualify = current.steps.findIndex((step: { run?: string }) => step.run?.includes('qualify-installed-app.mjs'));
    expect(download).toBeGreaterThan(0); expect(download).toBeLessThan(qualify);
    expect(current.steps[qualify].run).toContain('--require-baseline');
    const script = readFileSync(join(process.cwd(), 'scripts/windows/qualify-installed-app.mjs'), 'utf8');
    expect(script).toContain('Previous-version upgrade');
    expect(script).toContain('assertUpgradeBaseline');
    expect(script).toContain("const protectedStorePath = join(userData, 'clawx-provider-secrets.v1.json')");
    expect(script).toContain('protectedStoreHash = await digest(protectedStorePath)');
    expect(script).toContain('Opaque protected credential-store bytes changed');
    expect(script).not.toContain('readFile(protectedStorePath');
    expect(script.indexOf('assertUpgradeBaseline(JSON.parse')).toBeLessThan(script.indexOf("await run(baselineInstaller"));
    expect(script).toContain("assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted'");
    expect(script).toContain("assert(!/[\\\\/]monir(?:[\\\\/]|$)/i.test(runnerHome)");
  });
});
