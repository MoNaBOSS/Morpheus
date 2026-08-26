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
  test('activates once from real system signals and enters the Command Center', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({
      skipSetup: true,
      additionalArgs: ['--morpheus-boot=on', '--morpheus-onboarding=on'],
    });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.getByTestId('morpheus-boot')).toHaveAttribute('data-arrival-mode', 'first-run');
      await captureVisualEvidence(page, 'arrival-boot-1280x800.png');
      await expect(page.getByTestId('morpheus-activation')).toHaveAttribute('data-stage', 'intro');
      await expect(page.getByTestId('morpheus-activation')).toHaveCSS('background-image', /linear-gradient/);
      const activationBox = await page.getByTestId('morpheus-activation').boundingBox();
      expect(activationBox).toMatchObject({ x: 0, y: 0, width: 1280, height: 800 });
      await captureVisualEvidence(page, 'activation-greeting-1280x800.png');
      await page.getByTestId('activation-intro-name').fill('Larry');
      await page.getByTestId('morpheus-activation-begin').click();
      await expect(page.getByTestId('activation-signal-core')).toHaveAttribute('data-available', 'true');
      await expect(page.getByTestId('activation-signal-provider')).toHaveAttribute('data-available', 'false');
      await expect(page.getByTestId('activation-voice-start')).toBeDisabled();
      await captureVisualEvidence(page, 'activation-voice-calibration-1280x800.png');
      await page.getByTestId('morpheus-activation-continue').click();
      await expect(page.getByTestId('activation-preferred-name')).toHaveValue('Larry');
      await page.getByTestId('activation-personality-warm').click();
      await expect(page.getByTestId('morpheus-activation-preferences').getByTestId('morpheus-mode-auto')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('activation-permission-autonomous')).toHaveAttribute('data-selected', 'true');
      await expect(page.getByTestId('activation-ambient-voice')).toBeDisabled();
      await page.getByTestId('morpheus-activation-finish').click();
      await expect(page.getByTestId('morpheus-activation-proof')).toBeVisible();
      await page.getByTestId('morpheus-activation-skip-proof').click();
      await expect(page.getByTestId('morpheus-activation-ready')).toBeVisible();
      await expect(page.getByTestId('morpheus-activation-connect-provider')).toBeVisible();
      await captureVisualEvidence(page, 'activation-ready-1280x800.png');
      await page.getByTestId('morpheus-activation-enter').click();
      await expect(page.getByTestId('morpheus-activation')).toHaveAttribute('data-exiting', 'true');
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await page.reload();
      await expect(page.getByTestId('morpheus-boot')).toHaveAttribute('data-arrival-mode', 'returning');
      await expect(page.getByTestId('morpheus-boot')).toContainText('Larry');
      await captureVisualEvidence(page, 'arrival-returning-1280x800.png');
      await expect(page.getByTestId('morpheus-boot')).toHaveCount(0);
      await expect(page.getByTestId('morpheus-activation')).toHaveCount(0);
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
      await page.getByTestId('signal-nav-missions').click();
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
      await page.getByTestId('signal-nav-library').click();
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
      await expect(page.getByTestId('quick-command-route')).toContainText(/direct capability/i);
      await page.getByTestId('quick-command-expand').click();
      await expect(page.getByTestId('command-center-page')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
