import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MorpheusPublicationReceipt, MorpheusPublicationTarget } from '@shared/morpheus/publication-types';
import type { PreparedPagesTarget } from './github-pages';
import { createGitHubPagesAdapter } from './github-pages';
import { validatePublicationSnapshot, type PublicationSnapshot } from './snapshot';

export type PublicationConnection = { credentialId: string; input: { owner: string; repository: string; slug: string }; target: MorpheusPublicationTarget };
export type PublicationRecord = {
  receipt: MorpheusPublicationReceipt;
  prepared: PreparedPagesTarget;
  snapshot: PublicationSnapshot;
  previousReceiptId: string | null;
  workspaceId: string;
  relativeEntryPath: string;
};
export type PublicationJournal = { version: 1; connection: PublicationConnection | null; records: PublicationRecord[] };
const LIMIT = 16 * 1024 * 1024;
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const id = (value: unknown) => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function validatePublicationTarget(target: MorpheusPublicationTarget): void {
  if (!target || !Number.isSafeInteger(target.accountId) || target.accountId <= 0
    || !Number.isSafeInteger(target.repositoryId) || target.repositoryId <= 0 || !/^[A-Za-z0-9-]{1,39}$/.test(target.accountLogin)
    || target.branch !== 'gh-pages' || !/^sites\/[a-z0-9][a-z0-9-]{0,47}$/.test(target.sitePath)) throw new Error('Invalid publication target.');
  createGitHubPagesAdapter(async () => { throw new Error('Validation is read-only.'); }, { owner: target.owner, repository: target.repository, slug: target.sitePath.slice(6) });
  const path = target.repository.toLowerCase() === `${target.owner.toLowerCase()}.github.io` ? '' : `/${target.repository}`;
  if (target.url !== `https://${target.owner.toLowerCase()}.github.io${path}/${target.sitePath}/`) throw new Error('Invalid publication address.');
}

export function validatePublicationJournal(value: unknown): PublicationJournal {
  const state = value as PublicationJournal;
  if (!state || state.version !== 1 || !Array.isArray(state.records) || state.records.length > 100) throw new Error('Invalid publication journal.');
  if (state.connection !== null) {
    const connection = state.connection;
    validatePublicationTarget(connection?.target);
    if (!id(connection.credentialId) || connection.input.owner !== connection.target.owner || connection.input.repository !== connection.target.repository
      || `sites/${connection.input.slug}` !== connection.target.sitePath) throw new Error('Invalid publication connection.');
  }
  const seen = new Set<string>();
  for (const record of state.records) {
    const r = record.receipt;
    validatePublicationTarget(r?.target);
    validatePublicationSnapshot(record.snapshot);
    if (!id(r.receiptId) || seen.has(r.receiptId) || !date(r.createdAt) || (r.verifiedAt !== undefined && !date(r.verifiedAt))
      || !['ready', 'publishing', 'unknown', 'verifying', 'published', 'conflict', 'not-published'].includes(r.status)
      || (r.commit !== '' && !sha(r.commit)) || (!['ready', 'not-published'].includes(r.status) && !sha(r.commit))
      || !sha(r.previousCommit) || r.sourceRevision !== record.snapshot.sourceRevision || r.publicDigest !== record.snapshot.publicDigest
      || !record.prepared || JSON.stringify(record.prepared.target) !== JSON.stringify(r.target) || record.prepared.expectedHead !== r.previousCommit
      || !sha(record.prepared.rootTree) || !record.prepared.currentFiles || Object.entries(record.prepared.currentFiles).some(([path, hash]) => !['app.js', 'index.html', 'styles.css', 'morpheus-release.json'].includes(path) || !sha(hash))
      || typeof record.workspaceId !== 'string' || !record.workspaceId || typeof record.relativeEntryPath !== 'string' || !record.relativeEntryPath.endsWith('/index.html')
      || (record.previousReceiptId !== null && !seen.has(record.previousReceiptId))) throw new Error('Invalid publication receipt.');
    if (record.previousReceiptId) {
      const previous = state.records.find((item) => item.receipt.receiptId === record.previousReceiptId)!;
      if (JSON.stringify(previous.receipt.target) !== JSON.stringify(r.target)) throw new Error('Publication history target changed.');
    }
    seen.add(r.receiptId);
  }
  return state;
}

/** Dedicated write-ahead file. A corrupt/truncated file is NEVER treated as empty.
 * File data is flushed before atomic rename; no automatic replay on startup. */
export function createPublicationJournal(path: string) {
  return {
    async read(): Promise<PublicationJournal> {
      let file;
      try { file = await open(path, 'r'); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, connection: null, records: [] };
        throw error;
      }
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > LIMIT) throw new Error('Publication journal exceeds its limit.');
        const bytes = Buffer.alloc(stat.size + 1);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead !== stat.size) throw new Error('Publication journal changed while reading.');
        return validatePublicationJournal(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')));
      } finally { await file.close(); }
    },
    async write(state: PublicationJournal): Promise<void> {
      validatePublicationJournal(state);
      const contents = JSON.stringify(state);
      if (Buffer.byteLength(contents) > LIMIT) throw new Error('Publication journal is full. Existing receipts were retained.');
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        const file = await open(temporary, 'wx', 0o600);
        try { await file.writeFile(contents, 'utf8'); await file.sync(); } finally { await file.close(); }
        await rename(temporary, path);
      } finally { await unlink(temporary).catch(() => undefined); }
    },
  };
}
