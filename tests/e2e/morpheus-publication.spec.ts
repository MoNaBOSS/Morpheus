import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import type { MorpheusAuditEntry } from '../../shared/morpheus/action-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type RemoteFixture = { head: string; files: Record<string, string>; pending: Record<string, string>; next: number; patches: number; visible: boolean; lose: boolean };
type FixtureGlobal = typeof globalThis & { publicationRemote: RemoteFixture };
const token = 'ghp_' + 's'.repeat(36);

/** Replace network bytes only in this isolated test process. The actual built
 * owner, protected vault, host routes, journal, adapter and HTTP verifier run. */
async function network(app: ElectronApplication, saved?: RemoteFixture) {
  await app.evaluate(({ app }, saved) => {
    const require = process.mainModule!.require.bind(process.mainModule);
    const https = require('node:https') as typeof import('node:https');
    const dns = require('node:dns/promises') as typeof import('node:dns/promises');
    const { EventEmitter } = require('node:events') as typeof import('node:events');
    const { Readable } = require('node:stream') as typeof import('node:stream');
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const state: RemoteFixture = saved ?? { head: '1'.repeat(40), files: {}, pending: {}, next: 3, patches: 0, visible: false, lose: false };
    (globalThis as FixtureGlobal).publicationRemote = state;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (resource, options) => {
      const url = String(resource);
      if (!url.startsWith('https://api.github.com/')) return originalFetch(resource, options);
      const path = new URL(url).pathname;
      const method = options?.method ?? 'GET';
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      const result = (object: unknown) => new Response(JSON.stringify(object), { status: 200 });
      const sha = (content: string) => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
      if (method === 'GET') {
        if (path === '/user') return result({ id: 7, login: 'MorpheusFixture' });
        if (path === '/repos/MorpheusFixture/studio') return result({ id: 52, full_name: 'MorpheusFixture/studio', private: false, permissions: { push: true }, default_branch: 'main' });
        if (path.endsWith('/pages')) return result({ source: { branch: 'gh-pages', path: '/' }, html_url: 'https://morpheusfixture.github.io/studio/', public: true, cname: null, build_type: 'legacy' });
        if (path.endsWith('/git/ref/heads/gh-pages')) return result({ ref: 'refs/heads/gh-pages', object: { type: 'commit', sha: state.head } });
        if (path.includes('/git/commits/')) return result({ sha: state.head, tree: { sha: '2'.repeat(40) } });
        if (path.endsWith(`/git/trees/${'2'.repeat(40)}`)) return result({ sha: '2'.repeat(40), tree: Object.keys(state.files).length ? [{ path: 'sites', type: 'tree', mode: '040000', sha: '5'.repeat(40) }] : [] });
        if (path.endsWith(`/git/trees/${'5'.repeat(40)}`)) return result({ sha: '5'.repeat(40), tree: [{ path: 'north', type: 'tree', mode: '040000', sha: '6'.repeat(40) }] });
        if (path.endsWith(`/git/trees/${'6'.repeat(40)}`)) return result({ sha: '6'.repeat(40), tree: Object.entries(state.files).map(([path, content]) => ({ path, sha: sha(content), mode: '100644', type: 'blob' })) });
      }
      if (method === 'POST' && path.endsWith('/git/trees')) { state.pending = Object.fromEntries(body.tree.map((f: { path: string; content: string }) => [f.path.split('/').at(-1), f.content])); return result({ sha: '8'.repeat(40) }); }
      if (method === 'POST' && path.endsWith('/git/commits')) return result({ sha: String(state.next++).padStart(40, '0') });
      if (method === 'PATCH' && path.endsWith('/git/refs/heads/gh-pages')) {
        const journal = JSON.parse(readFileSync(join(app.getPath('userData'), 'morpheus', 'publication', 'receipts.v1.json'), 'utf8'));
        if (journal.records.at(-1).receipt.status !== 'publishing' || journal.records.at(-1).receipt.commit !== body.sha || body.force !== false) throw new Error('Missing exact write-ahead intent');
        state.head = body.sha; state.files = state.pending; state.patches++;
        if (state.lose) throw new Error('Fixture lost response');
        return result({ ref: 'refs/heads/gh-pages', object: { sha: state.head } });
      }
      throw new Error('Unexpected fixture GitHub path');
    };
    const originalLookup = dns.lookup;
    dns.lookup = ((host: string, ...rest: unknown[]) => host === 'morpheusfixture.github.io' ? Promise.resolve([{ address: '93.184.216.34', family: 4 }]) : Reflect.apply(originalLookup, dns, [host, ...rest])) as typeof dns.lookup;
    const originalRequest = https.request;
    https.request = ((url: URL, opts: unknown, done: (response: import('node:http').IncomingMessage) => void) => {
      if (url.hostname !== 'morpheusfixture.github.io') return Reflect.apply(originalRequest, https, [url, opts, done]);
      const request = new EventEmitter() as import('node:http').ClientRequest;
      request.end = (() => {
        queueMicrotask(() => {
          const path = url.pathname.split('/').at(-1)!;
          const response = Readable.from([Buffer.from(state.visible ? state.files[path] ?? '' : 'Not deployed yet')]) as import('node:http').IncomingMessage;
          response.statusCode = state.visible ? 200 : 404;
          response.headers = { 'content-type': path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'application/json' };
          done(response);
        });
        return request;
      }) as typeof request.end;
      return request;
    }) as typeof https.request;
    (require('node:module') as typeof import('node:module')).syncBuiltinESMExports();
  }, saved);
}

for (const locale of ['en', 'zh', 'ja', 'ru']) {
test(`actual publication owner: connect, review, publish, verify and recover in ${locale}`, async ({ launchElectronApp, userDataDir }, testInfo) => {
  let app = await launchElectronApp({ skipSetup: true });
  try {
    await network(app);
    let page = await getStableWindow(app);
    const invoke = (action: string, payload?: unknown) => page.evaluate(async ({ action, payload }) => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action, payload });
      if (!response.ok) throw new Error(JSON.stringify(response.error)); return response.data;
    }, { action, payload });
    await page.evaluate(async (language) => { await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } }); }, locale);
    await page.reload();
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
    await invoke('setPermissionProfile', { profile: 'autonomous' });
    const { runId } = await invoke('requestAction', { actionId: 'site.createInteractive', params: { path: 'studio', specification: JSON.stringify({ template: 'studio-v1', title: 'North Studio', headline: 'Room for a better idea.', description: 'Independent design and development.', services: [{ title: 'Identity', category: 'Design', description: 'A clear start.' }], faqs: [] }) }, originType: 'quick-command' }) as { runId: string };
    await expect.poll(async () => {
      const { entries } = await invoke('auditRecent', { limit: 100 }) as { entries: MorpheusAuditEntry[] };
      return entries.find((e) => e.runId === runId && ['succeeded', 'failed', 'denied'].includes(e.phase))?.phase;
    }).toBe('succeeded');
    const publish = () => page.getByTestId('morpheus-publish-website').first();
    await publish().focus(); await publish().press('Enter');
    const dialog = () => page.getByTestId('publication-dialog');
    await expect(dialog()).toBeVisible();
    await page.getByTestId('publication-owner').fill('MorpheusFixture');
    await page.getByTestId('publication-repository').fill('studio');
    await page.getByTestId('publication-slug').fill('north');
    await page.getByTestId('publication-token').fill(token);
    await page.getByTestId('publication-connect').click();
    await expect(page.getByTestId('publication-prepare')).toBeEnabled();
    for (const element of [dialog(), page.getByTestId('publication-prepare')]) {
      expect(await element.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    }
    expect(await readFile(join(userDataDir, 'morpheus', 'publication', 'credentials.v1.json'), 'utf8')).not.toContain(token);
    await page.getByTestId('publication-prepare').click();
    await expect(page.getByTestId('publication-confirm')).toBeDisabled();
    await expect(dialog().locator('details')).toHaveCount(4);
    await dialog().locator('summary').filter({ hasText: /^index\.html/ }).click();
    await expect(dialog().locator('pre:visible')).toContainText('Room for a better idea.');
    await dialog().locator('details[open] summary').click();
    expect(await dialog().innerText()).not.toContain('morpheus.publication.');
    expect(await app.evaluate(() => (globalThis as FixtureGlobal).publicationRemote.patches)).toBe(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: testInfo.outputPath(`publication-review-${locale}.png`) });
    await page.getByTestId('publication-agree').check();
    if (locale === 'en') await app.evaluate(() => { (globalThis as FixtureGlobal).publicationRemote.lose = true; });
    await page.getByTestId('publication-confirm').click();
    await expect(page.getByTestId('publication-receipt')).toHaveAttribute('data-status', locale === 'en' ? 'unknown' : 'verifying');
    await expect(page.getByTestId('publication-open')).toHaveCount(0);
    if (locale === 'en') {
      const remote = await app.evaluate(() => (globalThis as FixtureGlobal).publicationRemote);
      await closeElectronApp(app); app = await launchElectronApp({ skipSetup: true }); await network(app, remote); page = await getStableWindow(app);
      await publish().click(); await expect(page.getByTestId('publication-receipt')).toHaveAttribute('data-status', 'unknown');
    }
    await app.evaluate(() => { (globalThis as FixtureGlobal).publicationRemote.visible = true; });
    await page.getByTestId('publication-check').click();
    await expect(page.getByTestId('publication-receipt')).toHaveAttribute('data-status', 'published');
    await expect(page.getByTestId('publication-open')).toBeVisible();
    expect(await app.evaluate(() => (globalThis as FixtureGlobal).publicationRemote.patches)).toBe(1);
    await page.screenshot({ path: testInfo.outputPath(`publication-receipt-${locale}.png`) });
    if (locale === 'en') {
      await page.keyboard.press('Escape');
      await app.evaluate(() => { (globalThis as FixtureGlobal).publicationRemote.lose = false; });
      const revised = await invoke('requestAction', { actionId: 'site.createInteractive', params: { path: 'studio-two', specification: JSON.stringify({ template: 'studio-v1', title: 'North Studio', headline: 'A new chapter.', description: 'Independent design and development.', services: [{ title: 'Identity', category: 'Design', description: 'A clear start.' }], faqs: [] }) }, originType: 'quick-command' }) as { runId: string };
      await expect.poll(async () => {
        const { entries } = await invoke('auditRecent', { limit: 100 }) as { entries: MorpheusAuditEntry[] };
        return entries.find((e) => e.runId === revised.runId && ['succeeded', 'failed', 'denied'].includes(e.phase))?.phase;
      }).toBe('succeeded');
      await publish().click(); await page.getByTestId('publication-prepare').click();
      await page.getByTestId('publication-agree').check(); await page.getByTestId('publication-confirm').click();
      await expect(page.getByTestId('publication-receipt')).toHaveAttribute('data-status', 'published');
      await page.getByTestId('publication-rollback').click();
      await expect(dialog()).toContainText('Restore the previous website?');
      await page.getByTestId('publication-agree').check(); await page.getByTestId('publication-confirm').click();
      await expect(page.getByTestId('publication-receipt')).toHaveAttribute('data-status', 'published');
      expect(await app.evaluate(() => (globalThis as FixtureGlobal).publicationRemote.files['index.html'])).toContain('Room for a better idea.');
      expect(await app.evaluate(() => (globalThis as FixtureGlobal).publicationRemote.patches)).toBe(3);
      await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes('Morpheus'))!; window.setMinimumSize(380, 500); window.setContentSize(430, 740); });
      await expect(dialog()).toBeVisible();
      expect(await dialog().evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('publication-compact.png') });
    }
    await page.getByTestId('publication-disconnect').click();
    await expect(page.getByTestId('publication-token')).toHaveValue('');
    await page.keyboard.press('Escape'); await expect(dialog()).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});
}
