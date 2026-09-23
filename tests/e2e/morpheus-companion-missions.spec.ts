import { join } from 'node:path';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

const visualEvidenceDir = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR?.trim();

async function captureVisualEvidence(
  page: Awaited<ReturnType<typeof getStableWindow>>,
  fileName: string,
): Promise<void> {
  if (!visualEvidenceDir) return;
  await page.screenshot({
    path: join(visualEvidenceDir, fileName),
    animations: 'disabled',
  });
}

test.describe('Morpheus companion and persistent Missions', () => {
  test('keeps first launch simple, saves the companion profile, and avoids a quick-restart greeting', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({
      skipSetup: true,
      additionalArgs: ['--morpheus-boot=on', '--morpheus-onboarding=on'],
    });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.getByTestId('morpheus-boot')).toHaveAttribute('data-arrival-mode', 'first-run');
      await captureVisualEvidence(page, 'arrival-boot-1280x800.png');
      await expect(page.getByTestId('morpheus-activation')).toHaveAttribute('data-stage', 'name');
      const activationBox = await page.getByTestId('morpheus-activation').boundingBox();
      expect(activationBox).toMatchObject({ x: 0, y: 0, width: 1280, height: 800 });
      await expect(page.getByTestId('morpheus-activation').getByTestId('morpheus-fluid-orb')).toBeVisible();
      await page.evaluate(() => window.clawx.hostInvoke({
        id: crypto.randomUUID(), module: 'morpheus', action: 'setVoiceSpeaking', payload: { speaking: true },
      }));
      await expect(page.getByTestId('morpheus-voice-indicator')).toHaveCount(0);
      await page.evaluate(() => window.clawx.hostInvoke({
        id: crypto.randomUUID(), module: 'morpheus', action: 'setVoiceSpeaking', payload: { speaking: false },
      }));
      await captureVisualEvidence(page, 'activation-greeting-1280x800.png');
      await page.getByTestId('activation-intro-name').fill('Larry');
      await page.getByTestId('morpheus-activation-begin').click();
      await expect(page.getByTestId('morpheus-activation-welcome')).toContainText('Larry');
      await captureVisualEvidence(page, 'activation-welcome-1280x800.png');
      await expect(page.getByTestId('activation-suggestions')).toBeVisible({ timeout: 12_000 });
      await page.getByTestId('morpheus-activation-personalize').click();
      await page.getByTestId('activation-interests').fill('Anime and film');
      await page.getByTestId('activation-humor-gentle').click();
      await expect(page.getByTestId('morpheus-activation-preferences').getByText('Ask', { exact: true })).toHaveCount(0);
      await expect(page.getByTestId('activation-permission-balanced')).toHaveCount(0);
      await expect(page.getByTestId('activation-voice-preview-1')).toBeDisabled();
      await page.getByTestId('morpheus-activation-finish').click();
      await expect(page.getByTestId('morpheus-activation-ready')).toBeVisible();
      await captureVisualEvidence(page, 'activation-ready-1280x800.png');
      await page.getByTestId('morpheus-activation-enter').click();
      await expect(page.getByTestId('morpheus-activation')).toHaveCount(0);
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await page.getByTestId('sidebar-nav-settings').click();
      await page.getByTestId('settings-edit-companion-profile').click();
      await page.getByTestId('settings-companion-interests').fill('One Piece');
      await page.getByTestId('settings-save-companion-profile').click();
      await expect(page.getByTestId('settings-companion-profile')).toHaveCount(0);
      await page.getByTestId('settings-replay-activation').click();
      await expect(page.getByTestId('morpheus-intro-preview')).toContainText('Larry');
      await page.getByTestId('morpheus-intro-preview-close').click();
      await expect(page.getByTestId('morpheus-intro-preview')).toHaveCount(0);
      const saved = await page.evaluate(async () => {
        const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'onboardingStatus' });
        if (!response.ok) throw new Error('Companion profile unavailable');
        return response.data;
      });
      expect(saved).toMatchObject({ completed: true, preferences: { interests: 'One Piece', preferredName: 'Larry' } });
      await page.reload();
      await expect(page.getByTestId('morpheus-boot')).toHaveAttribute('data-arrival-mode', 'returning');
      await expect(page.getByTestId('morpheus-boot')).toContainText('Larry');
      await captureVisualEvidence(page, 'arrival-returning-1280x800.png');
      await expect(page.getByTestId('morpheus-boot')).toHaveCount(0);
      await expect(page.getByTestId('morpheus-activation')).toHaveCount(0);
      await expect(page.getByTestId('morpheus-welcome')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('routes a known objective directly and projects it into a durable Mission', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByTestId('morpheus-command-input').fill('Show system information');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
      await captureVisualEvidence(page, 'command-center-mission-1280x800.png');
      await page.getByTestId('signal-nav-advanced').click();
      await page.getByTestId('sidebar-nav-missions').click();
      await expect(page.getByTestId('missions-page')).toBeVisible();
      await expect(page.getByTestId('mission-detail')).toContainText('Show system information');
      await expect(page.getByTestId('mission-route')).toContainText(/direct capability/i);
      await expect(page.getByTestId('mission-detail-status')).toContainText(/completed/i);
      await captureVisualEvidence(page, 'mission-history-1280x800.png');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('creates inspectable Project context and explicit memory without renderer paths', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('signal-nav-advanced').click();
      await page.getByTestId('sidebar-nav-projects').click();
      await expect(page.getByTestId('projects-page')).toBeVisible();
      await expect(page.getByTestId('project-list-item-personal')).toBeVisible();

      await page.getByTestId('project-create').click();
      await page.getByTestId('project-name').fill('Client Launch');
      await page.getByTestId('project-description').fill('Launch context for the client project.');
      await page.getByTestId('project-instructions').fill('Prefer concise plans and keep artifacts in the trusted workspace.');
      await page.getByTestId('project-save').click();
      await expect(page.getByTestId('project-editor')).toContainText('Client Launch');

      await page.getByTestId('memory-title').fill('Communication style');
      await page.getByTestId('memory-text').fill('Use concise status updates.');
      await page.getByTestId('memory-save').click();
      await expect(page.getByTestId('project-memory')).toContainText('Communication style');
      await expect(page.getByTestId('project-memory')).toContainText('Use concise status updates.');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('Quick Command uses the same real Objective Core and can expand to home', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', 'overlay');
      await captureVisualEvidence(page, 'quick-command-overlay.png');
      await page.getByTestId('quick-command-input').fill('Show system information');
      await page.getByTestId('quick-command-submit').click();
      await expect(page.getByTestId('quick-command-objective-state')).toContainText(/complete/i);
      await expect(page.getByTestId('quick-command-objective-state')).toContainText(/complete/i);
      await page.getByTestId('quick-command-expand').click();
      await expect(page.getByTestId('command-center-page')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
