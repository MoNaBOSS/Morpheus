import { randomUUID } from 'node:crypto';
import { normalizeComparablePath } from '../../utils/morpheus-path-guard';
import type { MorpheusPublicationConnectionInput, MorpheusPublicationError, MorpheusPublicationPreview, MorpheusPublicationReceipt, MorpheusPublicationResult, MorpheusPublicationSource, MorpheusPublicationState } from '@shared/morpheus/publication-types';
import type { MorpheusWorkspaceStore } from '../morpheus/workspaces/workspace-store';
import type { MorpheusRootProvider } from '../morpheus/roots';
import type { MorpheusAuditSink } from '../morpheus/audit';
import type { SecretStore } from '../secrets/protected-provider-secret-store';
import { createGitHubPagesAdapter, type PreparedPagesTarget } from './github-pages';
import { prepareInteractivePublication, type PublicationSnapshot } from './snapshot';
import { verifyPublishedSnapshot } from './verify-http';
import type { createPublicationJournal, PublicationConnection, PublicationJournal, PublicationRecord } from './journal';
import { createGitHubRequest } from './github-transport';

class PublicationError extends Error { constructor(readonly code: MorpheusPublicationError) { super(code); } }
const fail = (code: MorpheusPublicationError): never => { throw new PublicationError(code); };
const inputRecord = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) return fail('invalid');
  return value as Record<string, unknown>;
};
const reference = (payload: unknown, key: string): string => {
  const input = inputRecord(payload, [key]);
  if (typeof input[key] !== 'string' || !/^[a-f0-9-]{36}$/.test(input[key])) return fail('invalid');
  return input[key];
};
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const sameFiles = (left: Record<string, string>, snapshot: PublicationSnapshot) => same(Object.entries(left).sort(), snapshot.files.map((file) => [file.path, file.gitBlob]).sort());
const unresolved = (record: PublicationRecord) => ['ready', 'publishing', 'unknown'].includes(record.receipt.status);
type Approval = { id: string; operation: 'publish' | 'rollback'; expires: number; credentialId: string; prepared: PreparedPagesTarget; snapshot: PublicationSnapshot; previousReceiptId: string | null; workspaceId: string; relativeEntryPath: string };

export type PublicationServiceOptions = {
  journal: ReturnType<typeof createPublicationJournal>;
  secrets: SecretStore;
  workspaces: MorpheusWorkspaceStore;
  audit: MorpheusAuditSink;
  appVersion: string;
  now?: () => number;
  adapter?: (token: string, input: PublicationConnection['input'], signal: AbortSignal) => ReturnType<typeof createGitHubPagesAdapter>;
  verify?: typeof verifyPublishedSnapshot;
};

/** One Main owner. Only an explicit short-lived id can reach writes; no startup
 * work, renderer-supplied bytes, idle polling, CLI account or model-held token. */
export function createPublicationService(options: PublicationServiceOptions) {
  const now = options.now ?? Date.now;
  let busy = false;
  let approval: Approval | null = null;
  const operation = <T>(work: () => Promise<T>): Promise<MorpheusPublicationResult<T>> => {
    if (busy) return Promise.resolve({ ok: false, code: 'busy' });
    busy = true;
    return work().then((value): MorpheusPublicationResult<T> => ({ ok: true, value }), (error): MorpheusPublicationResult<T> => ({ ok: false, code: error instanceof PublicationError ? error.code : 'failed' })).finally(() => { busy = false; });
  };
  const read = () => options.journal.read().catch(() => fail('storage'));
  const save = (state: PublicationJournal) => options.journal.write(state).catch(() => fail('storage'));
  const audit = (event: string, receiptId: string, details: Record<string, string | number | boolean> = {}) => options.audit.recordControl({
    category: 'workspace', event, subjectId: receiptId, details, appVersion: options.appVersion,
  }).catch(() => fail('storage'));
  const adapter = (token: string, input: PublicationConnection['input']) => (options.adapter ?? ((token, input, signal) => createGitHubPagesAdapter(createGitHubRequest(token, signal), input)))(token, input, AbortSignal.timeout(60_000));
  const connectionAdapter = async (connection: PublicationConnection | null) => {
    if (!connection) return fail('connection');
    const secret = await options.secrets.get(connection.credentialId).catch(() => fail('connection'));
    if (!secret || secret.type !== 'api_key') return fail('connection');
    return adapter(secret.apiKey, connection.input);
  };
  const rootsFor = (workspaceId: string): MorpheusRootProvider => {
    const roots: MorpheusRootProvider = { resolve: () => options.workspaces.resolveRoot(workspaceId), forWorkspace: () => roots };
    try { roots.resolve('morpheusFiles'); } catch { return fail('changed'); }
    return roots;
  };
  const publicReceipt = (record: PublicationRecord, state: PublicationJournal): MorpheusPublicationReceipt => ({
    ...record.receipt,
    // A process can disappear after sending the update but before saving its reply.
    status: record.receipt.status === 'publishing' ? 'unknown' : record.receipt.status,
    canRollback: !!record.previousReceiptId && ['published', 'verifying'].includes(record.receipt.status)
      && state.records.filter((item) => same(item.receipt.target, record.receipt.target)).at(-1) === record,
  });
  const preview = (value: Approval): MorpheusPublicationPreview => ({ approvalId: value.id, operation: value.operation,
    target: value.prepared.target, sourceRevision: value.snapshot.sourceRevision, publicDigest: value.snapshot.publicDigest,
    files: value.snapshot.files.map(({ path, content, bytes, sha256 }) => ({ path, content, bytes, sha256 })),
    expectedHead: value.prepared.expectedHead, expiresAt: new Date(value.expires).toISOString() });
  const prepare = async (state: PublicationJournal, data: Pick<Approval, 'snapshot' | 'workspaceId' | 'relativeEntryPath' | 'operation'>) => {
    if (state.records.some(unresolved)) return fail('unresolved');
    const client = await connectionAdapter(state.connection);
    const prepared = await client.inspect().catch(() => fail('connection'));
    if (!same(prepared.target, state.connection!.target)) return fail('changed');
    // Unrelated commits or an explicit external rollback need not trap the user.
    // Only exact previously owned bytes (or an empty destination) can be replaced.
    const previous = state.records.filter((record) => same(record.receipt.target, prepared.target)
      && ['published', 'verifying', 'conflict'].includes(record.receipt.status) && sameFiles(prepared.currentFiles, record.snapshot)).at(-1);
    if (!previous && Object.keys(prepared.currentFiles).length) return fail('changed');
    approval = { ...data, id: randomUUID(), expires: now() + 5 * 60_000, credentialId: state.connection!.credentialId, prepared, previousReceiptId: previous?.receipt.receiptId ?? null };
    return preview(approval);
  };
  const verify = async (record: PublicationRecord): Promise<boolean> => {
    try { return await (options.verify ?? verifyPublishedSnapshot)(record.receipt.target, record.snapshot, AbortSignal.timeout(20_000)); } catch { return false; }
  };
  return {
    status: () => operation<MorpheusPublicationState>(async () => {
      const state = await read();
      return { connection: state.connection?.target ?? null, receipts: state.records.map((record) => publicReceipt(record, state)).reverse() };
    }),
    connect: (payload: MorpheusPublicationConnectionInput) => operation<MorpheusPublicationState>(async () => {
      const input = inputRecord(payload, ['owner', 'repository', 'slug', 'token']);
      if (['owner', 'repository', 'slug', 'token'].some((key) => typeof input[key] !== 'string')
        || !/^(?:github_pat_[A-Za-z0-9_]{20,240}|ghp_[A-Za-z0-9]{20,240})$/.test(input.token as string)) return fail('invalid');
      const state = await read();
      const targetInput = { owner: input.owner as string, repository: input.repository as string, slug: input.slug as string };
      const client = adapter(input.token as string, targetInput);
      const prepared = await client.inspect().catch(() => fail('connection'));
      // Reconnecting the SAME destination allows recovery, but changing it cannot
      // hide an ambiguous external write or make its receipt unreachable.
      if (state.records.some((record) => unresolved(record) && !same(record.receipt.target, prepared.target))) return fail('unresolved');
      const credentialId = randomUUID();
      await audit('publication-connection-requested', credentialId, { repositoryId: prepared.target.repositoryId, accountId: prepared.target.accountId });
      await options.secrets.set({ type: 'api_key', accountId: credentialId, apiKey: input.token as string }).catch(() => fail('storage'));
      const oldId = state.connection?.credentialId;
      state.connection = { credentialId, input: targetInput, target: prepared.target };
      approval = null;
      await save(state);
      if (oldId) await options.secrets.delete(oldId).catch(() => fail('storage'));
      return { connection: prepared.target, receipts: state.records.map((record) => publicReceipt(record, state)).reverse() };
    }),
    disconnect: () => operation(async () => {
      const state = await read();
      approval = null;
      const id = state.connection?.credentialId;
      if (id) {
        await audit('publication-disconnect-requested', id);
        state.connection = null;
        await save(state); // Revoke logical access even if protected-file cleanup fails.
        await options.secrets.delete(id).catch(() => fail('storage'));
      }
      return { disconnected: true as const };
    }),
    prepare: (payload: MorpheusPublicationSource) => operation(async () => {
      approval = null;
      const input = inputRecord(payload, ['workspaceRoot', 'relativeEntryPath', 'revision']);
      if (typeof input.workspaceRoot !== 'string' || input.workspaceRoot.length > 1000 || typeof input.relativeEntryPath !== 'string'
        || !input.relativeEntryPath.endsWith('/index.html') || input.relativeEntryPath.length > 240
        || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) return fail('invalid');
      const workspace = options.workspaces.list().workspaces.find((item) => item.enabled && item.available && normalizeComparablePath(item.rootPath) === normalizeComparablePath(input.workspaceRoot as string));
      if (!workspace) return fail('changed');
      const snapshot = await prepareInteractivePublication(rootsFor(workspace.workspaceId), input.relativeEntryPath.slice(0, -11), input.revision).catch(() => fail('changed'));
      return prepare(await read(), { snapshot, workspaceId: workspace.workspaceId, relativeEntryPath: input.relativeEntryPath, operation: 'publish' });
    }),
    prepareRollback: (payload: { receiptId: string }) => operation(async () => {
      approval = null;
      const receiptId = reference(payload, 'receiptId');
      const state = await read();
      const current = state.records.find((record) => record.receipt.receiptId === receiptId);
      if (!current || !publicReceipt(current, state).canRollback || !same(current.receipt.target, state.connection?.target)) return fail('changed');
      const previous = state.records.find((record) => record.receipt.receiptId === current.previousReceiptId)!;
      rootsFor(current.workspaceId);
      return prepare(state, { snapshot: previous.snapshot, workspaceId: current.workspaceId, relativeEntryPath: current.relativeEntryPath, operation: 'rollback' });
    }),
    confirm: (payload: { approvalId: string }) => operation(async () => {
      const approvalId = reference(payload, 'approvalId');
      const selected = approval;
      approval = null; // Consume BEFORE any I/O, including failure. Never replay a click.
      if (!selected || selected.id !== approvalId || now() >= selected.expires) return fail('expired');
      const state = await read();
      if (state.records.some(unresolved)) return fail('unresolved');
      if (state.connection?.credentialId !== selected.credentialId || !same(state.connection.target, selected.prepared.target)) return fail('changed');
      const roots = rootsFor(selected.workspaceId);
      if (selected.operation === 'publish') {
        const current = await prepareInteractivePublication(roots, selected.relativeEntryPath.slice(0, -11), selected.snapshot.sourceRevision).catch(() => fail('changed'));
        if (current.publicDigest !== selected.snapshot.publicDigest) return fail('changed');
      }
      const client = await connectionAdapter(state.connection);
      const record: PublicationRecord = { workspaceId: selected.workspaceId, relativeEntryPath: selected.relativeEntryPath,
        prepared: selected.prepared, snapshot: selected.snapshot, previousReceiptId: selected.previousReceiptId,
        receipt: { receiptId: randomUUID(), target: selected.prepared.target, sourceRevision: selected.snapshot.sourceRevision,
          publicDigest: selected.snapshot.publicDigest, previousCommit: selected.prepared.expectedHead, commit: '', status: 'ready', canRollback: false, createdAt: new Date(now()).toISOString() } };
      await audit('publication-approved', record.receipt.receiptId, { publicDigest: record.receipt.publicDigest, repositoryId: record.receipt.target.repositoryId, operation: selected.operation });
      state.records.push(record);
      await save(state); // Full exact intent + rollback evidence before ANY remote write.
      const previous = state.records.find((item) => item.receipt.receiptId === selected.previousReceiptId);
      try { record.receipt.commit = await client.createCommit(selected.prepared, selected.snapshot, previous?.snapshot ?? null); }
      catch {
        record.receipt.status = 'not-published'; // Only Git objects may exist; no branch update attempted.
        await save(state);
        return publicReceipt(record, state);
      }
      await save(state);
      await audit('publication-advance-requested', record.receipt.receiptId, { commit: record.receipt.commit });
      rootsFor(selected.workspaceId); // Revocation during a network round trip prevents advance.
      record.receipt.status = 'publishing';
      await save(state); // Exact commit MUST be durable before the one branch-update attempt.
      try { await client.advance(selected.prepared, record.receipt.commit); record.receipt.status = 'verifying'; }
      catch { record.receipt.status = 'unknown'; }
      await save(state);
      if (record.receipt.status === 'verifying' && await verify(record)) {
        await audit('publication-http-verified', record.receipt.receiptId, { commit: record.receipt.commit, publicDigest: record.receipt.publicDigest });
        record.receipt.status = 'published';
        record.receipt.verifiedAt = new Date(now()).toISOString();
        await save(state);
      }
      return publicReceipt(record, state);
    }),
    check: (payload: { receiptId: string }) => operation(async () => {
      const receiptId = reference(payload, 'receiptId');
      const state = await read();
      const record = state.records.find((item) => item.receipt.receiptId === receiptId);
      if (!record || !same(record.receipt.target, state.connection?.target)
        || state.records.filter((item) => same(item.receipt.target, record.receipt.target)).at(-1) !== record) return fail('changed');
      if (record.receipt.status === 'ready' || record.receipt.status === 'not-published') {
        record.receipt.status = 'not-published'; // No stored publishing intent, so no write could have been sent.
      } else {
        const client = await connectionAdapter(state.connection);
        const prepared = await client.inspect().catch(() => fail('connection'));
        if (!same(prepared.target, record.receipt.target)) return fail('changed');
        const result = await client.reconcile(record.prepared, record.receipt.commit).catch(() => fail('connection'));
        // A later unrelated commit is compatible only when the exact site bytes
        // remain present. Never infer success from a URL or branch head alone.
        record.receipt.status = sameFiles(prepared.currentFiles, record.snapshot) ? await verify(record) ? 'published' : 'verifying'
          : result === 'not-applied' ? 'not-published' : 'conflict';
        if (record.receipt.status === 'published') record.receipt.verifiedAt = new Date(now()).toISOString();
        else delete record.receipt.verifiedAt;
      }
      await audit('publication-reconciled', record.receipt.receiptId, { status: record.receipt.status });
      await save(state);
      return publicReceipt(record, state);
    }),
  };
}

export type PublicationService = ReturnType<typeof createPublicationService>;
