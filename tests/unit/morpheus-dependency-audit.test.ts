// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error Build tooling is native ESM, exercised without a TS declaration.
import { classifyAudit } from '../../scripts/security/audit-dependencies.mjs';

const finding = {
  github_advisory_id: 'GHSA-w3rx-r6r6-pgpr', module_name: 'image-size', severity: 'high',
  findings: [{ version: '2.0.2', paths: ['.>@larksuite/openclaw-lark>image-size'] }],
};
const report = (advisory: unknown) => ({ advisories: { one: advisory }, metadata: { vulnerabilities: { high: 1 } } });

describe('explicit local dependency remediation classification', () => {
  it('recognizes only the tested package, version, path and advisory', () => {
    expect(classifyAudit(report(finding)).locallyPatched).toHaveLength(1);
    for (const changed of [
      { github_advisory_id: 'GHSA-new-issue' }, { module_name: 'another-package' },
      { findings: [{ version: '2.0.1', paths: ['.>@larksuite/openclaw-lark>image-size'] }] },
      { findings: [{ version: '2.0.2', paths: ['.>another-plugin>image-size'] }] },
      { findings: [] },
    ]) expect(classifyAudit(report({ ...finding, ...changed })).unresolved).toHaveLength(1);
  });
  it('does not mistake registry errors for a clean audit', () => {
    expect(() => classifyAudit({ error: 'unavailable' })).toThrow();
    expect(() => classifyAudit({ advisories: {}, metadata: { vulnerabilities: { high: 1 } } })).toThrow();
  });
});
