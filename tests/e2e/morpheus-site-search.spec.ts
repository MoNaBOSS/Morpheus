import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

// Actual shared interpretation, Main admission, Core permissions and rendered
// submissions. OS URL delegation is recorded/held; no owner browser or speech.
test('explicit site searches retain their target and literal query in full and compact commands', async ({ launchElectronApp }) => {
  test.skip(process.platform !== 'win32', 'The registered URL capability is Windows-only');
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const fixture = await installAttachmentHostFixture(app, {
      sessions: [{ key: 'agent:main:main', title: 'Site search qualification' }], language: 'en',
    });
    await app.evaluate(({ shell }) => {
      const recordedOpenExternal = shell.openExternal.bind(shell);
      const gate = { target: null as string | null, release: null as (() => void) | null };
      (globalThis as unknown as { siteSearchGate: typeof gate }).siteSearchGate = gate;
      shell.openExternal = async (url: string) => {
        gate.target = url;
        await new Promise<void>((resolve) => { gate.release = resolve; });
        await recordedOpenExternal(url);
      };
    });
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.reload();
    const commands = [
      { objective: 'go to youtube and search mr beast', query: 'mr beast', compact: false },
      { objective: 'Open the YouTube and search for RNR.', query: 'RNR', compact: false },
      { objective: 'Search YouTube for "delete file notes.txt and open Notepad"', query: 'delete file notes.txt and open Notepad', compact: true },
    ];
    for (const [index, { objective, query, compact }] of commands.entries()) {
      if (compact) await page.getByTestId('signal-nav-presence').click();
      const input = compact ? 'quick-command-input' : 'morpheus-command-input';
      const submit = compact ? 'quick-command-submit' : 'morpheus-command-submit';
      await app.evaluate(() => {
        const gate = (globalThis as unknown as { siteSearchGate: { target: string | null; release: (() => void) | null } }).siteSearchGate;
        gate.target = null;
        gate.release = null;
      });
      await page.getByTestId(input).fill(objective);
      await page.getByTestId(submit).click();
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      await expect.poll(() => app.evaluate(() => (globalThis as unknown as { siteSearchGate: { target: string | null } }).siteSearchGate.target)).toBe(url);
      const snapshot = await page.evaluate(async () => {
        const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'objectiveSnapshot' });
        if (!response.ok) throw new Error('Main objective snapshot unavailable');
        return response.data as {
          activeObjectiveRunId: string;
          runsById: Record<string, { objective: string; route: { kind: string } }>;
          plansByObjectiveRunId: Record<string, { steps: unknown[] }>;
        };
      });
      expect(snapshot.runsById[snapshot.activeObjectiveRunId]).toMatchObject({ objective, route: { kind: 'direct-capability' } });
      expect(snapshot.plansByObjectiveRunId[snapshot.activeObjectiveRunId].steps).toEqual([
        expect.objectContaining({ capabilityId: 'web.openUrl', params: { url },
          permission: expect.objectContaining({ resourceScope: 'https://www.youtube.com', mandatoryConfirmation: false }),
        }),
      ]);
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
      await app.evaluate(() => (globalThis as unknown as { siteSearchGate: { release: (() => void) | null } }).siteSearchGate.release!());
      await expect.poll(async () => (await fixture.getShellInvocations()).filter((entry) => entry.action === 'openExternal').length)
        .toBe(index + 1);
    }
    expect((await fixture.getShellInvocations()).filter((entry) => entry.action === 'openExternal').map((entry) => entry.payload))
      .toEqual(commands.map(({ query }) => ({ url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` })));
    expect((await fixture.getHostInvocations()).filter((entry) => entry.module === 'chat' && entry.action === 'sendAcpPrompt')).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await closeElectronApp(app);
  }
});
