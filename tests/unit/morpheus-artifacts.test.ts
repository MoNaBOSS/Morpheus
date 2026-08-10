import { describe, expect, it } from 'vitest';

import { artifactFromAuditEntry, artifactFromRun } from '../../src/stores/morpheus-command';
import type { MorpheusAuditEntry, MorpheusRun } from '../../shared/morpheus/action-types';

const BASE_AUDIT: MorpheusAuditEntry = {
  v: 1,
  seq: 1,
  ts: '2026-08-10T12:00:00.000Z',
  runId: 'run-1',
  actionId: 'file.createText',
  phase: 'succeeded',
  appVersion: '0.5.0',
};

describe('Morpheus durable artifact projection', () => {
  it('reconstructs file artifacts from privacy-safe audit metadata', () => {
    expect(artifactFromAuditEntry({
      ...BASE_AUDIT,
      outcome: {
        kind: 'file', path: 'C:\\Morpheus\\notes.txt', bytes: 12,
        contentSha256: '0123456789abcdef',
      },
    })).toEqual({
      kind: 'file', artifactId: 'run-1', path: 'C:\\Morpheus\\notes.txt',
      bytes: 12, contentSha256: '0123456789abcdef', createdAt: BASE_AUDIT.ts,
    });
  });

  it('projects transient sensitive results without carrying their content', () => {
    const run: MorpheusRun = {
      runId: 'run-clipboard', actionId: 'clipboard.readText', phase: 'succeeded', seq: 4,
      requestedAt: BASE_AUDIT.ts, updatedAt: BASE_AUDIT.ts,
      result: {
        kind: 'text', path: 'clipboard', bytes: 13,
        contentSha256: 'fedcba9876543210', text: 'private value',
      },
    };
    const artifact = artifactFromRun(run);
    expect(artifact).toMatchObject({ kind: 'report', data: { path: 'clipboard', bytes: 13 } });
    expect(JSON.stringify(artifact)).not.toContain('private value');
  });

  it('does not invent an artifact for a failed execution', () => {
    expect(artifactFromAuditEntry({ ...BASE_AUDIT, phase: 'failed' })).toBeNull();
  });
});
