import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyImageSizePatch } from './verify-image-size-patch.mjs';

const patchedAdvisories = new Set(['GHSA-w3rx-r6r6-pgpr', 'GHSA-5p2g-fcmc-qvqq']);

export function classifyAudit(report) {
  assert.ok(report && report.advisories && report.metadata?.vulnerabilities,
    'Unrecognized dependency audit response; refusing to treat it as clean');
  const reportedCount = Object.values(report.metadata.vulnerabilities).reduce((total, count) => total + count, 0);
  assert.equal(Object.keys(report.advisories).length, reportedCount,
    'Incomplete dependency audit response; refusing to omit findings');
  const local = [];
  const unresolved = [];
  for (const advisory of Object.values(report.advisories)) {
    const exactPatchedDependency = advisory.module_name === 'image-size'
      && patchedAdvisories.has(advisory.github_advisory_id)
      && advisory.findings?.length > 0
      && advisory.findings.every(finding => finding.version === '2.0.2'
        && finding.paths?.length > 0
        && finding.paths.every(path => path === '.>@larksuite/openclaw-lark>image-size'));
    (exactPatchedDependency ? local : unresolved).push({
      id: advisory.github_advisory_id, package: advisory.module_name, severity: advisory.severity,
    });
  }
  return { locallyPatched: local, unresolved };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.pnpm?.patchedDependencies?.['image-size@2.0.2'], 'patches/image-size@2.0.2.patch');
  assert.ok(readFileSync('patches/image-size@2.0.2.patch', 'utf8').includes('Invalid ICNS entry size'));
  const proof = verifyImageSizePatch();
  assert.ok(process.env.npm_execpath, 'Run through pnpm run security:check');
  const audit = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json'], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    windowsHide: true, shell: false,
  });
  assert.equal(audit.error, undefined, 'Dependency audit unavailable');
  assert.ok(audit.status === 0 || audit.status === 1, 'Dependency audit did not complete');
  const result = classifyAudit(JSON.parse(audit.stdout));
  console.log(JSON.stringify({ proof, ...result }, null, 2));
  if (result.unresolved.length) process.exitCode = 1;
}
