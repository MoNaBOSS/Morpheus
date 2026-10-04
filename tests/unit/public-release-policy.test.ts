// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native ESM release helper has no TS declaration.
import { assertSigningConfiguration, assertSourceProvenance, assertSignatureReport } from '../../scripts/windows/public-release-policy.mjs';

const source = 'a'.repeat(40);
const version = '1.2.0';
const publisher = 'Fixture Publisher'; // Signature metadata fixture, never a certificate or signing identity.
const appHash = 'b'.repeat(64);
const row = (role: string, overrides = {}) => ({ role, status: 'Valid', publisher, timestamped: true, sha256: appHash, ...overrides });
const payload = () => ({ source, version, trackedClean: true, applicationArchiveSha256: 'f'.repeat(64), signatures: [row('packaged-app')] });
const final = () => ({ ...payload(), embeddedApplicationArchiveSha256: 'f'.repeat(64),
  installedUninstallerEvidence: { source, version, result: 'passed', errors: [], disposableHostedWindows: true, workflowRun: '123',
    installerSha256: 'c'.repeat(64), runtime: { packaged: true, e2e: null, version }, signature: row('uninstaller') },
  signatures: [row('packaged-app'), row('installer', { sha256: 'c'.repeat(64) }), row('embedded-app'), row('uninstaller')] });
const options = () => ({ publisher, source, version, stage: 'final', payload: payload(), workflowRun: '123' });
const configuration = () => ({
  SIGNPATH_API_TOKEN: 'fixture-token-never-reported', SIGNPATH_ORGANIZATION_ID: 'fixture-organization',
  SIGNPATH_PROJECT_SLUG: 'fixture-project', SIGNPATH_POLICY_SLUG: 'fixture-policy', MORPHEUS_EXPECTED_PUBLISHER: publisher,
});

describe('public Windows signing gates', () => {
  it('fails without each required asset and never reflects signing values in errors', () => {
    for (const name of Object.keys(configuration())) {
      expect(() => assertSigningConfiguration({ ...configuration(), [name]: '' })).toThrow(`Missing Morpheus signing configuration: ${name}.`);
    }
    expect(() => assertSigningConfiguration({ ...configuration(), SIGNPATH_POLICY_SLUG: 'ValueCell-sign' })).toThrow('Invalid Morpheus signing configuration: SIGNPATH_POLICY_SLUG.');
    expect(() => assertSigningConfiguration({ ...configuration(), MORPHEUS_EXPECTED_PUBLISHER: 'ClawX Publisher' })).toThrow('Invalid Morpheus signing configuration: MORPHEUS_EXPECTED_PUBLISHER.');
    expect(assertSigningConfiguration(configuration())).toBe(publisher);
  });

  it('accepts only evidence bound to the same tested clean source and version', () => {
    expect(() => assertSourceProvenance(payload(), source, version)).not.toThrow();
    for (const change of [{ source: 'd'.repeat(40) }, { version: '1.1.0' }, { trackedClean: false }]) {
      expect(() => assertSourceProvenance({ ...payload(), ...change }, source, version)).toThrow('tested clean checkout');
    }
  });

  it('requires valid expected-publisher timestamped signatures on the inner app and final installer', () => {
    expect(assertSignatureReport(final(), options())).toMatchObject({ result: 'passed', errors: [] });
    for (const role of ['packaged-app', 'installer', 'embedded-app', 'uninstaller']) {
      for (const change of [{ status: 'NotSigned' }, { status: 'HashMismatch' }, { publisher: 'Other Publisher' }, { timestamped: false }, { sha256: '' }]) {
        const report = final();
        report.signatures = report.signatures.map((signature) => signature.role === role ? { ...signature, ...change } : signature);
        expect(() => assertSignatureReport(report, options()), `${role}: ${JSON.stringify(change)}`).toThrow(`required: ${role}`);
      }
    }
  });

  it('rejects outer-only evidence, duplicate roles and altered embedded application bytes', () => {
    expect(() => assertSignatureReport({ ...final(), signatures: [row('installer')] }, options())).toThrow('incomplete');
    expect(() => assertSignatureReport({ ...final(), signatures: [row('installer'), row('installer'), row('embedded-app'), row('uninstaller')] }, options())).toThrow('required: packaged-app');
    const report = final();
    report.signatures[2].sha256 = 'e'.repeat(64);
    expect(() => assertSignatureReport(report, options())).toThrow('payload differs');
    expect(() => assertSignatureReport(final(), { ...options(), payload: { ...payload(), source: 'e'.repeat(40) } })).toThrow('tested clean checkout');
    expect(() => assertSignatureReport({ ...final(), embeddedApplicationArchiveSha256: 'd'.repeat(64) }, options())).toThrow('compiled application differs');
    expect(() => assertSignatureReport({ ...final(), applicationArchiveSha256: '' }, options())).toThrow('archive binding required');
  });
  it('requires separate normal installed uninstaller proof bound to the exact signed installer and workflow', () => {
    for (const change of [{ result: 'failed' }, { errors: ['fixture failure'] }, { source: 'd'.repeat(40) },
      { version: '1.1.0' }, { disposableHostedWindows: false }, { workflowRun: '124' }, { installerSha256: 'd'.repeat(64) },
      { runtime: { packaged: true, e2e: '1', version } }, { signature: row('uninstaller', { sha256: 'e'.repeat(64) }) }]) {
      expect(() => assertSignatureReport({ ...final(), installedUninstallerEvidence: { ...final().installedUninstallerEvidence, ...change } }, options())).toThrow('installed-VM uninstaller evidence required');
    }
    expect(() => assertSignatureReport({ ...final(), installedUninstallerEvidence: undefined }, options())).toThrow('installed-VM uninstaller evidence required');
  });
});

type Step = { name: string; if?: string; run?: string; uses?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Workflow = { on: { workflow_dispatch: { inputs?: Record<string, { default: unknown }> } }; jobs: Record<string, { steps: Step[] }> };
const workflow = (name: string) => YAML.parse(readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8')) as Workflow;

describe('Windows workflow signing integration', () => {
  it('uses the archive inspector shipped by the pinned builder without running it in unit tests', () => {
    const require = createRequire(import.meta.url);
    const inspector = require.resolve('app-builder-lib/out/toolsets/7zip');
    expect(readFileSync(inspector, 'utf8')).toContain('exports.getPath7za = getPath7za');
    const verifier = readFileSync(join(process.cwd(), 'scripts/windows/assert-public-signatures.ps1'), 'utf8');
    expect(verifier).toContain("require('app-builder-lib/out/toolsets/7zip').getPath7za()");
    expect(verifier).not.toContain("r('7zip-bin')");
    expect(verifier).toContain("x '-t7z' $installer 'Morpheus.exe' 'resources/app.asar'");
    expect(verifier).not.toContain("-Filter 'app-64.7z'");
    expect(verifier).toContain('Signed installed-VM uninstaller evidence is not configured; public release remains blocked.');
  });
  it('gates stable artifacts before build/sign/upload and retains manual draft publication', () => {
    const steps = workflow('release.yml').jobs['windows-release'].steps;
    const index = (name: string) => steps.findIndex((step) => step.name === name);
    expect(index('Require explicit Morpheus signing configuration')).toBeLessThan(index('Build Windows installer'));
    expect(index('Validate signed application payload before outer signing')).toBeLessThan(index('Upload unsigned installer for SignPath'));
    expect(index('Verify final publisher and embedded signed application')).toBeLessThan(index('Upload verified Windows artifacts'));
    for (const name of ['Require explicit Morpheus signing configuration', 'Validate signed application payload before outer signing', 'Sign stable installer with SignPath', 'Verify final publisher and embedded signed application']) {
      expect(steps[index(name)].if).toBe("steps.channel.outputs.stable == 'true'");
    }
    expect(steps[index('Verify final publisher and embedded signed application')].run).toContain('steps.channel.outputs.source');
    expect(steps[index('Create Morpheus draft for release review')].with).toMatchObject({ draft: true, make_latest: false });
  });

  it('leaves unsigned manual previews available and eliminates inherited signing identity', () => {
    const manual = workflow('win-build-test.yml');
    expect(manual.on.workflow_dispatch.inputs?.sign.default).toBe(false);
    const steps = manual.jobs['windows-build-sign'].steps;
    expect(steps.find((step) => step.name === 'Build Windows')?.if).toBeUndefined();
    const sign = steps.find((step) => step.uses?.startsWith('signpath/'));
    expect(sign?.if).toBe('inputs.sign');
    expect(sign?.with).toMatchObject({
      'organization-id': '${{ vars.MORPHEUS_SIGNPATH_ORGANIZATION_ID }}',
      'project-slug': '${{ vars.MORPHEUS_SIGNPATH_PROJECT_SLUG }}',
      'signing-policy-slug': '${{ vars.MORPHEUS_SIGNPATH_POLICY_SLUG }}',
    });
    expect(JSON.stringify(manual)).not.toMatch(/ValueCell|78e37079|ClawX/);
    expect(steps.some((step) => step.uses?.includes('action-gh-release'))).toBe(false);
  });

  it('never uploads stale blockmaps or updater manifests after external installer signing', () => {
    for (const name of ['release.yml', 'win-build-test.yml']) {
      for (const step of Object.values(workflow(name).jobs).flatMap((job) => job.steps)) {
        if (step.uses?.startsWith('actions/upload-artifact') || step.uses?.includes('action-gh-release')) {
          expect(JSON.stringify(step.with)).not.toMatch(/\.blockmap|latest.*\.yml/);
        }
      }
    }
  });
});
