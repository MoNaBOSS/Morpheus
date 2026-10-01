import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicationService, type PublicationServiceOptions } from '../../electron/services/site-publication/service';
import { createPublicationJournal } from '../../electron/services/site-publication/journal';
import { createInteractiveProject } from '../../electron/services/interactive-site/project';
import { createMorpheusWorkspaceStore } from '../../electron/services/morpheus/workspaces/workspace-store';
import { createMorpheusRootProvider } from '../../electron/services/morpheus/roots';
import { createMorpheusAuditSink } from '../../electron/services/morpheus/audit';
import { createProtectedProviderSecretStore } from '../../electron/services/secrets/protected-provider-secret-store';
import type { PublicationSnapshot } from '../../electron/services/site-publication/snapshot';
import type { MorpheusPublicationResult } from '../../shared/morpheus/publication-types';

const dirs: string[] = [];
afterEach(async () => { for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true }); });
const value = <T>(result: MorpheusPublicationResult<T>): T => { expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.code); return result.value; };
const spec = { template: 'studio-v1', title: 'North', headline: 'Hello, world.', description: 'Independent studio.', services: [{ title: 'Design', category: 'Design', description: 'Clear ideas.' }], faqs: [] };
const input = { owner: 'Larry', repository: 'studio', slug: 'north', token: 'ghp_' + 'a'.repeat(36) };
async function setup() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'morpheus-publish-')); dirs.push(userDataDir);
  const workspaces = createMorpheusWorkspaceStore({ userDataDir });
  const roots = createMorpheusRootProvider({ userDataDir, workspaces });
  const audit = createMorpheusAuditSink({ auditDir: join(userDataDir, 'audit') });
  const protectedPath = join(userDataDir, 'publication-credentials.json');
  // Synthetic reversible protection exercises the real vault's atomic protocol;
  // Windows DPAPI acceptance is performed separately in native integration.
  const secrets = createProtectedProviderSecretStore({ path: protectedPath,
    protection: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s).reverse(), decryptString: (b) => Buffer.from(b).reverse().toString() },
    legacyStore: { path: '', get: () => undefined, set: () => {} } });
  const journalPath = join(userDataDir, 'receipts.json');
  const journal = createPublicationJournal(journalPath);
  const created = await createInteractiveProject(roots, 'studio', spec);
  const source = { workspaceRoot: roots.resolve('morpheusFiles'), relativeEntryPath: 'studio/index.html', revision: created.revision };
  const target = { accountId: 7, accountLogin: 'Larry', repositoryId: 52, owner: 'Larry', repository: 'studio', branch: 'gh-pages' as const, sitePath: 'sites/north', url: 'https://larry.github.io/studio/sites/north/' };
  let head = '1'.repeat(40), currentFiles: Record<string, string> = {}, next = 3, visible = false, lose = false, apply = true;
  let now = Date.now();
  const commits = new Map<string, PublicationSnapshot>();
  const inspect = vi.fn(async () => ({ target, expectedHead: head, rootTree: '2'.repeat(40), currentFiles }));
  const createCommit = vi.fn<ReturnType<NonNullable<PublicationServiceOptions['adapter']>>['createCommit']>(async (_p, snapshot) => { const id = String(next++).padStart(40, '0'); commits.set(id, snapshot); return id; });
  const advance = vi.fn<ReturnType<NonNullable<PublicationServiceOptions['adapter']>>['advance']>(async (_p, id) => {
    const persisted = (await journal.read()).records.at(-1)!;
    expect(persisted.receipt).toMatchObject({ status: 'publishing', commit: id });
    expect(persisted.snapshot).toEqual(commits.get(id));
    if (apply) { head = id; currentFiles = Object.fromEntries(commits.get(id)!.files.map((f) => [f.path, f.gitBlob])); }
    if (lose) throw new Error('Secret-bearing remote failure ' + input.token);
  });
  const adapter: NonNullable<PublicationServiceOptions['adapter']> = () => ({ inspect, createCommit, advance, head: async () => head,
    reconcile: async (prepared, commit) => head === commit ? 'applied' : head === prepared.expectedHead ? 'not-applied' : 'conflict' });
  const options: PublicationServiceOptions = { journal, secrets, workspaces, audit, appVersion: 'test', adapter, verify: async () => visible, now: () => now };
  const service = createPublicationService(options);
  return { userDataDir, journalPath, protectedPath, journal, source, options, service, createCommit, advance, inspect, roots, secrets, target,
    visible: () => { visible = true; }, lose: (applied = true) => { lose = true; apply = applied; }, expire: () => { now += 300_001; },
    conflict: (changedFiles = true) => { head = 'f'.repeat(40); if (changedFiles) currentFiles['index.html'] = 'e'.repeat(40); },
    prepare: async () => { value(await service.connect(input)); return value(await service.prepare(source)); } };
}

describe('publication Main owner and durable receipts', () => {
  it('requires exact approval, persists before writes, returns verifying until real bytes are observed, never leaks its token', async () => {
    const f = await setup(); const preview = await f.prepare();
    expect(preview.files).toHaveLength(4); expect(preview.files.find((file) => file.path === 'index.html')!.content).toContain(spec.headline);
    expect(f.createCommit).not.toHaveBeenCalled();
    const receipt = value(await f.service.confirm({ approvalId: preview.approvalId }));
    expect(receipt.status).toBe('verifying'); expect(f.advance).toHaveBeenCalledTimes(1);
    expect(await f.service.confirm({ approvalId: preview.approvalId })).toEqual({ ok: false, code: 'expired' });
    f.visible(); expect(value(await f.service.check({ receiptId: receipt.receiptId })).status).toBe('published');
    for (const content of [JSON.stringify(await f.service.status()), await readFile(f.journalPath, 'utf8'), await readFile(f.protectedPath, 'utf8')]) expect(content).not.toContain(input.token);
  });
  it('does nothing on restart and reconciles an applied lost response without a second write', async () => {
    const f = await setup(); const preview = await f.prepare(); f.lose();
    const receipt = value(await f.service.confirm({ approvalId: preview.approvalId })); expect(receipt.status).toBe('unknown');
    const restart = createPublicationService(f.options); f.visible();
    expect(value(await restart.status()).receipts[0].status).toBe('unknown'); expect(f.advance).toHaveBeenCalledTimes(1);
    expect(value(await restart.check({ receiptId: receipt.receiptId })).status).toBe('published'); expect(f.advance).toHaveBeenCalledTimes(1);
    expect(await restart.confirm({ approvalId: preview.approvalId })).toEqual({ ok: false, code: 'expired' });
  });
  it('does not replay a not-applied lost response and requires a new approval for another attempt', async () => {
    const f = await setup(); const preview = await f.prepare(); f.lose(false);
    const receipt = value(await f.service.confirm({ approvalId: preview.approvalId }));
    expect(await f.service.prepare(f.source)).toEqual({ ok: false, code: 'unresolved' });
    expect(value(await f.service.check({ receiptId: receipt.receiptId })).status).toBe('not-published');
    expect(value(await f.service.prepare(f.source)).approvalId).not.toBe(preview.approvalId); expect(f.advance).toHaveBeenCalledTimes(1);
  });
  it('blocks unknown concurrent branch changes instead of claiming a publish or overwriting them', async () => {
    const f = await setup(); const p = await f.prepare(); f.lose(); const r = value(await f.service.confirm({ approvalId: p.approvalId })); f.conflict();
    expect(value(await f.service.check({ receiptId: r.receiptId })).status).toBe('conflict');
    expect(await f.service.prepare(f.source)).toEqual({ ok: false, code: 'changed' });
  });
  it('does not trap a verified site behind unrelated later branch commits', async () => {
    const f = await setup(); const p = await f.prepare(); const r = value(await f.service.confirm({ approvalId: p.approvalId }));
    f.conflict(false); f.visible(); expect(value(await f.service.check({ receiptId: r.receiptId })).status).toBe('published');
    expect(value(await f.service.prepare(f.source)).expectedHead).toBe('f'.repeat(40));
  });
  it.each(['expiry', 'disk-change', 'disconnect', 'extra-key'] as const)('rejects changed authority before writes: %s', async (kind) => {
    const f = await setup(); const p = await f.prepare();
    if (kind === 'expiry') f.expire();
    if (kind === 'disk-change') await writeFile(join(f.source.workspaceRoot, 'studio', 'app.js'), 'manual changes');
    if (kind === 'disconnect') value(await f.service.disconnect());
    const result = await f.service.confirm({ approvalId: p.approvalId, ...(kind === 'extra-key' ? { token: input.token } : {}) });
    expect(result.ok).toBe(false); expect(f.createCommit).not.toHaveBeenCalled(); expect(f.advance).not.toHaveBeenCalled();
  });
  it('keeps corrupt journal evidence and fails closed without reinitializing it', async () => {
    const f = await setup(); await f.prepare(); await writeFile(f.journalPath, '{broken');
    expect(await f.service.status()).toEqual({ ok: false, code: 'storage' });
    expect(await f.service.connect(input)).toEqual({ ok: false, code: 'storage' });
    expect(await readFile(f.journalPath, 'utf8')).toBe('{broken'); expect(f.createCommit).not.toHaveBeenCalled();
  });
  it.each(['intent', 'commit', 'publishing'] as const)('blocks branch writes if saving %s fails', async (stage) => {
    const f = await setup(); const p = await f.prepare(); let writes = 0;
    const realWrite = f.journal.write.bind(f.journal);
    vi.spyOn(f.journal, 'write').mockImplementation(async (s) => { writes++; if (writes === ({ intent: 1, commit: 2, publishing: 3 }[stage])) throw new Error('Disk full'); await realWrite(s); });
    expect(await f.service.confirm({ approvalId: p.approvalId })).toEqual({ ok: false, code: 'storage' });
    expect(f.advance).not.toHaveBeenCalled();
    if (stage === 'intent') expect(f.createCommit).not.toHaveBeenCalled();
    else {
      vi.restoreAllMocks(); const restart = createPublicationService(f.options); const r = value(await restart.status()).receipts[0];
      expect(value(await restart.check({ receiptId: r.receiptId })).status).toBe('not-published');
    }
  });
  it('keeps write-ahead intent if saving the remote result fails and recovers it read-only', async () => {
    const f = await setup(); const p = await f.prepare(); let writes = 0; const realWrite = f.journal.write.bind(f.journal);
    vi.spyOn(f.journal, 'write').mockImplementation(async (s) => { if (++writes === 4) throw new Error('Disk full'); await realWrite(s); });
    expect(await f.service.confirm({ approvalId: p.approvalId })).toEqual({ ok: false, code: 'storage' });
    vi.restoreAllMocks(); const restart = createPublicationService(f.options); const r = value(await restart.status()).receipts[0]; expect(r.status).toBe('unknown');
    f.visible(); expect(value(await restart.check({ receiptId: r.receiptId })).status).toBe('published'); expect(f.advance).toHaveBeenCalledTimes(1);
  });
  it('does not write when audit fails and does not queue duplicate approval clicks', async () => {
    const f = await setup(); const p = await f.prepare();
    vi.spyOn(f.options.audit, 'recordControl').mockRejectedValueOnce(new Error('Audit unavailable'));
    const running = f.service.confirm({ approvalId: p.approvalId });
    expect(await f.service.confirm({ approvalId: p.approvalId })).toEqual({ ok: false, code: 'busy' });
    expect(await running).toEqual({ ok: false, code: 'storage' }); expect(f.createCommit).not.toHaveBeenCalled();
  });
  it('restores previous public bytes as a newly approved child commit, leaving local revisions intact', async () => {
    const f = await setup(); f.visible(); const p = await f.prepare(); const first = value(await f.service.confirm({ approvalId: p.approvalId }));
    const second = await createInteractiveProject(f.roots, 'second', { ...spec, headline: 'New direction.' });
    const next = value(await f.service.prepare({ ...f.source, relativeEntryPath: 'second/index.html', revision: second.revision }));
    const latest = value(await f.service.confirm({ approvalId: next.approvalId })); expect(latest.canRollback).toBe(true);
    const rollback = value(await f.service.prepareRollback({ receiptId: latest.receiptId })); expect(rollback.operation).toBe('rollback'); expect(rollback.publicDigest).toBe(first.publicDigest);
    const restored = value(await f.service.confirm({ approvalId: rollback.approvalId })); expect(restored.previousCommit).toBe(latest.commit); expect(restored.commit).not.toBe(first.commit); expect(restored.status).toBe('published');
    expect(await readFile(join(f.source.workspaceRoot, 'second', 'index.html'), 'utf8')).toContain('New direction.');
  });
  it('requires protected storage and never falls back to plaintext', async () => {
    const f = await setup(); vi.spyOn(f.secrets, 'set').mockRejectedValue(new Error('DPAPI unavailable'));
    expect(await f.service.connect(input)).toEqual({ ok: false, code: 'storage' });
    expect(value(await f.service.status()).connection).toBeNull(); expect(f.createCommit).not.toHaveBeenCalled();
  });
});
