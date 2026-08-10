import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { createMorpheusAuditSink } from '../../electron/services/morpheus/audit';
import type { MorpheusAuditEntry } from '../../shared/morpheus/action-types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function execution(ts: string, seq: number, phase: MorpheusAuditEntry['phase']): MorpheusAuditEntry {
  return {
    v: 1, seq, ts, runId: `run-${seq}`, actionId: 'system.report', phase,
    appVersion: '0.5.0',
  };
}

describe('Morpheus multi-day activity ledger', () => {
  it('queries execution and control records newest-first across daily files with a cursor', async () => {
    const auditDir = mkdtempSync(join(tmpdir(), 'morpheus-activity-'));
    roots.push(auditDir);
    let clock = new Date('2026-08-09T23:59:00.000Z');
    const sink = createMorpheusAuditSink({ auditDir, now: () => clock });
    await sink.record(execution(clock.toISOString(), 1, 'requested'));

    clock = new Date('2026-08-10T00:01:00.000Z');
    await sink.recordControl({
      category: 'permission', event: 'grant-created', subjectId: 'grant-1',
      details: { capabilityId: 'file.createText', resourceScope: 'C:\\Morpheus' }, appVersion: '0.5.0',
    });
    clock = new Date('2026-08-10T00:02:00.000Z');
    await sink.record(execution(clock.toISOString(), 2, 'succeeded'));

    const first = await sink.query({ limit: 2 });
    expect(first.entries).toHaveLength(2);
    expect(first.entries[0].ts).toBe('2026-08-10T00:02:00.000Z');
    expect(first.entries[1]).toMatchObject({ category: 'permission', event: 'grant-created' });
    expect(first.truncated).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = await sink.query({ limit: 2, cursor: first.nextCursor });
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]).toMatchObject({ actionId: 'system.report', phase: 'requested' });
    expect(second.truncated).toBe(false);
  });

  it('filters categories and sanitizes control details before persistence', async () => {
    const auditDir = mkdtempSync(join(tmpdir(), 'morpheus-activity-'));
    roots.push(auditDir);
    const clock = new Date('2026-08-10T12:00:00.000Z');
    const sink = createMorpheusAuditSink({ auditDir, now: () => clock });
    await sink.record(execution(clock.toISOString(), 1, 'requested'));
    await sink.recordControl({
      category: 'schedule', event: 'created', subjectId: 'schedule-1',
      details: { workflowId: 'system-brief', token: 'must-not-persist' }, appVersion: '0.5.0',
    });
    const result = await sink.query({ category: 'schedule', limit: 10 });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      category: 'schedule', details: { workflowId: 'system-brief', token: '[redacted]' },
    });
    const raw = readFileSync(join(auditDir, 'audit-2026-08-10.jsonl'), 'utf8');
    expect(raw).not.toContain('must-not-persist');
  });

  it('does not let control records crowd execution records out of the legacy recent view', async () => {
    const auditDir = mkdtempSync(join(tmpdir(), 'morpheus-activity-'));
    roots.push(auditDir);
    const clock = new Date('2026-08-10T12:00:00.000Z');
    const sink = createMorpheusAuditSink({ auditDir, now: () => clock });
    await sink.record(execution(clock.toISOString(), 1, 'requested'));
    for (let index = 0; index < 5; index += 1) {
      await sink.recordControl({
        category: 'permission', event: 'grant-used', subjectId: `grant-${index}`,
        details: {}, appVersion: '0.5.0',
      });
    }
    await sink.record(execution(clock.toISOString(), 2, 'succeeded'));

    const recent = await sink.recent(2);
    expect(recent.entries.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(recent.truncated).toBe(false);
  });
});
