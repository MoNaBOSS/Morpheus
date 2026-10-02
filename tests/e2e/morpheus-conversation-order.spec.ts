import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

// ACP replies are bounded fixtures; the intervening read-only system task uses
// the real Objective Core. This qualifies native display order, not model quality.
const greetings = { en: "What's next?", zh: '接下来做什么？', ja: '次は何をしましょう？', ru: 'Что дальше?' };
for (const language of ['en', 'zh', 'ja', 'ru'] as const) {
  test(`keeps mixed conversation and task order through compact/full in ${language}`, async ({ launchElectronApp, userDataDir }, info) => {
    await writeFile(join(userDataDir, 'settings.json'), JSON.stringify({ language }));
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const fixture = await installAttachmentHostFixture(app, {
        sessions: [{ key: 'agent:main:main', title: 'Conversation order test' }],
        language,
      });
      await fixture.setPromptUpdates('What changed in the report?', [{
        sessionUpdate: 'agent_message_chunk', messageId: 'earlier-reply',
        content: { type: 'text', text: 'Earlier fixture reply.' },
      }]);
      await fixture.setPromptUpdates('What should I review next?', [{
        sessionUpdate: 'agent_message_chunk', messageId: 'later-reply',
        content: { type: 'text', text: 'Later fixture reply.' },
      }]);
      const page = await getStableWindow(app);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await expect(page.getByRole('heading', { name: greetings[language], exact: true })).toBeVisible();
      await page.getByTestId('morpheus-command-input').fill('What changed in the report?');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('workspace-conversation')).toContainText('Earlier fixture reply.');
      await page.getByTestId('morpheus-command-input').fill('Show system information');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('workspace-selected-task')).toContainText('Show system information');
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete|完成|完了|заверш/i);
      await page.getByTestId('morpheus-command-input').fill('What should I review next?');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('workspace-conversation')).toContainText('Later fixture reply.');
      await expect(page.getByTestId('workspace-conversation').getByText('Later fixture reply.', { exact: true })).toBeInViewport({ ratio: 1 });
      const assertOrder = async (testId: string) => {
        const entries = await page.getByTestId(testId).locator('[data-morpheus-entry]').evaluateAll((elements) => elements.map((element) => element.textContent ?? ''));
        expect(entries).toHaveLength(5);
        expect(entries[0]).toContain('What changed in the report?');
        expect(entries[1]).toContain('Earlier fixture reply.');
        expect(entries[2]).toContain('Show system information');
        expect(entries[3]).toContain('What should I review next?');
        expect(entries[4]).toContain('Later fixture reply.');
      };
      await assertOrder('workspace-conversation');
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', process.platform === 'win32' ? 'compact-window' : 'overlay');
      await assertOrder('quick-command-conversation');
      await expect(page.getByTestId('quick-command-conversation').getByText('Later fixture reply.', { exact: true })).toBeInViewport({ ratio: 1 });
      const compactLog = page.getByTestId('morpheus-quick-command').getByRole('log');
      await compactLog.hover();
      await page.mouse.wheel(0, -2000);
      await expect.poll(() => compactLog.evaluate((element) => element.scrollTop)).toBe(0);
      await expect(page.getByTestId('quick-command-conversation').getByText('Earlier fixture reply.', { exact: true })).toBeInViewport({ ratio: 1 });
      await fixture.emitAcpSessionUpdates({ sessionKey: 'agent:main:main', updates: [{
        sessionUpdate: 'agent_message_chunk', messageId: 'later-reply',
        content: { type: 'text', text: ' Extra fixture detail.' },
      }] });
      await expect(page.getByTestId('quick-command-conversation')).toContainText('Extra fixture detail.');
      await expect.poll(() => compactLog.evaluate((element) => element.scrollTop)).toBe(0);
      await compactLog.hover();
      await page.mouse.wheel(0, 2000);
      await expect(page.getByTestId('quick-command-conversation').getByText(/Later fixture reply\. Extra fixture detail\./)).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath(`ordered-compact-${language}.png`), animations: 'disabled' });
      await page.getByTestId('quick-command-expand').click();
      await assertOrder('workspace-conversation');
      await expect(page.getByTestId('workspace-conversation').getByText(/Later fixture reply\. Extra fixture detail\./)).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('workspace-selected-task')).toContainText('Show system information');
      await page.screenshot({ path: info.outputPath(`ordered-full-${language}.png`), animations: 'disabled' });
      const calls = (await fixture.getHostInvocations()).filter((entry) => entry.module === 'chat' && entry.action === 'sendAcpPrompt');
      expect(calls).toHaveLength(2);
    } finally { await closeElectronApp(app); }
  });
}

test('keeps the latest saved reply visible through real native resize around compact/full/settings controls', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32', 'Actual native Windows compact resize required');
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const sessionKey = 'agent:main:main';
    const fixture = await installAttachmentHostFixture(app, { sessions: [{ key: sessionKey, title: 'Saved mixed history' }], language: 'en' });
    const answer = 'The latest saved fixture reply remains in view.';
    await fixture.setPromptUpdates('What should I review next?', [{ sessionUpdate: 'agent_message_chunk', messageId: 'saved-latest-answer', content: { type: 'text', text: answer } }]);
    const page = await getStableWindow(app);
    const nativeWindow = await app.browserWindow(page);
    await page.reload();
    await page.getByTestId('morpheus-command-input').fill('Show system information');
    await page.getByTestId('morpheus-command-submit').click();
    await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
    await page.getByTestId('morpheus-command-input').fill('What should I review next?');
    await page.getByTestId('morpheus-command-submit').click();
    await expect(page.getByTestId('workspace-conversation')).toContainText(answer);
    await expect.poll(() => page.evaluate(async () => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'assistantSnapshot' });
      if (!response.ok) throw new Error('Original Main turn reference is required');
      return (response.data as { pendingTurns: unknown[] }).pendingTurns.length;
    })).toBe(0);
    const originalTurn = await page.evaluate(async () => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'assistantSnapshot' });
      if (!response.ok) throw new Error('Original Main turn reference is required');
      return (response.data as { turns: Array<{ turnId: string; admittedAt: string }> }).turns.at(-1)!;
    });
    await fixture.setSessionReplay(sessionKey, [
      { sessionUpdate: 'user_message_chunk', messageId: originalTurn.turnId, content: { type: 'text', text: 'What should I review next?' } },
      { sessionUpdate: 'agent_message_chunk', messageId: 'saved-latest-answer', content: { type: 'text', text: answer } },
    ]);
    // The cold-start boundary has no ephemeral Main admission references. Feed
    // bounded canonical timing through the existing typed host supplement;
    // ACP replay/timing are fixtures, Core task and native resizing are real.
    await app.evaluate(({ ipcMain }, input) => {
      type Request = { id?: string; module?: string; action?: string; payload?: { sessionKey?: string } };
      const original = (ipcMain as unknown as { _invokeHandlers?: Map<string, (event: unknown, request: Request) => unknown> })._invokeHandlers?.get('host:invoke');
      if (!original) throw new Error('Original typed host handler is required');
      const evidence = { emptyReferenceSnapshots: 0, timingRequests: 0, startedAtMs: Date.parse(input.admittedAt) };
      (globalThis as unknown as { savedHistoryTimingEvidence: typeof evidence }).savedHistoryTimingEvidence = evidence;
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', async (event, request: Request) => {
        if (request.module === 'sessions' && request.action === 'turnTimings' && request.payload?.sessionKey === input.sessionKey) {
          evidence.timingRequests += 1;
          return { id: request.id, ok: true, data: { success: true, timings: [{ normalizedUserText: 'What should I review next?', userOccurrenceFromTail: 1, durationMs: 10, startedAtMs: evidence.startedAtMs }] } };
        }
        const response = await original(event, request);
        if (request.module === 'morpheus' && request.action === 'assistantSnapshot') {
          const snapshotResponse = response as { ok?: boolean; data?: { pendingTurns: unknown[]; turns: unknown[] } };
          if (snapshotResponse.ok && snapshotResponse.data) {
            if (snapshotResponse.data.pendingTurns.length) throw new Error('Historical fixture must never hide a live admission');
            evidence.emptyReferenceSnapshots += 1;
            return { ...snapshotResponse, data: { ...snapshotResponse.data, turns: [] } };
          }
        }
        return response;
      });
    }, { sessionKey, admittedAt: originalTurn.admittedAt });
    // Fresh renderer restores saved ACP replay beside the real persisted Core
    // task using canonical turn timing, rather than surviving Main references.
    await page.reload();
    await expect(page.getByTestId('workspace-conversation')).toContainText(answer);
    await expect(page.getByTestId('workspace-conversation')).toContainText('Show system information');
    await expect(page.getByTestId('workspace-conversation').locator('[data-morpheus-entry]')).toHaveCount(3);
    await expect.poll(async () => page.getByTestId('workspace-conversation').locator('[data-morpheus-entry]').evaluateAll((elements) => elements.map((element) => element.textContent ?? ''))).toEqual([
      expect.stringContaining('Show system information'), expect.stringContaining('What should I review next?'), expect.stringContaining(answer),
    ]);
    await page.getByTestId('morpheus-command-input').fill('Retain this draft');
    const assertCompact = async () => {
      await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', 'compact-window');
      // E2E presentation state alone does not establish native window geometry.
      // Resize the actual BrowserWindow to production compact dimensions; the
      // normal packaged recorder separately qualifies its controller wiring.
      await nativeWindow.evaluate((window) => { window.setMinimumSize(400, 360); window.setBounds({ width: 440, height: 400 }); });
      await expect.poll(() => nativeWindow.evaluate((window) => {
        const { height } = window.getBounds();
        return height >= 360 && height <= 400; // Windows invisible-frame rounding may subtract eight pixels.
      })).toBe(true);
      // Reproduce a browser's non-user anchoring/reset event before the final
      // resize notification. It must not be mistaken for deliberate reading.
      await page.getByTestId('morpheus-quick-command').getByRole('log').evaluate(async (element) => {
        element.scrollTop = 0;
        await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
      });
      await nativeWindow.evaluate((window) => { window.setBounds({ width: 440, height: 388 }); });
      await expect(page.getByTestId('quick-command-conversation').getByText(answer, { exact: true })).toBeInViewport({ ratio: 1, timeout: 3000 });
      await nativeWindow.evaluate((window) => { window.setBounds({ width: 440, height: 400 }); });
      await page.screenshot({ path: info.outputPath('saved-history-resize-before-viewport-check.png'), animations: 'disabled' });
      await expect(page.getByTestId('quick-command-conversation').getByText(answer, { exact: true })).toBeInViewport({ ratio: 1, timeout: 3000 });
      await expect(page.getByTestId('quick-command-input')).toHaveValue('Retain this draft');
    };
    await page.getByTestId('signal-nav-presence').click();
    await assertCompact();
    await page.getByTestId('quick-command-expand').click();
    await nativeWindow.evaluate((window) => { window.setBounds({ width: 1280, height: 800 }); });
    await expect(page.getByTestId('workspace-conversation').getByText(answer, { exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByTestId('morpheus-settings-voice').click();
    await expect(page.getByTestId('morpheus-voice-setup')).toBeVisible();
    await page.getByTestId('morpheus-settings-return').click();
    await page.getByTestId('signal-nav-presence').click();
    await assertCompact();
    await page.screenshot({ path: info.outputPath('saved-latest-reply-native-compact.png'), animations: 'disabled' });
    const log = page.getByTestId('morpheus-quick-command').getByRole('log');
    await log.hover();
    await page.mouse.wheel(0, -2000);
    await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(0);
    await fixture.emitAcpSessionUpdates({ sessionKey, updates: [{ sessionUpdate: 'agent_message_chunk', messageId: 'saved-latest-answer', content: { type: 'text', text: ' Passive fixture update.' } }] });
    await expect(page.getByTestId('quick-command-conversation')).toContainText('Passive fixture update.');
    await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(page.getByTestId('quick-command-conversation').getByText('Show system information')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath('saved-history-deliberate-scroll-up.png'), animations: 'disabled' });
    const timingEvidence = await app.evaluate(() => (globalThis as unknown as { savedHistoryTimingEvidence: { emptyReferenceSnapshots: number; timingRequests: number; startedAtMs: number } }).savedHistoryTimingEvidence);
    expect(timingEvidence.emptyReferenceSnapshots).toBeGreaterThan(0);
    expect(timingEvidence.timingRequests).toBeGreaterThan(0);
    await writeFile(info.outputPath('saved-history-timing-evidence.json'), JSON.stringify(timingEvidence, null, 2));
    expect((await fixture.getHostInvocations()).filter((entry) => entry.module === 'chat' && entry.action === 'sendAcpPrompt')).toHaveLength(1);
  } finally { await closeElectronApp(app); }
});
