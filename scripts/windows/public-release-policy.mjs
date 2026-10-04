/** Pure public-release checks. They do not sign files or discover credentials. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const inherited = /ValueCell|ClawX/i;
const sha256 = /^[0-9a-f]{64}$/i;

export function assertSigningConfiguration(environment) {
  for (const name of ['SIGNPATH_API_TOKEN', 'SIGNPATH_ORGANIZATION_ID', 'SIGNPATH_PROJECT_SLUG', 'SIGNPATH_POLICY_SLUG', 'MORPHEUS_EXPECTED_PUBLISHER']) {
    const value = environment[name];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing Morpheus signing configuration: ${name}.`);
    if (name !== 'SIGNPATH_API_TOKEN' && (value !== value.trim() || /[\r\n\0]/.test(value) || inherited.test(value))) {
      throw new Error(`Invalid Morpheus signing configuration: ${name}.`);
    }
  }
  // Values, including a token, are never included in diagnostics or results.
  return environment.MORPHEUS_EXPECTED_PUBLISHER;
}

export function assertSourceProvenance(provenance, expectedSource, expectedVersion) {
  if (!/^[0-9a-f]{40}$/i.test(expectedSource) || provenance?.source !== expectedSource
    || provenance?.version !== expectedVersion || provenance?.trackedClean !== true) {
    throw new Error('Release source/version differs from the tested clean checkout.');
  }
}

export function assertSignatureReport(report, { publisher, source, version, stage, payload, workflowRun }) {
  if (typeof publisher !== 'string' || !publisher.trim() || publisher !== publisher.trim() || inherited.test(publisher)) {
    throw new Error('A verified Morpheus publisher must be configured.');
  }
  assertSourceProvenance(report, source, version);
  if (!sha256.test(report.applicationArchiveSha256)) {
    throw new Error('Verified compiled application archive binding required.');
  }
  const required = stage === 'payload' ? ['packaged-app'] : stage === 'final'
    ? ['packaged-app', 'installer', 'embedded-app', 'uninstaller'] : [];
  if (!required.length || !Array.isArray(report.signatures) || report.signatures.length !== required.length) {
    throw new Error('Release signature report is incomplete.');
  }
  for (const role of required) {
    const rows = report.signatures.filter((row) => row?.role === role);
    if (rows.length !== 1 || rows[0].status !== 'Valid' || rows[0].publisher !== publisher
      || rows[0].timestamped !== true || !sha256.test(rows[0].sha256)) {
      throw new Error(`Trusted timestamped publisher signature required: ${role}.`);
    }
  }
  if (stage === 'final') {
    assertSignatureReport(payload, { publisher, source, version, stage: 'payload' });
    const original = payload.signatures[0].sha256.toLowerCase();
    for (const role of ['packaged-app', 'embedded-app']) {
      if (report.signatures.find((row) => row.role === role).sha256.toLowerCase() !== original) {
        throw new Error('Final installer payload differs from the verified packaged application.');
      }
    }
    if (!sha256.test(report.embeddedApplicationArchiveSha256)
      || report.applicationArchiveSha256.toLowerCase() !== payload.applicationArchiveSha256.toLowerCase()
      || report.embeddedApplicationArchiveSha256.toLowerCase() !== payload.applicationArchiveSha256.toLowerCase()) {
      throw new Error('Final installer compiled application differs from the verified payload.');
    }
    const installed = report.installedUninstallerEvidence;
    const installerHash = report.signatures.find((row) => row.role === 'installer').sha256.toLowerCase();
    const uninstaller = report.signatures.find((row) => row.role === 'uninstaller');
    if (!installed || installed.result !== 'passed' || !Array.isArray(installed.errors) || installed.errors.length
      || installed.source !== source || installed.version !== version || installed.disposableHostedWindows !== true
      || !/^\d+$/.test(workflowRun) || installed.workflowRun !== workflowRun
      || installed.installerSha256?.toLowerCase() !== installerHash
      || installed.runtime?.packaged !== true || installed.runtime?.e2e !== null || installed.runtime?.version !== version
      || installed.signature?.role !== 'uninstaller' || installed.signature.status !== uninstaller.status
      || installed.signature.publisher !== uninstaller.publisher || installed.signature.timestamped !== true
      || installed.signature.sha256?.toLowerCase() !== uninstaller.sha256.toLowerCase()) {
      throw new Error('Trusted signed installed-VM uninstaller evidence required for this exact installer and workflow.');
    }
  }
  return { ...report, result: 'passed', errors: [] };
}

// PowerShell collects real Authenticode evidence; this entry point validates it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const publisher = assertSigningConfiguration(process.env);
  if (!process.argv.includes('--configuration')) {
    const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const report = JSON.parse(readFileSync(option('report'), 'utf8'));
    const payload = option('payload') ? JSON.parse(readFileSync(option('payload'), 'utf8')) : undefined;
    assertSignatureReport(report, { publisher, source: option('source'), version: option('version'), stage: option('stage'), payload, workflowRun: process.env.GITHUB_RUN_ID });
  }
}
