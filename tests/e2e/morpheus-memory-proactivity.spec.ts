import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '../../shared/morpheus/onboarding-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test('real Main captures once; memory correction deletion and native export preserve transcript', async ({ launchElectronApp, userDataDir, homeDir }, testInfo) => {
  await mkdir(join(userDataDir, 'morpheus'), { recursive: true });
  await writeFile(join(userDataDir, 'morpheus', 'onboarding.json'), JSON.stringify({ v: 2, completed: true,
    completedAt: '2026-01-01T10:00:00Z', preferences: { ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, speakResponses: false } }));
  const transcriptDir = join(homeDir, '.openclaw', 'agents', 'main', 'sessions');
  await mkdir(transcriptDir, { recursive: true });
  const transcript = join(transcriptDir, 'c4-preserved.jsonl');
  const history = `${JSON.stringify({ type: 'session', version: 3, id: 'c4-preserved', timestamp: '2026-01-01T10:00:00Z' })}\n`;
  await writeFile(transcript, history);
  const destination = join(userDataDir, 'c4-memory-export.json');
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const invoke = async (action: string, payload?: unknown) => page.evaluate(async ({ action, payload }) => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action, payload });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      return result.data;
    }, { action, payload });
    const request = { conversationId: 'agent:main:main', clientRequestId: 'c4-user-pref', text: "Don't roast me", source: 'compact' };
    const admitted = await invoke('admitAssistantTurn', request) as { conversationId: string; turnId: string };
    await invoke('ackAssistantTurn', { conversationId: admitted.conversationId, turnId: admitted.turnId });
    expect(await invoke('routeInteraction', { text: request.text, mode: 'auto', surface: 'quick-command' })).toMatchObject({ route: 'conversation' });
    await page.getByTestId('signal-nav-advanced').click();
    await page.getByTestId('sidebar-nav-projects').click();
    await expect(page.getByTestId('projects-page')).toBeVisible();
    const snapshot = await invoke('memories') as { memories: Array<{ memoryId: string }> };
    expect(snapshot.memories).toHaveLength(1);
    const id = snapshot.memories[0].memoryId;
    const item = page.getByTestId(`memory-item-${id}`);
    await expect(item).toContainText('Do not roast me.');
    await page.getByTestId(`memory-edit-${id}`).click();
    await page.getByTestId('memory-text').fill('Do not joke about my work.');
    await page.getByTestId('memory-save').click();
    await expect(item).toContainText('Do not joke about my work.');
    await page.getByTestId(`memory-toggle-${id}`).click();
    await expect(item).toHaveAttribute('data-enabled', 'false');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, destination);
    await page.getByTestId('memory-export').click();
    await expect(page.getByTestId('memory-export-status')).toContainText('Memory saved');
    const exported = JSON.parse(await readFile(destination, 'utf8'));
    expect(exported).toMatchObject({ v: 1, memories: [{ text: 'Do not joke about my work.', enabled: false, source: 'user' }] });
    expect(Object.keys(exported).sort()).toEqual(['exportedAt', 'memories', 'v']);
    const rejected = await page.evaluate(() => window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'exportMemories', payload: { path: 'C:/arbitrary.json' } }));
    expect(rejected.ok).toBe(false);
    await item.getByRole('button', { name: 'Remove memory', exact: true }).click();
    await expect(item).toHaveCount(0);
    expect(await invoke('admitAssistantTurn', request)).toMatchObject({ turnId: admitted.turnId });
    expect(await invoke('memories')).toEqual({ memories: [] });
    expect(await readFile(transcript, 'utf8')).toBe(history);
    await page.screenshot({ path: testInfo.outputPath('memory-export-and-remove.png') });
  } finally { await closeElectronApp(app); }
});

test('Main social admission honors native availability DND pending work and persisted ignores', async ({ launchElectronApp, userDataDir }) => {
  await mkdir(join(userDataDir, 'morpheus'), { recursive: true });
  await writeFile(join(userDataDir, 'morpheus', 'onboarding.json'), JSON.stringify({ v: 2, completed: true,
    completedAt: '2026-01-01T10:00:00Z', preferences: { ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, speakResponses: false } }));
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const invoke = async (action: string, payload?: unknown) => page.evaluate(async ({ action, payload }) => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action, payload });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      return result.data;
    }, { action, payload });
    await invoke('updateProactiveSettings', { enabled: true, doNotDisturb: true, quietHoursEnabled: false });
    expect(await invoke('admitSocialCheckIn', { available: true })).toEqual({ admitted: false });
    await invoke('updateProactiveSettings', { doNotDisturb: false });
    expect(await invoke('admitSocialCheckIn', { available: false })).toEqual({ admitted: false });
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('index.html')); window?.show(); window?.focus(); });
    const admitted = await invoke('admitSocialCheckIn', { available: true }) as { admitted: boolean; invitationId: string };
    expect(admitted).toMatchObject({ admitted: true, invitationId: expect.any(String) });
    expect(await invoke('admitSocialCheckIn', { available: true })).toEqual({ admitted: false });
    expect(await invoke('dismissSocialCheckIn', { invitationId: admitted.invitationId })).toEqual({ dismissed: true });
    expect(await invoke('dismissSocialCheckIn', { invitationId: admitted.invitationId })).toEqual({ dismissed: false });
    await page.reload();
    expect(await invoke('onboardingStatus')).toMatchObject({ socialCheckIn: { ignoredStreak: 1, lastOfferedAt: expect.any(String) } });
    expect(await invoke('admitSocialCheckIn', { available: true })).toEqual({ admitted: false });
    const persisted = await readFile(join(userDataDir, 'morpheus', 'onboarding.json'), 'utf8');
    expect(persisted).not.toMatch(/mood|emotion/);
  } finally { await closeElectronApp(app); }
});

for (const locale of ['en', 'zh', 'ja', 'ru']) {
  test(`memory export cancellation is localized and keyboard usable with reduced motion in ${locale}`, async ({ launchElectronApp }, testInfo) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.evaluate(async (language) => {
        await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } });
      }, locale);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await page.getByTestId('signal-nav-advanced').click();
      await page.getByTestId('sidebar-nav-projects').click();
      await expect(page.getByTestId('memory-export')).toBeEnabled();
      expect(await page.getByTestId('memory-export').innerText()).not.toContain('morpheus.memory.');
      await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
      await page.getByTestId('memory-export').focus();
      await page.getByTestId('memory-export').press('Enter');
      await expect(page.getByTestId('memory-export-status')).toBeVisible();
      expect(await page.getByTestId('memory-export-status').innerText()).not.toContain('morpheus.memory.');
      await page.screenshot({ path: testInfo.outputPath(`memory-${locale}-reduced-motion.png`) });
    } finally { await closeElectronApp(app); }
  });
}

test('Main-admitted social caption stays on the quiet native orb without opening or focusing the main window', async ({ launchElectronApp, userDataDir }, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows native presence');
  await mkdir(join(userDataDir, 'morpheus'), { recursive: true });
  await writeFile(join(userDataDir, 'morpheus', 'onboarding.json'), JSON.stringify({ v: 2, completed: true,
    completedAt: '2026-01-01T10:00:00Z', preferences: { ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, speakResponses: false } }));
  const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
  try {
    await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
    const pages = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })));
    const native = pages.find(({ title }) => title === 'Morpheus presence')!.page;
    const main = pages.find(({ title }) => title === 'Morpheus')!.page;
    const errors: string[] = [];
    native.on('pageerror', (error) => errors.push(error.message));
    expect(native.url()).toContain('morpheus-orb/orb.html');
    await native.emulateMedia({ reducedMotion: 'reduce' });
    await expect(native.locator('.orb')).toBeVisible();
    await app.evaluate(({ powerMonitor }) => {
      // Availability fixture, not a claim of real lock/idle detection.
      powerMonitor.getSystemIdleTime = () => 0;
      powerMonitor.getSystemIdleState = () => 'active';
    });
    const invoke = (action: string, payload: unknown) => main.evaluate(async ({ action, payload }) => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action, payload });
      if (!response.ok) throw new Error(JSON.stringify(response.error));
      return response.data;
    }, { action, payload });
    await invoke('updateProactiveSettings', { enabled: true, doNotDisturb: false, quietHoursEnabled: false });
    const result = await invoke('admitSocialCheckIn', { available: true }) as { admitted: boolean; text: string; invitationId: string };
    expect(result.admitted).toBe(true);
    await expect(native.locator('#orb-social-caption')).toHaveText(result.text);
    await expect(native.locator('#orb-social-caption')).toBeVisible();
    await expect(native.locator('.hover-composer')).toHaveCSS('opacity', '0');
    expect(await app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const orb = windows.find((win) => win.getTitle() === 'Morpheus presence')!;
      return { mainVisible: windows.find((win) => win.getTitle() === 'Morpheus')!.isVisible(), focused: orb.isFocused(), width: orb.getBounds().width };
    })).toEqual({ mainVisible: false, focused: false, width: 360 });
    expect(errors).toEqual([]);
    await native.screenshot({ path: testInfo.outputPath('native-social-caption.png') });
    await native.locator('.orb').hover();
    await expect(native.locator('#orb-social-caption')).toBeHidden();
    await expect(native.locator('.hover-composer')).toHaveCSS('opacity', '1');
    await invoke('dismissSocialCheckIn', { invitationId: result.invitationId });
  } finally { await closeElectronApp(app); }
});
