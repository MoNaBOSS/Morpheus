/**
 * Append-only audit log for Morpheus native actions.
 *
 * Deliberately not `electron/utils/logger.ts`: that writes unstructured text
 * through a 500 ms buffer, and its files are exposed wholesale to the Renderer
 * via `logs.readFile`. An audit trail with a loss window, no schema, and shared
 * rotation with debug output is not an audit trail.
 *
 * See `harness/reference/morpheus-execution-architecture.md`.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { MORPHEUS_MAX_AUDIT_PAGE } from '@shared/morpheus/actions/registry';
import type {
  MorpheusAuditQueryPayload,
  MorpheusAuditQueryResult,
  MorpheusAuditRecord,
  MorpheusAuditEntry,
  MorpheusAuditOutcome,
  MorpheusActionResult,
  MorpheusControlAuditEntry,
  MorpheusAuditRecentResult,
} from '@shared/morpheus/action-types';

const FILE_PREFIX = 'audit-';
const FILE_SUFFIX = '.jsonl';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const RETENTION_DAYS = 30;

/** Keys whose values must never reach the audit file. */
const SENSITIVE_KEY_RE = /(token|secret|password|passwd|api[_-]?key|authorization|auth[_-]?header|credential|cookie|session[_-]?key|signature|private)/i;

/**
 * Payload-bearing keys, matched exactly. Kept separate from the substring regex
 * above so derived metadata such as `contentBytes` and `contentSha256` — which
 * are the whole point of not storing the payload — are not caught by it.
 */
const PAYLOAD_KEYS = new Set(['content', 'body', 'text', 'payload', 'data']);

export interface MorpheusAuditSink {
  /**
   * Persists one record. Resolves only once the record is durable, so callers
   * can order an emission strictly after its audit write.
   */
  record(entry: MorpheusAuditEntry): Promise<void>;
  recordControl(entry: Omit<MorpheusControlAuditEntry, 'v' | 'seq' | 'ts' | 'appVersion'> & { appVersion: string }): Promise<void>;
  recent(limit: number): Promise<MorpheusAuditRecentResult>;
  query(payload: MorpheusAuditQueryPayload): Promise<MorpheusAuditQueryResult>;
  /**
   * False once a write has failed and has not since recovered. The policy
   * engine reads this to enter degraded-security mode rather than executing
   * privileged work that cannot be recorded.
   */
  isHealthy(): boolean;
}

export type MorpheusAuditSinkOptions = {
  auditDir: string;
  now?: () => Date;
};

/** Truncated digest. The content itself is never retained anywhere. */
export function morpheusContentDigest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Defensive second pass over parameters. The runtime already sanitizes, but the
 * sink is the last gate before bytes hit disk, so it re-checks rather than
 * trusting its caller.
 */
export function sanitizeAuditParams(
  params: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (PAYLOAD_KEYS.has(key.toLowerCase()) || SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.length > 300 ? `${value.slice(0, 300)}…` : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (value != null) {
      out[key] = '[unsupported]';
    }
  }
  return out;
}

/** Reduces a transient action result to the metadata needed for accountability. */
export function sanitizeAuditOutcome(
  outcome: MorpheusActionResult | undefined,
): MorpheusAuditOutcome | undefined {
  if (!outcome) return undefined;
  switch (outcome.kind) {
    case 'launch':
    case 'file':
    case 'system':
    case 'storage':
    case 'project-launch':
    case 'deletion':
      return outcome;
    case 'text':
      return {
        kind: 'text', path: outcome.path, bytes: outcome.bytes,
        contentSha256: outcome.contentSha256,
      };
    case 'listing':
      return {
        kind: 'listing', path: outcome.path, entryCount: outcome.entries.length,
        truncated: outcome.truncated,
      };
    case 'processes':
      return {
        kind: 'processes', processCount: outcome.processes.length,
        truncated: outcome.truncated,
      };
    case 'url': {
      try {
        return { kind: 'url', origin: new URL(outcome.url).origin };
      } catch {
        return { kind: 'url', origin: '[invalid-url]' };
      }
    }
    case 'notification':
      return { kind: 'notification', delivered: true };
    case 'scheduled-reminder':
      return {
        kind: 'scheduled-reminder',
        scheduleId: outcome.scheduleId,
        workflowId: outcome.workflowId,
        triggerType: outcome.triggerType,
        ...(outcome.nextRunAt ? { nextRunAt: outcome.nextRunAt } : {}),
      };
    case 'website':
      return {
        kind: 'website',
        projectPath: outcome.manifest.projectPath,
        workspaceRoot: outcome.manifest.workspaceRoot,
        entryPath: outcome.manifest.entryPath,
        relativeEntryPath: outcome.manifest.relativeEntryPath,
        fileCount: outcome.manifest.fileCount,
        totalBytes: outcome.manifest.totalBytes,
        verified: true,
      };
  }
}

function dayStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createMorpheusAuditSink(options: MorpheusAuditSinkOptions): MorpheusAuditSink {
  const now = options.now ?? (() => new Date());
  const auditDir = options.auditDir;
  mkdirSync(auditDir, { recursive: true });

  // Serializes writes. Every record awaits the previous one, so file order and
  // sequence order can never diverge.
  let chain: Promise<void> = Promise.resolve();
  /** Flipped by a failed append; the policy engine degrades on this. */
  let healthy = true;

  const filePathFor = (date: Date): string => join(auditDir, `${FILE_PREFIX}${dayStamp(date)}${FILE_SUFFIX}`);

  const rollIfOversized = (path: string): void => {
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      // No active file yet; nothing to roll.
      return;
    }
    if (size < MAX_FILE_BYTES) return;
    for (let index = 1; index < 100; index += 1) {
      const rolled = `${path}.${index}`;
      try {
        statSync(rolled);
      } catch {
        renameSync(path, rolled);
        return;
      }
    }
  };

  const prune = (): void => {
    const cutoff = now().getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let entries: string[];
    try {
      entries = readdirSync(auditDir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!name.startsWith(FILE_PREFIX)) continue;
      const stamp = name.slice(FILE_PREFIX.length, FILE_PREFIX.length + 10);
      const parsed = Date.parse(`${stamp}T00:00:00.000Z`);
      if (Number.isNaN(parsed) || parsed >= cutoff) continue;
      try {
        unlinkSync(join(auditDir, name));
      } catch {
        // A file we cannot remove is not a reason to stop auditing.
      }
    }
  };

  prune();

  const writeSync = (entry: MorpheusAuditRecord): void => {
    const path = filePathFor(now());
    rollIfOversized(path);
    const safe: MorpheusAuditRecord = 'actionId' in entry ? {
      ...entry,
      params: sanitizeAuditParams(entry.params),
    } : {
      ...entry,
      details: sanitizeAuditParams(entry.details),
    };
    // Synchronous append on purpose. Volume is a handful of lines per
    // user-initiated action, and this removes the flush window entirely: there
    // is no buffered state that a crash could lose.
    try {
      appendFileSync(path, `${JSON.stringify(safe)}\n`, 'utf8');
      healthy = true;
    } catch (error) {
      // Surfaced rather than swallowed: an unhealthy sink must move the policy
      // engine into degraded-security mode, not be silently tolerated.
      healthy = false;
      throw error;
    }
  };

  let controlSeq = 0;

  const recordCursorKey = (entry: MorpheusAuditRecord): string => (
    createHash('sha256').update(JSON.stringify(entry), 'utf8').digest('hex').slice(0, 24)
  );

  const decodeCursor = (cursor: string | undefined): string | null => {
    if (!cursor || cursor.length > 512) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { key?: unknown };
      return typeof parsed.key === 'string' && /^[a-f0-9]{24}$/.test(parsed.key) ? parsed.key : null;
    } catch {
      return null;
    }
  };

  const encodeCursor = (entry: MorpheusAuditRecord): string => (
    Buffer.from(JSON.stringify({ key: recordCursorKey(entry) }), 'utf8').toString('base64url')
  );

  const orderedAuditFiles = (): string[] => {
    let names: string[];
    try { names = readdirSync(auditDir); } catch { return []; }
    const parsed = names.flatMap((name) => {
      const match = name.match(/^audit-(\d{4}-\d{2}-\d{2})\.jsonl(?:\.(\d+))?$/);
      return match ? [{ name, day: match[1], roll: match[2] ? Number(match[2]) : Number.MAX_SAFE_INTEGER }] : [];
    });
    return parsed
      .sort((a, b) => b.day.localeCompare(a.day) || b.roll - a.roll)
      .map((entry) => join(auditDir, entry.name));
  };

  const parseRecord = (line: string): MorpheusAuditRecord | null => {
    try {
      const value = JSON.parse(line) as MorpheusAuditRecord;
      if (!value || value.v !== 1 || typeof value.ts !== 'string' || typeof value.seq !== 'number') return null;
      if (!('actionId' in value) && !('category' in value)) return null;
      return value;
    } catch { return null; }
  };

  return {
    record(entry: MorpheusAuditEntry): Promise<void> {
      chain = chain.then(() => {
        writeSync(entry);
      }, () => {
        writeSync(entry);
      });
      return chain;
    },

    recordControl(entry): Promise<void> {
      chain = chain.then(() => {
        controlSeq += 1;
        writeSync({
          ...entry,
          v: 1,
          seq: controlSeq,
          ts: now().toISOString(),
        });
      }, () => {
        controlSeq += 1;
        writeSync({ ...entry, v: 1, seq: controlSeq, ts: now().toISOString() });
      });
      return chain;
    },

    async recent(limit: number): Promise<MorpheusAuditRecentResult> {
      const bounded = Math.max(1, Math.min(Math.trunc(limit) || 1, MORPHEUS_MAX_AUDIT_PAGE));
      await chain.catch(() => undefined);

      let raw: string;
      try {
        raw = readFileSync(filePathFor(now()), 'utf8');
      } catch {
        // Nothing recorded today.
        return { entries: [], truncated: false };
      }

      const lines = raw.split('\n').filter((line) => line.trim().length > 0);
      const entries: MorpheusAuditEntry[] = [];
      for (let index = lines.length - 1; index >= 0 && entries.length < bounded; index -= 1) {
        try {
          const parsed = JSON.parse(lines[index]) as MorpheusAuditRecord;
          if ('actionId' in parsed) entries.push(parsed);
        } catch {
          // A torn final line must not break the panel.
        }
      }
      entries.reverse();
      const executionCount = lines.reduce((count, line) => {
        const parsed = parseRecord(line);
        return count + (parsed && 'actionId' in parsed ? 1 : 0);
      }, 0);
      return { entries, truncated: executionCount > entries.length };
    },

    async query(payload): Promise<MorpheusAuditQueryResult> {
      await chain.catch(() => undefined);
      const limit = Math.max(1, Math.min(Math.trunc(payload.limit ?? 50), MORPHEUS_MAX_AUDIT_PAGE));
      const from = payload.from ? Date.parse(payload.from) : Number.NEGATIVE_INFINITY;
      const to = payload.to ? Date.parse(payload.to) : Number.POSITIVE_INFINITY;
      const cursor = decodeCursor(payload.cursor);
      const entries: MorpheusAuditRecord[] = [];
      let pastCursor = cursor === null;

      outer: for (const path of orderedAuditFiles()) {
        let raw: string;
        try { raw = readFileSync(path, 'utf8'); } catch { continue; }
        const lines = raw.split('\n');
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          const record = parseRecord(lines[index]);
          if (!record) continue;
          if (!pastCursor) {
            if (recordCursorKey(record) === cursor) pastCursor = true;
            continue;
          }
          const time = Date.parse(record.ts);
          if (!Number.isFinite(time) || time < from || time > to) continue;
          const execution = 'actionId' in record;
          if (payload.category && payload.category !== (execution ? 'execution' : record.category)) continue;
          if (payload.capabilityId && (!execution || record.actionId !== payload.capabilityId)) continue;
          if (payload.phase && (!execution || record.phase !== payload.phase)) continue;
          entries.push(record);
          if (entries.length > limit) break outer;
        }
      }

      const truncated = entries.length > limit;
      const page = entries.slice(0, limit);
      return {
        entries: page,
        truncated,
        ...(truncated && page.length ? { nextCursor: encodeCursor(page[page.length - 1]) } : {}),
      };
    },

    isHealthy: () => healthy,
  };
}
