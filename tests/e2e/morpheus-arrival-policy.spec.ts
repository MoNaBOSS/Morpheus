import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '../../shared/morpheus/onboarding-types';
import { closeElectronApp, expect, getRecordedHostInvocations, getStableWindow, installIpcMocks, test } from './fixtures/electron';

test('Main persists one quiet returning greeting, preserves profile, and honors DND', async ({ launchElectronApp, userDataDir }, testInfo) => {
  await mkdir(join(userDataDir, 'morpheus'), { recursive: true });
  await writeFile(join(userDataDir, 'morpheus', 'onboarding.json'), JSON.stringify({
    v: 2, completed: true, completedAt: '2026-01-01T10:00:00Z',
    preferences: { ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, preferredName: 'Larry', speakResponses: false, permissionProfile: 'strict' },
  }));
  await writeFile(join(userDataDir, 'morpheus', 'proactive.json'), JSON.stringify({
    v: 1, items: [], settings: { v: 1, enabled: true, notificationsEnabled: false, doNotDisturb: true,
      quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00',
      categories: { mission: true, goal: true, schedule: true, routine: true, reminder: true } },
  }));
  const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-boot=on', '--morpheus-onboarding=on'] });
  try {
    const page = await getStableWindow(app);
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    const invoke = async (action: string, payload?: unknown) => page.evaluate(async ({ action, payload }) => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action, payload });
      if (!response.ok) throw new Error(JSON.stringify(response.error));
      return response.data;
    }, { action, payload });
    expect(await invoke('admitArrivalGreeting')).toMatchObject({ admitted: false });
    await expect(page.getByTestId('morpheus-activation')).toHaveCount(0);
    await expect(page.getByTestId('morpheus-welcome')).toHaveCount(0);
    await expect(page.getByTestId('morpheus-arrival-greeting')).toHaveCount(0);
    await invoke('updateProactiveSettings', { doNotDisturb: false });
    // Real host route and persisted Main profile, no provider or clock mock.
    expect(await invoke('admitArrivalGreeting')).toEqual({ admitted: true, preferredName: 'Larry' });
    expect(await invoke('admitArrivalGreeting')).toMatchObject({ admitted: false });
    await page.reload();
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await expect(page.getByTestId('morpheus-boot')).toHaveCount(0);
    await expect(page.getByTestId('morpheus-arrival-greeting')).toHaveCount(0);
    expect(await invoke('onboardingStatus')).toMatchObject({ completed: true, preferences: { preferredName: 'Larry', permissionProfile: 'strict' }, arrival: { lastGreetingDay: expect.any(String) } });
    await page.screenshot({ path: testInfo.outputPath('quiet-return.png') });
  } finally { await closeElectronApp(app); }
});

test('compact unanswered choices correct the same task and never approve permissions', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const runId = 'objective-question-fixture';
    await installIpcMocks(app, { recordHostInvocations: true, hostApi: {
      [JSON.stringify(['morpheus', 'objectiveSnapshot', null])]: {
        activeObjectiveRunId: runId, runOrder: [runId], plansByObjectiveRunId: {},
        runsById: { [runId]: { v: 1, objectiveRunId: runId, objective: 'Prepare a report',
          origin: { type: 'quick-command', commandText: 'Prepare a report' }, state: 'needs-clarification',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), iteration: 1,
          corrections: [], planIds: [], observations: [], artifacts: [],
          clarification: 'Which report format?', clarificationChoices: ['Markdown', 'Text'] } },
      },
      [JSON.stringify(['morpheus', 'correctObjective', { objectiveRunId: runId, correction: 'Markdown' }])]: { accepted: true },
    } });
    await page.reload();
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await page.getByTestId('signal-nav-presence').click();
    await expect(page.getByTestId('morpheus-question-answers')).toBeVisible({ timeout: 12_000 });
    await page.getByTestId('morpheus-question-answers').getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(page.getByTestId('quick-command-input')).toHaveValue('Markdown');
    await page.getByTestId('quick-command-submit').click();
    await expect.poll(async () => (await getRecordedHostInvocations(app)).filter((call) => call.action === 'correctObjective').length).toBe(1);
    const calls = await getRecordedHostInvocations(app);
    expect(calls.find((call) => call.action === 'correctObjective')?.payload).toEqual({ objectiveRunId: runId, correction: 'Markdown' });
    expect(calls.filter((call) => ['submitObjective', 'respondPlanPermission', 'synthesizeSpeech'].includes(call.action ?? ''))).toEqual([]);
  } finally { await closeElectronApp(app); }
});

for (const locale of ['en', 'zh', 'ja', 'ru']) {
  test(`name skip and reduced-motion setup stay usable in ${locale}`, async ({ launchElectronApp }, testInfo) => {
    const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-onboarding=on'] });
    try {
      const page = await getStableWindow(app);
      await page.evaluate(async (language) => {
        const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } });
        if (!response.ok) throw new Error('Language update failed');
      }, locale);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 440, height: 720 });
      await page.reload();
      await expect(page.getByTestId('morpheus-activation')).toHaveAttribute('data-stage', 'name');
      await expect(page.getByTestId('activation-intro-name')).toBeFocused();
      await page.getByTestId('morpheus-activation-skip').press('Enter');
      await expect(page.getByTestId('morpheus-activation')).toHaveAttribute('data-stage', 'welcome');
      await page.getByTestId('morpheus-activation-personalize').click();
      await expect(page.getByTestId('activation-voice-preview-1')).toBeDisabled();
      await expect(page.getByTestId('activation-voice-honesty')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`setup-${locale}-reduced-motion.png`) });
      await page.getByTestId('morpheus-activation-finish').click();
      await page.getByTestId('morpheus-activation-enter').click();
      await expect(page.getByTestId('morpheus-activation')).toHaveCount(0);
      const result = await page.evaluate(() => window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'onboardingStatus' }));
      expect(result).toMatchObject({ ok: true, data: { completed: true, preferences: { preferredName: '' } } });
    } finally { await closeElectronApp(app); }
  });
}
