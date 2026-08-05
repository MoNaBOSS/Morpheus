import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type AuditEntry = {
  v: number;
  seq: number;
  ts: string;
  runId: string;
  actionId: string;
  phase: string;
  decision?: string;
  params?: Record<string, unknown>;
  appVersion: string;
};

function readAuditEntries(userDataDir: string): AuditEntry[] {
  const auditDir = join(userDataDir, 'morpheus', 'audit');
  const files = readdirSync(auditDir).filter((name) => name.endsWith('.jsonl'));
  return files.flatMap((name) => readFileSync(join(auditDir, name), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AuditEntry));
}

test.describe('Morpheus audit log', () => {
  test('records every real phase and never persists file content', async ({
    launchElectronApp,
    userDataDir,
  }) => {
    const secret = 'SENSITIVE-AUDIT-PAYLOAD-DO-NOT-STORE';
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();
      await page.getByTestId('sidebar-nav-dashboard').click();
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      // One allowed run…
      await page.getByTestId('morpheus-file-name-input').fill('audited.txt');
      await page.getByTestId('morpheus-file-content-input').fill(secret);
      await page.getByTestId('morpheus-run-action-file.createText').click();
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible();
      await page.getByTestId('morpheus-permission-allow').click();
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'succeeded', { timeout: 15_000 });

      // …and one denied run.
      await page.getByTestId('morpheus-run-action-system.report').click();
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible();
      await page.getByTestId('morpheus-permission-deny').click();
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'denied');

      // The panel projects the durable log.
      await expect(page.getByTestId('morpheus-audit-entry').first()).toBeVisible();

      const entries = readAuditEntries(userDataDir);
      expect(entries.length).toBeGreaterThanOrEqual(7);

      // Schema.
      for (const entry of entries) {
        expect(entry.v).toBe(1);
        expect(typeof entry.seq).toBe('number');
        expect(typeof entry.runId).toBe('string');
        expect(typeof entry.appVersion).toBe('string');
        expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
      }

      // Monotonic sequence, in file order.
      const sequences = entries.map((entry) => entry.seq);
      expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);

      // Both lifecycles are present, in full.
      const phasesFor = (actionId: string) => entries
        .filter((entry) => entry.actionId === actionId)
        .map((entry) => entry.phase);
      expect(phasesFor('file.createText')).toEqual([
        'requested', 'awaiting-permission', 'running', 'succeeded',
      ]);
      expect(phasesFor('system.report')).toEqual([
        'requested', 'awaiting-permission', 'denied',
      ]);

      // Decisions are recorded.
      expect(entries.some((entry) => entry.decision === 'granted')).toBe(true);
      expect(entries.some((entry) => entry.decision === 'denied')).toBe(true);

      // THE invariant: content is never persisted, only its size and digest.
      const raw = JSON.stringify(entries);
      expect(raw).not.toContain(secret);
      const writeEntry = entries.find((entry) => entry.actionId === 'file.createText');
      expect(writeEntry?.params?.fileName).toBe('audited.txt');
      expect(writeEntry?.params?.contentBytes).toBe(secret.length);
      expect(String(writeEntry?.params?.contentSha256)).toMatch(/^[0-9a-f]{16}$/);
      expect(writeEntry?.params).not.toHaveProperty('content');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('audits a denied run before the interface reports it', async ({
    launchElectronApp,
    userDataDir,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();
      await page.getByTestId('sidebar-nav-dashboard').click();
      await page.getByTestId('morpheus-run-action-system.report').click();
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible();
      await page.getByTestId('morpheus-permission-deny').click();
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'denied');

      // The interface has shown 'denied', so by the ordering guarantee the
      // record must already be durable on disk.
      const entries = readAuditEntries(userDataDir);
      expect(entries.some((entry) => entry.phase === 'denied')).toBe(true);
    } finally {
      await closeElectronApp(app);
    }
  });
});
