import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type AuditEntry = {
  v: number;
  seq: number;
  ts: string;
  runId?: string;
  actionId?: string;
  phase?: string;
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
      await expect(page.getByTestId('command-center-page')).toBeVisible();

      // One allowed run…
      await page.getByTestId('morpheus-command-input').fill(`Create a text file named audited.txt saying "${secret}"`);
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-plan-consent-allow-once').click();
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'succeeded', { timeout: 15_000 });

      // …and one denied run. app.launch is medium risk, so it always prompts
      // the first time even under Balanced.
      await page.getByTestId('morpheus-command-input').fill('Open Notepad');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-plan-consent-deny').click();
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'denied');

      // The panel projects the durable log.
      

      const entries = readAuditEntries(userDataDir);
      expect(entries.length).toBeGreaterThanOrEqual(6);

      // Schema.
      for (const entry of entries) {
        expect(entry.v).toBe(1);
        expect(typeof entry.seq).toBe('number');
        expect(typeof entry.appVersion).toBe('string');
        expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
      }

      const actionEntries = entries.filter((entry) => entry.actionId !== undefined);
      for (const entry of actionEntries) {
        expect(typeof entry.runId).toBe('string');
        expect(typeof entry.actionId).toBe('string');
        expect(typeof entry.phase).toBe('string');
      }

      // Monotonic sequence, in file order.
      // Action event sequence is the per-process Renderer ordering key. Control
      // records (objective, workspace, runtime, etc.) have an independent
      // category sequence and may be interleaved in the append-only file.
      const sequences = actionEntries.map((entry) => entry.seq);
      expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);

      // Both lifecycles are present, in full.
      //
      // `awaiting-permission` now comes FIRST: a command-bar objective becomes a
      // plan, and consent is sought for the whole plan before any run exists. A
      // refused step therefore never becomes a `requested` run at all — it is
      // recorded as `denied` and nothing executes.
      const phasesFor = (actionId: string) => actionEntries
        .filter((entry) => entry.actionId === actionId)
        .map((entry) => entry.phase);
      expect(phasesFor('file.createText')).toEqual([
        'awaiting-permission', 'requested', 'running', 'succeeded',
      ]);
      expect(phasesFor('app.launch')).toEqual([
        'awaiting-permission', 'denied',
      ]);

      // Decisions are recorded.
      expect(actionEntries.some((entry) => entry.decision === 'granted')).toBe(true);
      expect(actionEntries.some((entry) => entry.decision === 'denied')).toBe(true);

      // THE invariant: content is never persisted, only its size and digest.
      const raw = JSON.stringify(entries);
      expect(raw).not.toContain(secret);
      const writeEntry = actionEntries.find((entry) => entry.actionId === 'file.createText');
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
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await page.getByTestId('morpheus-command-input').fill('Open Notepad');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-plan-consent-deny').click();
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
