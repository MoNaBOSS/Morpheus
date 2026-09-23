import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

async function invoke(page: Page, action: string, payload?: unknown, module = 'morpheus') {
  return page.evaluate(async ({ action, payload, module }) => {
    const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module, action, payload });
    if (!response.ok) throw new Error(JSON.stringify(response));
    return response.data;
  }, { action, payload, module });
}

test.describe('Phase 3 task continuity', () => {
  test('keeps full and compact commands responsive during held planning and cancels only the named task', async ({ launchElectronApp }, testInfo) => {
    let requests = 0;
    // Local transport fixture, not an actual research result or a paid model.
    const server = createServer((request) => { requests += 1; request.resume(); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local provider unavailable');
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      const created = await invoke(page, 'createAccount', { account: {
        id: 'phase3-local', vendorId: 'lmstudio', label: 'Local held planning fixture',
        authMode: 'local', apiProtocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'fixture', enabled: true, isDefault: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } }, 'providers') as { success: boolean };
      expect(created.success).toBe(true);
      const research = await invoke(page, 'submitObjective', {
        objective: 'Research a better project direction', originType: 'command-bar',
      }) as { objectiveRunId: string; accepted: boolean };
      expect(research.accepted).toBe(true);
      await expect.poll(() => requests).toBe(1);
      await expect(page.getByTestId('morpheus-command-input')).toBeEnabled();
      await page.getByTestId('morpheus-command-input').fill('Show system information');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
      await page.getByTestId('workspace-tasks-button').click();
      await expect(page.getByTestId('workspace-task-list')).toContainText('Research a better project direction');
      await page.getByTestId('workspace-task-list').getByText('Research a better project direction').click();
      await expect(page.getByTestId('workspace-selected-task')).toContainText('Research a better project direction');
      await page.screenshot({ path: testInfo.outputPath('phase3-active-tasks.png') });
      await page.getByTestId('morpheus-command-input').fill('Stop talking');
      await page.getByTestId('morpheus-command-submit').click();
      const snapshot = await invoke(page, 'objectiveSnapshot') as { runsById: Record<string, { state: string }> };
      expect(snapshot.runsById[research.objectiveRunId].state).toBe('planning');
      await page.getByTestId('signal-nav-presence').click();
      await page.getByTestId('quick-command-input').fill('Show system information');
      await page.getByTestId('quick-command-submit').click();
      await expect(page.getByTestId('quick-command-objective-state')).toContainText(/complete/i);
      await page.getByTestId('quick-command-input').fill('Cancel research');
      await page.getByTestId('quick-command-submit').click();
      await expect.poll(async () => {
        const next = await invoke(page, 'objectiveSnapshot') as { runsById: Record<string, { state: string }> };
        return next.runsById[research.objectiveRunId].state;
      }).toBe('cancelled');
      await expect(page.getByTestId('quick-command-objective-state')).toContainText(/complete/i);
      expect(requests).toBe(1); // Direct commands and controls used no model calls.
    } finally {
      await closeElectronApp(app);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('restores a pending task after restart, then remembers its exact workspace approval', async ({ launchElectronApp }) => {
    let app = await launchElectronApp({ skipSetup: true });
    try {
      let page = await getStableWindow(app);
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await page.getByTestId('morpheus-command-input').fill('Create a text file named phase3-first.txt');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toBeVisible();
      const before = await invoke(page, 'objectiveSnapshot') as { activeObjectiveRunId: string };
      await closeElectronApp(app);
      app = await launchElectronApp({ skipSetup: true });
      page = await getStableWindow(app);
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toBeVisible();
      const after = await invoke(page, 'objectiveSnapshot') as { activeObjectiveRunId: string };
      expect(after.activeObjectiveRunId).toBe(before.activeObjectiveRunId);
      await page.getByRole('button', { name: 'Always do this without asking', exact: true }).click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
      const root = await invoke(page, 'filesRoot') as { path: string };
      await readFile(join(root.path, 'phase3-first.txt'), 'utf8');
      await closeElectronApp(app);
      app = await launchElectronApp({ skipSetup: true });
      page = await getStableWindow(app);
      await page.getByTestId('morpheus-command-input').fill('Create a text file named phase3-second.txt');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
      await readFile(join(root.path, 'phase3-second.txt'), 'utf8');
    } finally { await closeElectronApp(app); }
  });
});
