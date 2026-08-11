import type { Page } from '@playwright/test';

import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

async function openCommandCenter(page: Page): Promise<void> {
  await expect(page.getByTestId('command-center-page')).toBeVisible();
}

async function runCommand(page: Page, objective: string): Promise<void> {
  await page.getByTestId('morpheus-command-input').fill(objective);
  await page.getByTestId('morpheus-command-submit').click();
}

test.describe('Morpheus 0.5 foundation', () => {
  test('keeps Command Center, builder, activity and OpenClaw chat as distinct reachable surfaces', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      for (const [navId, pageId] of [
        ['sidebar-nav-agent-profiles', 'agent-profiles-page'],
        ['sidebar-nav-workflows', 'workflows-page'],
        ['sidebar-nav-schedules', 'schedules-page'],
        ['sidebar-nav-activity', 'activity-page'],
        ['sidebar-nav-chat', 'chat-page'],
      ] as const) {
        await page.getByTestId(navId).click();
        await expect(page.getByTestId(pageId)).toBeVisible({ timeout: 20_000 });
      }

      expect(page.url()).toContain('#/chat');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('Quick Command executes through the same real plan pipeline', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await page.getByTestId('sidebar-quick-command').click();
      const quickCommand = page.getByTestId('morpheus-quick-command');
      await expect(quickCommand).toBeVisible();
      await expect(quickCommand.getByTestId('morpheus-objective-context')).toBeVisible();
      await expect(quickCommand.getByTestId('morpheus-workspace-select')).toBeVisible();
      await expect(quickCommand.getByTestId('morpheus-agent-profile-select')).toHaveValue('');
      await expect(page.getByTestId('quick-command-input')).toBeFocused();
      await page.getByTestId('quick-command-input').fill('Show system information');
      await page.getByTestId('quick-command-submit').click();

      await expect(page.getByTestId('quick-command-status')).toContainText(/complete/i, {
        timeout: 20_000,
      });
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
      await page.getByTestId('quick-command-close').click();
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'succeeded');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('keeps ordinary OpenClaw send separate from explicit Chat execution through Morpheus Core', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', gatewayReady: true, port: 18789, pid: 12345 },
      });
      const page = await getStableWindow(app);
      await page.reload();
      await openCommandCenter(page);
      await page.getByTestId('sidebar-nav-chat').click();
      await expect(page.getByTestId('chat-page')).toBeVisible({ timeout: 20_000 });
      const input = page.getByTestId('chat-composer-input');
      await expect(input).toBeEnabled({ timeout: 30_000 });
      await input.fill('Show system information');
      await expect(page.getByTestId('chat-composer-send')).toBeEnabled();
      await page.getByTestId('chat-composer-morpheus-execute').click();
      await expect(input).toHaveValue('');

      await page.getByTestId('sidebar-nav-command-center').click();
      await expect(page.getByTestId('plan-status')).toContainText(/completed/i, { timeout: 20_000 });
      await expect(page.getByTestId('morpheus-run-card').first()).toHaveAttribute('data-phase', 'succeeded');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('runs a real sequential workflow and a Morpheus-owned schedule', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await page.getByTestId('sidebar-nav-workflows').click();
      await expect(page.getByTestId('workflow-system-brief')).toBeVisible();
      const workflowRun = page.getByTestId('workflow-run-system-brief');
      await workflowRun.click();
      await expect(workflowRun).toBeEnabled({ timeout: 20_000 });

      await page.getByTestId('sidebar-nav-command-center').click();
      await expect(page.getByTestId('plan-status')).toContainText(/completed/i);
      const workflowSteps = page.getByTestId('plan-timeline').locator('li');
      await expect(workflowSteps).toHaveCount(2);
      await expect(workflowSteps.nth(0)).toHaveAttribute('data-status', 'succeeded');
      await expect(workflowSteps.nth(1)).toHaveAttribute('data-status', 'succeeded');

      await page.getByTestId('sidebar-nav-schedules').click();
      await page.getByTestId('schedule-name').fill('Foundation system brief');
      await page.getByTestId('schedule-workflow').selectOption('system-brief');
      await page.getByTestId('schedule-trigger').selectOption('interval');
      await page.getByTestId('schedule-trigger-value').fill('60');
      await page.getByTestId('schedule-save').click();

      const schedule = page.getByTestId('schedules-list').locator('li')
        .filter({ hasText: 'Foundation system brief' });
      await expect(schedule).toBeVisible();
      await schedule.getByRole('button', { name: /run now/i }).click();
      await expect(schedule.locator('[data-tone="ok"]')).toBeVisible({ timeout: 20_000 });

      await page.getByTestId('sidebar-nav-activity').click();
      await expect(page.getByTestId('activity-entry').first()).toBeVisible({ timeout: 20_000 });
    } finally {
      await closeElectronApp(app);
    }
  });

  test('authors Agent Profiles, typed workflows and workspace-bound schedules through Main APIs', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await page.getByTestId('sidebar-nav-agent-profiles').click();
      await page.getByTestId('agent-profile-create').click();
      await expect(page.getByTestId('agent-profile-editor')).toBeVisible();
      await page.getByTestId('agent-profile-name').fill('Verification Operator');
      await page.getByTestId('agent-profile-description').fill('A bounded verification profile.');
      await page.getByTestId('agent-profile-instructions').fill('Verify the requested objective and report only real results.');
      await page.getByTestId('agent-profile-save').click();
      await expect(page.getByTestId('agent-profile-editor')).toHaveCount(0);
      await expect(page.getByText('Verification Operator', { exact: true })).toBeVisible();

      await page.getByTestId('sidebar-nav-workflows').click();
      await page.getByTestId('workflow-create').click();
      await expect(page.getByTestId('workflow-editor')).toBeVisible();
      await page.getByTestId('workflow-name').fill('Verification system brief');
      await page.getByTestId('workflow-description').fill('Produces a real privacy-safe system report.');
      await page.getByTestId('workflow-agent-profile').selectOption({ label: 'Verification Operator' });
      await page.getByTestId('workflow-trigger-schedule').check();
      await page.getByTestId('workflow-save').click();
      await expect(page.getByTestId('workflow-editor')).toHaveCount(0);

      const workflowCard = page.locator('[data-testid^="workflow-"]').filter({ hasText: 'Verification system brief' }).first();
      await expect(workflowCard).toBeVisible();
      await workflowCard.getByRole('button', { name: /run workflow/i }).click();
      await page.getByTestId('sidebar-nav-command-center').click();
      await expect(page.getByTestId('plan-status')).toContainText(/completed/i, { timeout: 20_000 });
      await expect(page.getByTestId('morpheus-workspace-control')).toBeVisible();

      await page.getByTestId('sidebar-nav-schedules').click();
      await page.getByTestId('schedule-name').fill('Verification every hour');
      await page.getByTestId('schedule-workflow').selectOption({ label: 'Verification system brief' });
      await expect(page.getByTestId('schedule-workspace')).not.toHaveValue('');
      await page.getByTestId('schedule-trigger').selectOption('interval');
      await page.getByTestId('schedule-trigger-value').fill('60');
      await page.getByTestId('schedule-save').click();

      const schedule = page.getByTestId('schedules-list').locator('li')
        .filter({ hasText: 'Verification every hour' });
      await expect(schedule).toBeVisible();
      await schedule.getByRole('button', { name: /run now/i }).click();
      await expect(schedule.locator('[data-testid^="schedule-objective-"]')).toBeVisible({ timeout: 20_000 });
      await expect(schedule).toContainText(/completed/i);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('reconstructs durable artifacts from the privacy-safe audit ledger after restart', async ({
    launchElectronApp,
  }) => {
    const first = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(first);
      await openCommandCenter(page);
      await runCommand(page, 'Show system information');
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });
      await expect(page.getByTestId('morpheus-artifact').first()).toHaveAttribute('data-kind', 'report');
    } finally {
      await closeElectronApp(first);
    }

    const second = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(second);
      await openCommandCenter(page);
      const artifact = page.getByTestId('morpheus-artifact').first();
      await expect(artifact).toBeVisible({ timeout: 20_000 });
      await expect(artifact).toHaveAttribute('data-kind', 'report');
      await expect(artifact).toContainText(/win32/i);
    } finally {
      await closeElectronApp(second);
    }
  });
});
