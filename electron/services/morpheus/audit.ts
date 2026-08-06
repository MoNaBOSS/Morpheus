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
  MorpheusAuditEntry,
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
  recent(limit: number): Promise<MorpheusAuditRecentResult>;
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

  const writeSync = (entry: MorpheusAuditEntry): void => {
    const path = filePathFor(now());
    rollIfOversized(path);
    const safe: MorpheusAuditEntry = {
      ...entry,
      params: sanitizeAuditParams(entry.params),
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

  return {
    record(entry: MorpheusAuditEntry): Promise<void> {
      chain = chain.then(() => {
        writeSync(entry);
      }, () => {
        writeSync(entry);
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
      const slice = lines.slice(-bounded);
      const entries: MorpheusAuditEntry[] = [];
      for (const line of slice) {
        try {
          entries.push(JSON.parse(line) as MorpheusAuditEntry);
        } catch {
          // A torn final line must not break the panel.
        }
      }
      return { entries, truncated: lines.length > slice.length };
    },

    isHealthy: () => healthy,
  };
}
