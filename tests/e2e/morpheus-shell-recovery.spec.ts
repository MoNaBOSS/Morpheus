import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { ElectronApplication, Locator, Page, TestInfo } from '@playwright/test';
import type { MorpheusVoicePresence, MorpheusVoiceStatus } from '../../shared/morpheus/voice-types';
import {
  closeElectronApp, expect, getRecordedHostInvocations, getStableWindow,
  installAttachmentHostFixture, installIpcMocks, test,
} from './fixtures/electron';

// The flow under test is: wake-enabled conversation -> visible Settings ->
// previous Advanced settings -> conversation, then compact -> Voice -> compact.
// These are real Electron layouts and interactions with simulated Main voice
// presence. No physical microphone, wake recognition, provider or audibility
// acceptance is implied. Browser plugin not available; use the existing Electron
// Playwright workflow and save evidence outside source with --output.
const forbiddenVoiceWork = [
  'beginAmbientVoice', 'transcribeAudio', 'transcribeAmbientAudio',
  'synthesizeSpeech', 'startSpeechStream',
];

async function protectPhysicalMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const globals = window as unknown as { shellPhysicalMicrophoneRequests: number };
    globals.shellPhysicalMicrophoneRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        globals.shellPhysicalMicrophoneRequests += 1;
        throw new DOMException('Requested device not found', 'NotFoundError');
      },
    });
  });
}

async function installVoicePresentation(app: ElectronApplication, page: Page, ambient: boolean): Promise<void> {
  const status = await page.evaluate(async () => {
    const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
    if (!response.ok) throw new Error('Voice status unavailable');
    return response.data as MorpheusVoiceStatus;
  });
  await protectPhysicalMicrophone(page);
  await installIpcMocks(app, {
    recordHostInvocations: true,
    hostApi: { [JSON.stringify(['morpheus', 'voiceStatus', null])]: {
      ...status,
      settings: {
        ...status.settings, enabled: true, localWakeEnabled: true,
        ambientEnabled: ambient, autoSubmitTranscript: false, speakResponses: false,
      },
      // Armed layout is possible without starting real ambient capture. The
      // explicit-error journey permits only the synthetic missing-device result.
      transcriptionAvailable: !ambient,
      neuralSpeechAvailable: false,
      presence: { v: 1, state: ambient ? 'armed' : 'asleep', ambientEnabled: ambient, wakeSequence: 0 },
    } },
  });
}

async function emitVoicePresence(app: ElectronApplication, state: MorpheusVoicePresence['state']): Promise<void> {
  await app.evaluate(({ BrowserWindow }, nextState) => {
    const main = BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus');
    if (!main) throw new Error('Main window missing');
    main.webContents.send('morpheus:voice-presence', {
      v: 1, state: nextState, ambientEnabled: true, wakeSequence: 0,
    });
  }, state);
}

async function expectUncovered(control: Locator, indicator: Locator): Promise<void> {
  await expect(control).toBeVisible();
  await expect(control).toBeInViewport();
  await expect.poll(async () => {
    const [button, badge] = await Promise.all([control.boundingBox(), indicator.boundingBox()]);
    if (!button || !badge) return false;
    return button.x + button.width <= badge.x || badge.x + badge.width <= button.x
      || button.y + button.height <= badge.y || badge.y + badge.height <= button.y;
  }, { message: 'Voice status must not intersect the control' }).toBe(true);
  await expect.poll(() => control.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && (node === hit || node.contains(hit));
  }), { message: 'The visible control must receive pointer input' }).toBe(true);
}

async function expectShellNavigation(page: Page, indicator: Locator): Promise<void> {
  await expect(indicator).toBeVisible();
  await expect(page.getByTestId('sidebar-nav-settings')).toHaveText(/Settings/);
  for (const id of ['sidebar-nav-settings', 'signal-nav-chat', 'signal-nav-presence', 'signal-nav-advanced']) {
    await expectUncovered(page.getByTestId(id), indicator);
  }
  await expect(page.getByTestId('morpheus-command-input')).toBeInViewport();
  expect(await page.getByTestId('command-center-page').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

function recordErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function attachScope(info: TestInfo, page: Page, errors: string[]): Promise<void> {
  await expect(page).toHaveTitle('Morpheus');
  await expect(page.locator('vite-error-overlay, nextjs-portal')).toHaveCount(0);
  const evidencePath = info.outputPath('shell-qualification-boundary.json');
  await writeFile(evidencePath, JSON.stringify({
    url: page.url(), viewport: page.viewportSize(),
    scope: 'Real rendered Electron shell, simulated voice presence and conversation replies; first journey also executes the real local Core system-information action. No physical microphone or provider qualification.',
    viewportScope: 'Full-window width checks use Chromium viewport emulation; compact uses the native Windows surface.',
    errors,
  }, null, 2));
  await info.attach('shell-qualification-boundary', { path: evidencePath, contentType: 'application/json' });
  expect(errors, 'No uncaught renderer or console errors in this interaction').toEqual([]);
}

function saveVideoOnClose(page: Page, name: string): (() => Promise<void>) | undefined {
  const directory = process.env.MORPHEUS_VIDEO_EVIDENCE_DIR;
  const video = page.video();
  return directory && video ? () => video.saveAs(join(directory, name)) : undefined;
}

test('wake-enabled full shell keeps navigation aligned and previous settings reachable', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  let saveVideo: (() => Promise<void>) | undefined;
  try {
    const fixture = await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Shell recovery conversation' }] });
    await fixture.setPromptUpdates('Hello there', [{ sessionUpdate: 'agent_message_chunk', messageId: 'shell-recovery-reply', content: { type: 'text', text: 'Your conversation is still here.' } }]);
    const page = await getStableWindow(app);
    const errors = recordErrors(page);
    saveVideo = saveVideoOnClose(page, 'shell-recovery-wake-enabled.webm');
    await installVoicePresentation(app, page, true);
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    const indicator = page.getByTestId('morpheus-ambient-voice-indicator');
    await expectShellNavigation(page, indicator);
    await page.getByTestId('morpheus-command-input').fill('Hello there');
    await page.getByTestId('morpheus-command-submit').click();
    await expect(page.getByTestId('workspace-conversation')).toContainText('Your conversation is still here.');
    const composer = page.getByTestId('morpheus-command-bar');
    const userMessage = page.getByTestId('morpheus-conversation-user').last();
    const assistantMessage = page.getByTestId('morpheus-conversation-assistant').last();
    const alignment = await Promise.all([composer.boundingBox(), userMessage.boundingBox(), assistantMessage.boundingBox()]);
    expect(alignment.every(Boolean)).toBe(true);
    expect(Math.abs(alignment[0]!.x + alignment[0]!.width - alignment[1]!.x - alignment[1]!.width), 'User message and composer share the right rail').toBeLessThanOrEqual(1);
    expect(Math.abs(alignment[0]!.x - alignment[2]!.x), 'Reply and composer share the left rail').toBeLessThanOrEqual(1);
    await page.getByTestId('morpheus-command-input').fill('Keep my unfinished request');
    await page.screenshot({ path: info.outputPath('wake-enabled-aligned-conversation.png') });

    for (const width of [640, 320]) {
      await page.setViewportSize({ width, height: 720 });
      await expectShellNavigation(page, indicator);
      await page.getByTestId('signal-nav-chat').click();
      await expect(page.getByTestId('morpheus-conversation-history')).toBeVisible();
      await page.getByTestId('signal-nav-chat').click();
      await page.screenshot({ path: info.outputPath(`wake-enabled-${width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTestId('sidebar-nav-settings').click();
    await expect(page.getByTestId('morpheus-settings-page')).toBeVisible();
    await expectUncovered(page.getByTestId('morpheus-settings-return'), indicator);
    await page.getByTestId('morpheus-settings-advanced').click();
    await page.getByTestId('morpheus-advanced-settings').click();
    await expect(page.getByTestId('morpheus-advanced-settings-return')).toBeVisible();
    await expectUncovered(page.getByTestId('morpheus-advanced-settings-return'), indicator);
    await page.getByTestId('morpheus-advanced-settings-return').click();
    await expect(page.getByTestId('morpheus-settings-advanced')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('morpheus-settings-return').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Keep my unfinished request');
    await expect(page.getByTestId('workspace-conversation')).toContainText('Your conversation is still here.');

    // Exercise an existing non-chat capability through the real local Core,
    // including its result and shared conversation presentation. No model call.
    await page.getByTestId('morpheus-command-input').fill('Show system information');
    await page.getByTestId('morpheus-command-submit').click();
    await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
    await expect(page.getByTestId('workspace-result')).toBeVisible();
    await expectShellNavigation(page, indicator);
    const taskAlignment = await Promise.all([
      composer.boundingBox(), page.getByTestId('workspace-selected-task').boundingBox(),
      page.getByTestId('command-center-objective-summary').locator('..').boundingBox(),
    ]);
    expect(taskAlignment.every(Boolean)).toBe(true);
    expect(Math.abs(taskAlignment[0]!.x + taskAlignment[0]!.width - taskAlignment[1]!.x - taskAlignment[1]!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(taskAlignment[0]!.x - taskAlignment[2]!.x)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('core-result-and-navigation.png') });
    if (process.platform === 'win32') {
      // Match the emulated viewport to the compact size; its native window
      // presentation is independently checked in the next journey.
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', 'compact-window');
      await page.setViewportSize({ width: 424, height: 392 });
      await expect(page.getByTestId('quick-command-objective-state')).toContainText(/complete/i);
      const localTask = page.getByTestId('quick-command-conversation').locator('[data-morpheus-entry="objective"]').last();
      await expect(localTask).toContainText('Show system information');
      const compactTaskGeometry = await Promise.all([
        page.locator('.morpheus-compact-log').boundingBox(),
        localTask.locator('.morpheus-conversation-user-bubble').boundingBox(),
        localTask.locator('.morpheus-conversation-reply').boundingBox(),
      ]);
      expect(compactTaskGeometry.every(Boolean)).toBe(true);
      expect(Math.abs(compactTaskGeometry[0]!.x - compactTaskGeometry[2]!.x)).toBeLessThanOrEqual(1);
      // A native scrollbar may consume a gutter, but no arbitrary extra inset.
      const gutter = await page.locator('.morpheus-compact-log').evaluate((node) => node.offsetWidth - node.clientWidth);
      expect(Math.abs(compactTaskGeometry[0]!.x + compactTaskGeometry[0]!.width - gutter
        - compactTaskGeometry[1]!.x - compactTaskGeometry[1]!.width)).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('morpheus-quick-command').locator('section').first()).toHaveCSS('opacity', '1');
      await page.screenshot({ path: info.outputPath('compact-core-result.png') });
    }
    expect((await getRecordedHostInvocations(app)).filter((request) => forbiddenVoiceWork.includes(request.action ?? ''))).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { shellPhysicalMicrophoneRequests: number }).shellPhysicalMicrophoneRequests)).toBe(0);
    await attachScope(info, page, errors);
  } finally { await closeElectronApp(app); await saveVideo?.(); }
});

test('wake-enabled compact settings returns to the same editable draft and conversation', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32', 'Native Windows compact surface');
  const app = await launchElectronApp({ skipSetup: true });
  let saveVideo: (() => Promise<void>) | undefined;
  try {
    const fixture = await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Compact recovery conversation' }] });
    await fixture.setPromptUpdates('Hello there', [{ sessionUpdate: 'agent_message_chunk', messageId: 'compact-recovery-reply', content: { type: 'text', text: 'Same conversation, wherever you open it.' } }]);
    const page = await getStableWindow(app);
    const errors = recordErrors(page);
    saveVideo = saveVideoOnClose(page, 'shell-recovery-compact-settings.webm');
    await installVoicePresentation(app, page, true);
    await page.reload();
    await expect(page.getByTestId('morpheus-ambient-voice-indicator')).toBeVisible();
    await page.getByTestId('signal-nav-presence').click();
    await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', 'compact-window');
    await expect(page.getByTestId('morpheus-ambient-voice-indicator')).toHaveCount(0);
    await expect(page.getByTestId('quick-command-settings')).toHaveText(/Settings/);
    await page.getByTestId('quick-command-input').fill('Hello there');
    await page.getByTestId('quick-command-submit').click();
    await expect(page.getByTestId('quick-command-conversation')).toContainText('Same conversation, wherever you open it.');
    await page.getByTestId('quick-command-input').fill('Keep my compact follow-up');
    await page.getByTestId('quick-command-settings').click();
    await expect(page.getByTestId('morpheus-settings-voice')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('morpheus-ambient-voice-indicator')).toBeVisible();
    await page.getByTestId('morpheus-settings-personality').click();
    await expect(page.getByTestId('morpheus-settings-personality')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('morpheus-ambient-voice-indicator').getByRole('link', { name: 'Voice', exact: true }).click();
    await expect(page.getByTestId('morpheus-settings-voice')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('morpheus-settings-page').locator('..')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('morpheus-quick-command')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('compact-contextual-voice-settings.png') });
    await page.getByTestId('morpheus-settings-return').click();
    await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', 'compact-window');
    await expect(page.getByTestId('quick-command-input')).toHaveValue('Keep my compact follow-up');
    await expect(page.getByTestId('quick-command-conversation')).toContainText('Same conversation, wherever you open it.');
    await page.getByTestId('quick-command-input').press('End');
    await page.getByTestId('quick-command-input').pressSequentially(' still editable');
    await expect(page.getByTestId('morpheus-quick-command').locator('section').first()).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath('compact-return-draft.png') });
    await page.getByTestId('quick-command-expand').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Keep my compact follow-up still editable');
    await expect(page.getByTestId('workspace-conversation')).toContainText('Same conversation, wherever you open it.');
    await expectShellNavigation(page, page.getByTestId('morpheus-ambient-voice-indicator'));
    expect((await getRecordedHostInvocations(app)).filter((request) => forbiddenVoiceWork.includes(request.action ?? ''))).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { shellPhysicalMicrophoneRequests: number }).shellPhysicalMicrophoneRequests)).toBe(0);

    // Full-window recovery must not remove the compact surface's only recovery.
    await installVoicePresentation(app, page, false);
    await page.reload();
    await page.getByTestId('signal-nav-presence').click();
    await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', 'compact-window');
    await page.getByTestId('quick-command-input').fill('Keep a compact draft through voice repair');
    await page.getByTestId('morpheus-voice-button-quick-command').click();
    const compactError = page.getByTestId('morpheus-live-caption-compact');
    await expect(compactError).toContainText(/Reconnect/);
    await expect(page.getByTestId('morpheus-voice-indicator')).toHaveCount(0);
    await expectUncovered(page.getByTestId('quick-command-settings'), compactError);
    await expect(page.getByTestId('morpheus-quick-command').locator('section').first()).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath('compact-voice-repair.png') });
    await compactError.getByRole('button', { name: 'Voice', exact: true }).click();
    await expect(page.getByTestId('morpheus-settings-voice')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('morpheus-settings-return').click();
    await expect(page.getByTestId('quick-command-input')).toHaveValue('Keep a compact draft through voice repair');
    await expect(page.getByTestId('morpheus-live-caption-compact')).toContainText(/Microphone unavailable\. Reconnect/);
    expect((await getRecordedHostInvocations(app)).filter((request) => forbiddenVoiceWork.includes(request.action ?? ''))).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { shellPhysicalMicrophoneRequests: number }).shellPhysicalMicrophoneRequests)).toBe(1);
    await attachScope(info, page, errors);
  } finally { await closeElectronApp(app); await saveVideo?.(); }
});

test('active voice and missing-device repair occupy layout space without hiding navigation', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  let saveVideo: (() => Promise<void>) | undefined;
  try {
    await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Voice repair conversation' }] });
    const page = await getStableWindow(app);
    const errors = recordErrors(page);
    saveVideo = saveVideoOnClose(page, 'shell-recovery-active-and-error.webm');
    await installVoicePresentation(app, page, true);
    await page.reload();
    await page.setViewportSize({ width: 640, height: 720 });
    await expect(page.getByTestId('morpheus-ambient-voice-indicator')).toBeVisible();
    for (const phase of ['listening', 'working', 'speaking'] as const) {
      await emitVoicePresence(app, phase);
      const indicator = page.getByTestId('morpheus-voice-indicator');
      await expect(indicator).toHaveAttribute('data-phase', phase);
      await expect(page.getByTestId('morpheus-live-caption-full')).toHaveCount(0);
      await expectShellNavigation(page, indicator);
      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('morpheus-settings-page')).toBeVisible();
      await expectUncovered(page.getByTestId('morpheus-settings-return'), indicator);
      await page.getByTestId('morpheus-settings-return').click();
      await emitVoicePresence(app, phase);
      await page.screenshot({ path: info.outputPath(`active-voice-${phase}.png`) });
    }
    await installVoicePresentation(app, page, false);
    await page.reload();
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await page.getByTestId('morpheus-command-input').fill('Return to this draft after voice repair');
    await page.getByTestId('morpheus-voice-button-command-center').click();
    const errorIndicator = page.getByTestId('morpheus-voice-indicator');
    await expect(errorIndicator).toHaveAttribute('data-phase', 'error');
    await expect(page.getByTestId('morpheus-voice-error')).toContainText(/Reconnect/);
    await expect(page.getByTestId('morpheus-live-caption-full')).toHaveCount(0);
    await expectShellNavigation(page, errorIndicator);
    await page.setViewportSize({ width: 320, height: 720 });
    await expectShellNavigation(page, errorIndicator);
    await expect(page.getByTestId('morpheus-voice-connect-provider')).toBeInViewport();
    await page.screenshot({ path: info.outputPath('voice-repair-320.png') });
    await page.getByTestId('morpheus-voice-connect-provider').click();
    await expect(page.getByTestId('morpheus-settings-voice')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('morpheus-settings-return').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Return to this draft after voice repair');
    expect((await getRecordedHostInvocations(app)).filter((request) => forbiddenVoiceWork.includes(request.action ?? ''))).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { shellPhysicalMicrophoneRequests: number }).shellPhysicalMicrophoneRequests)).toBe(1);
    await attachScope(info, page, errors);
  } finally { await closeElectronApp(app); await saveVideo?.(); }
});
