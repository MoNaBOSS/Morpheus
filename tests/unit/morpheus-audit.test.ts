import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  createMorpheusAuditSink,
  morpheusContentDigest,
  sanitizeAuditOutcome,
  sanitizeAuditParams,
} from '@electron/services/morpheus/audit';
import {
  MORPHEUS_AUDIT_VERSION,
  type MorpheusAuditEntry,
  type MorpheusRunPhase,
} from '@shared/morpheus/action-types';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-audit-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let dirCounter = 0;
function freshDir(): string {
  dirCounter += 1;
  return join(scratch, `case-${dirCounter}`);
}

function entry(overrides: Partial<MorpheusAuditEntry> = {}): MorpheusAuditEntry {
  return {
    v: MORPHEUS_AUDIT_VERSION,
    seq: 1,
    ts: '2026-08-05T00:00:00.000Z',
    runId: 'run-1',
    actionId: 'system.report',
    phase: 'requested' as MorpheusRunPhase,
    appVersion: '0.1.0',
    ...overrides,
  };
}

function readLines(auditDir: string, day = new Date()): string[] {
  const file = join(auditDir, `audit-${day.toISOString().slice(0, 10)}.jsonl`);
  return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim().length > 0);
}

describe('morpheus audit sink', () => {
  it('writes one parseable JSON object per line', async () => {
    const auditDir = freshDir();
    const sink = createMorpheusAuditSink({ auditDir });
    await sink.record(entry({ seq: 1 }));
    await sink.record(entry({ seq: 2, phase: 'succeeded' }));

    const lines = readLines(auditDir);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(JSON.parse(lines[1]).phase).toBe('succeeded');
  });

  it('preserves sequence order under concurrent record calls', async () => {
    const auditDir = freshDir();
    const sink = createMorpheusAuditSink({ auditDir });
    await Promise.all([1, 2, 3, 4, 5].map((seq) => sink.record(entry({ seq }))));

    const sequences = readLines(auditDir).map((line) => JSON.parse(line).seq);
    expect(sequences).toEqual([1, 2, 3, 4, 5]);
  });

  it('never persists text file content', async () => {
    const auditDir = freshDir();
    const sink = createMorpheusAuditSink({ auditDir });
    await sink.record(entry({
      actionId: 'file.createText',
      params: {
        fileName: 'notes.txt',
        // Content must be stripped even if a caller mistakenly includes it.
        content: 'TOP SECRET PAYLOAD',
        contentBytes: 18,
        contentSha256: morpheusContentDigest('TOP SECRET PAYLOAD'),
      } as never,
    }));

    const raw = readLines(auditDir)[0];
    expect(raw).not.toContain('TOP SECRET PAYLOAD');
    const parsed = JSON.parse(raw);
    expect(parsed.params.content).toBe('[redacted]');
    // The derived metadata is the whole point of not storing the payload.
    expect(parsed.params.contentBytes).toBe(18);
    expect(parsed.params.contentSha256).toMatch(/^[0-9a-f]{16}$/);
    expect(parsed.params.fileName).toBe('notes.txt');
  });

  it('reduces sensitive runtime results to privacy-safe audit metadata', () => {
    expect(sanitizeAuditOutcome({
      kind: 'text', path: 'clipboard', bytes: 19,
      contentSha256: '0123456789abcdef', text: 'private clipboard text',
    })).toEqual({
      kind: 'text', path: 'clipboard', bytes: 19, contentSha256: '0123456789abcdef',
    });
    expect(sanitizeAuditOutcome({
      kind: 'notification', title: 'Private title', body: 'Private body',
    })).toEqual({ kind: 'notification', delivered: true });
    expect(sanitizeAuditOutcome({
      kind: 'scheduled-reminder', scheduleId: 'schedule-1', workflowId: 'reminder-1',
      triggerType: 'daily', nextRunAt: '2026-08-11T09:00:00.000Z',
    })).toEqual({
      kind: 'scheduled-reminder', scheduleId: 'schedule-1', workflowId: 'reminder-1',
      triggerType: 'daily', nextRunAt: '2026-08-11T09:00:00.000Z',
    });
    expect(sanitizeAuditOutcome({
      kind: 'processes', processes: [{ pid: 42, name: 'private-process.exe' }], truncated: false,
    })).toEqual({ kind: 'processes', processCount: 1, truncated: false });
    expect(sanitizeAuditOutcome({
      kind: 'listing', path: 'C:\\Morpheus', entries: [{ name: 'private.txt', kind: 'file' }], truncated: false,
    })).toEqual({ kind: 'listing', path: 'C:\\Morpheus', entryCount: 1, truncated: false });
    expect(sanitizeAuditOutcome({
      kind: 'url', url: 'https://example.com/private?token=must-not-persist',
    })).toEqual({ kind: 'url', origin: 'https://example.com' });
    expect(sanitizeAuditOutcome({
      kind: 'website',
      manifest: {
        v: 1,
        projectPath: 'C:\\Morpheus Files\\projects\\acme',
        workspaceRoot: 'C:\\Morpheus Files',
        entryPath: 'C:\\Morpheus Files\\projects\\acme\\index.html',
        relativeEntryPath: 'projects/acme/index.html',
        fileCount: 5,
        totalBytes: 2048,
        checks: {
          entryDocument: true, viewportMetadata: true, responsiveStyles: true,
          localStylesheet: true, analyticsConfiguration: true, selfContained: true,
        },
        verifiedAt: '2026-08-10T12:00:00.000Z',
      },
    })).toEqual({
      kind: 'website',
      projectPath: 'C:\\Morpheus Files\\projects\\acme',
      workspaceRoot: 'C:\\Morpheus Files',
      entryPath: 'C:\\Morpheus Files\\projects\\acme\\index.html',
      relativeEntryPath: 'projects/acme/index.html',
      fileCount: 5,
      totalBytes: 2048,
      verified: true,
    });
  });

  it('redacts credential-shaped keys', () => {
    const sanitized = sanitizeAuditParams({
      apiKey: 'sk-live-123',
      authorization: 'Bearer abc',
      sessionKey: 'zzz',
      password: 'hunter2',
      fileName: 'ok.txt',
    });
    expect(sanitized).toEqual({
      apiKey: '[redacted]',
      authorization: '[redacted]',
      sessionKey: '[redacted]',
      password: '[redacted]',
      fileName: 'ok.txt',
    });
  });

  it('truncates long string parameters and drops unsupported shapes', () => {
    const sanitized = sanitizeAuditParams({
      long: 'a'.repeat(500),
      nested: { deep: true },
      count: 3,
      flag: false,
      nothing: null,
    });
    expect((sanitized?.long as string).length).toBe(301);
    expect(sanitized?.nested).toBe('[unsupported]');
    expect(sanitized?.count).toBe(3);
    expect(sanitized?.flag).toBe(false);
    expect(sanitized).not.toHaveProperty('nothing');
  });

  it('rotates by day', async () => {
    const auditDir = freshDir();
    let clock = new Date('2026-08-05T10:00:00.000Z');
    const sink = createMorpheusAuditSink({ auditDir, now: () => clock });

    await sink.record(entry({ seq: 1 }));
    clock = new Date('2026-08-06T10:00:00.000Z');
    await sink.record(entry({ seq: 2 }));

    const files = readdirSync(auditDir).sort();
    expect(files).toEqual(['audit-2026-08-05.jsonl', 'audit-2026-08-06.jsonl']);
  });

  it('prunes files older than the retention window at startup', () => {
    const auditDir = freshDir();
    const clock = new Date('2026-08-05T10:00:00.000Z');
    // Create the directory via a throwaway sink, then plant old and recent files.
    createMorpheusAuditSink({ auditDir, now: () => clock });
    writeFileSync(join(auditDir, 'audit-2026-06-01.jsonl'), '{}\n', 'utf8');
    writeFileSync(join(auditDir, 'audit-2026-08-01.jsonl'), '{}\n', 'utf8');
    writeFileSync(join(auditDir, 'unrelated.txt'), 'keep me', 'utf8');

    createMorpheusAuditSink({ auditDir, now: () => clock });

    const files = readdirSync(auditDir).sort();
    expect(files).toContain('audit-2026-08-01.jsonl');
    expect(files).not.toContain('audit-2026-06-01.jsonl');
    // Only audit files are managed; anything else is left alone.
    expect(files).toContain('unrelated.txt');
  });

  it('rolls the active file once it exceeds the size cap', async () => {
    const auditDir = freshDir();
    const clock = new Date('2026-08-05T10:00:00.000Z');
    const sink = createMorpheusAuditSink({ auditDir, now: () => clock });
    await sink.record(entry({ seq: 1 }));

    const active = join(auditDir, 'audit-2026-08-05.jsonl');
    writeFileSync(active, 'x'.repeat(9 * 1024 * 1024), 'utf8');
    await sink.record(entry({ seq: 2 }));

    expect(statSync(join(auditDir, 'audit-2026-08-05.jsonl.1')).size).toBeGreaterThan(8 * 1024 * 1024);
    expect(readLines(auditDir, clock)).toHaveLength(1);
  });

  it('returns a bounded recent tail, newest last', async () => {
    const auditDir = freshDir();
    const sink = createMorpheusAuditSink({ auditDir });
    for (let seq = 1; seq <= 12; seq += 1) {
      await sink.record(entry({ seq, runId: `run-${seq}` }));
    }

    const recent = await sink.recent(5);
    expect(recent.entries).toHaveLength(5);
    expect(recent.entries.map((e) => e.seq)).toEqual([8, 9, 10, 11, 12]);
    expect(recent.truncated).toBe(true);
  });

  it('clamps the requested page size', async () => {
    const auditDir = freshDir();
    const sink = createMorpheusAuditSink({ auditDir });
    for (let seq = 1; seq <= 3; seq += 1) await sink.record(entry({ seq }));

    expect((await sink.recent(0)).entries).toHaveLength(1);
    expect((await sink.recent(-5)).entries).toHaveLength(1);
    expect((await sink.recent(10_000)).entries).toHaveLength(3);
  });

  it('returns an empty result when nothing has been recorded today', async () => {
    const auditDir = freshDir();
    const sink = createMorpheusAuditSink({ auditDir });
    expect(await sink.recent(10)).toEqual({ entries: [], truncated: false });
  });

  it('survives a torn trailing line', async () => {
    const auditDir = freshDir();
    const clock = new Date('2026-08-05T10:00:00.000Z');
    const sink = createMorpheusAuditSink({ auditDir, now: () => clock });
    await sink.record(entry({ seq: 1 }));
    writeFileSync(join(auditDir, 'audit-2026-08-05.jsonl'), `${readLines(auditDir, clock)[0]}\n{"broken"`, 'utf8');

    const recent = await sink.recent(10);
    expect(recent.entries).toHaveLength(1);
    expect(recent.entries[0].seq).toBe(1);
  });
});

describe('morpheusContentDigest', () => {
  it('is a stable truncated sha-256', () => {
    expect(morpheusContentDigest('hello')).toBe('2cf24dba5fb0a30e');
    expect(morpheusContentDigest('hello')).toBe(morpheusContentDigest('hello'));
    expect(morpheusContentDigest('hello')).not.toBe(morpheusContentDigest('hello '));
  });
});
