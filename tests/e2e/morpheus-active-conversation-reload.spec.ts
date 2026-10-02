import { build } from 'esbuild';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ElectronApplication } from '@playwright/test';
import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

const SESSION = 'agent:main:main';
let bundlePromise: Promise<string> | undefined;
function productionBundle(): Promise<string> {
  bundlePromise ??= build({
    stdin: { contents: [
      `export { AcpChatService } from ${JSON.stringify(join(process.cwd(), 'electron/services/acp-chat-service.ts'))};`,
      `export { createMorpheusAcpAdmissionHook } from ${JSON.stringify(join(process.cwd(), 'electron/services/chat-api.ts'))};`,
      `export { MorpheusAssistantSession } from ${JSON.stringify(join(process.cwd(), 'electron/services/morpheus-assistant-session.ts'))};`,
      `export { AcpSessionAccessRegistry } from ${JSON.stringify(join(process.cwd(), 'electron/services/acp-session-access-registry.ts'))};`,
    ].join('\n'), loader: 'ts', resolveDir: process.cwd(), sourcefile: 'active-reload-native-entry.ts' },
    bundle: true, external: ['electron'], platform: 'node', format: 'cjs', target: 'node22',
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(join(process.cwd(), 'electron/utils/paths.ts')).href) },
    tsconfig: join(process.cwd(), 'tsconfig.node.json'), write: false,
  }).then((result) => result.outputFiles![0].text);
  return bundlePromise;
}

async function installHeldPrompt(app: ElectronApplication, permission: boolean) {
  const fixture = await installAttachmentHostFixture(app, { sessions: [{ key: SESSION, title: 'Original conversation' }] });
  const modulePath = await fixture.createWorkspaceFile('active-reload-production.cjs', await productionBundle());
  await app.evaluate(async (_, payload) => {
    const { BrowserWindow, ipcMain } = process.mainModule!.require('electron') as typeof import('electron');
    const production = process.mainModule!.require(payload.modulePath) as {
      AcpChatService: typeof import('../../electron/services/acp-chat-service').AcpChatService;
      MorpheusAssistantSession: typeof import('../../electron/services/morpheus-assistant-session').MorpheusAssistantSession;
      AcpSessionAccessRegistry: typeof import('../../electron/services/acp-session-access-registry').AcpSessionAccessRegistry;
      createMorpheusAcpAdmissionHook: typeof import('../../electron/services/chat-api').createMorpheusAcpAdmissionHook;
    };
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle() === 'Morpheus')!;
    const owner = new production.MorpheusAssistantSession({ emit: (event) => window.webContents.send('morpheus:assistant-session-changed', event) });
    const state = { promptCount: 0, finished: false, userTurns: [] as string[], updates: [] as Record<string, unknown>[], loads: [] as unknown[], release: () => {}, originalPayload: undefined as import('../../shared/acp-chat/types').AcpChatPromptPayload | undefined };
    let service: InstanceType<typeof production.AcpChatService>;
    const connection = {
      initialize: async () => ({ protocolVersion: 1, agentCapabilities: { loadSession: true } }),
      newSession: async () => ({ sessionId: payload.sessionKey }),
      loadSession: async (input: { sessionId: string }) => {
        for (const update of state.updates) await service.client.sessionUpdate({ sessionId: input.sessionId, update } as never);
        return {};
      },
      prompt: async (input: { sessionId: string; prompt: Array<{ type: string; text?: string }>; _meta?: { messageId?: string } }) => {
        state.promptCount += 1;
        const text = input.prompt.filter((block) => block.type === 'text').at(-1)?.text ?? '';
        state.userTurns.push(text);
        const user = { sessionUpdate: 'user_message_chunk', messageId: input._meta?.messageId, content: { type: 'text', text } };
        state.updates.push(user);
        await service.client.sessionUpdate({ sessionId: input.sessionId, update: user } as never);
        if (payload.permission) {
          const response = await service.client.requestPermission({ sessionId: input.sessionId,
            toolCall: { toolCallId: 'original-authority', title: 'Original permission: edit a synthetic file', status: 'pending' },
            options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject-once', name: 'Deny', kind: 'reject_once' }],
          });
          if (response.outcome.outcome === 'cancelled') { state.finished = true; return { stopReason: 'cancelled' as const }; }
        }
        const answer = { sessionUpdate: 'agent_message_chunk', messageId: 'original-answer', content: { type: 'text', text: 'Original answer retained through reload.' } };
        state.updates.push(answer);
        await service.client.sessionUpdate({ sessionId: input.sessionId, update: answer } as never);
        if (!payload.permission) await new Promise<void>((resolve) => { state.release = resolve; });
        state.finished = true;
        return { stopReason: 'end_turn' as const };
      },
      cancel: async () => undefined,
    };
    service = new production.AcpChatService(window, new production.AcpSessionAccessRegistry(), connection as never, undefined, undefined, production.createMorpheusAcpAdmissionHook(owner));
    type Request = { id?: string; module?: string; action?: string; payload?: unknown };
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, request: Request) => Promise<unknown>> })._invokeHandlers;
    const original = handlers.get('host:invoke')!;
    ipcMain.removeHandler('host:invoke');
    ipcMain.handle('host:invoke', async (event: unknown, request: Request) => {
      let data: unknown;
      if (request.module === 'chat') {
        if (request.action === 'loadAcpSession') { data = await service.loadSession(request.payload as Parameters<typeof service.loadSession>[0]); state.loads.push({ input: request.payload, result: data }); }
        else if (request.action === 'sendAcpPrompt') {
          state.originalPayload ??= request.payload as Parameters<typeof service.sendPrompt>[0];
          data = await service.sendPrompt(request.payload as Parameters<typeof service.sendPrompt>[0]);
        } else if (request.action === 'cancelAcpSession') data = await service.cancelSession(request.payload as Parameters<typeof service.cancelSession>[0]);
        else if (request.action === 'respondAcpPermission') data = await service.respondPermission(request.payload as Parameters<typeof service.respondPermission>[0]);
        else return original(event, request);
      } else if (request.module === 'morpheus') {
        if (request.action === 'assistantSnapshot') data = { ...owner.snapshot(request.payload as Parameters<typeof owner.snapshot>[0]), locale: 'en' };
        else if (request.action === 'assistantSelectConversation') data = owner.selectConversation(request.payload as Parameters<typeof owner.selectConversation>[0]);
        else if (request.action === 'updateAssistantDraft') data = owner.updateDraft(request.payload as Parameters<typeof owner.updateDraft>[0]);
        else if (request.action === 'admitAssistantTurn') data = owner.admitTurn(request.payload as Parameters<typeof owner.admitTurn>[0]);
        else if (request.action === 'ackAssistantTurn') data = owner.ackTurn(request.payload as Parameters<typeof owner.ackTurn>[0]);
        else return original(event, request);
      } else return original(event, request);
      return { id: request.id, ok: true, data };
    });
    (globalThis as unknown as { __activeReloadFixture: unknown }).__activeReloadFixture = { state, owner, service };
  }, { modulePath, sessionKey: SESSION, permission });
}

async function readState(app: ElectronApplication) {
  return app.evaluate(() => {
    const fixture = (globalThis as unknown as { __activeReloadFixture: {
      state: { promptCount: number; finished: boolean; userTurns: string[]; loads: unknown[]; updates: unknown[] };
      owner: { snapshot: () => { pendingTurns: unknown[]; turns: Array<{ status: string }> } };
    } }).__activeReloadFixture;
    return { promptCount: fixture.state.promptCount, finished: fixture.state.finished, userTurns: fixture.state.userTurns, loads: fixture.state.loads, updates: fixture.state.updates,
      pending: fixture.owner.snapshot().pendingTurns.length, statuses: fixture.owner.snapshot().turns.map((turn) => turn.status) };
  });
}

test('held Main prompt survives surface transitions and fresh reload exactly once', async ({ launchElectronApp }, testInfo) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    await installHeldPrompt(app, false);
    const page = await getStableWindow(app);
    await page.reload();
    await page.getByTestId('signal-nav-presence').click();
    await page.getByTestId('quick-command-input').fill('How are you today?');
    await page.getByTestId('quick-command-submit').click();
    await expect(page.getByTestId('quick-command-conversation')).toContainText('Original answer retained through reload.');
    await expect.poll(async () => (await readState(app)).pending).toBe(1);
    await page.getByTestId('quick-command-expand').click();
    await expect(page.getByTestId('workspace-conversation')).toContainText('Original answer retained through reload.');
    await page.evaluate(() => { window.location.hash = '#/settings?section=personality'; });
    await expect(page.getByTestId('morpheus-settings-page')).toBeVisible();
    await page.getByTestId('morpheus-settings-return').click();
    await page.getByTestId('signal-nav-presence').click();
    await page.reload();
    await expect(page.getByTestId('quick-command-stop-conversation')).toBeVisible();
    await app.evaluate(() => { (globalThis as unknown as { __activeReloadFixture: { state: { release: () => void } } }).__activeReloadFixture.state.release(); });
    await expect(page.getByTestId('quick-command-conversation')).toContainText('Original answer retained through reload.');
    await expect.poll(async () => (await readState(app)).pending).toBe(0);
    expect((await readState(app)).promptCount).toBe(1);
    await page.reload();
    await expect(page.getByTestId('quick-command-conversation')).toContainText('Original answer retained through reload.');
    expect((await readState(app)).promptCount).toBe(1);
    await page.screenshot({ path: testInfo.outputPath('held-prompt-recovered.png'), animations: 'disabled' });
    const receipts = await app.evaluate(async () => {
      const fixture = (globalThis as unknown as { __activeReloadFixture: {
        state: { originalPayload: import('../../shared/acp-chat/types').AcpChatPromptPayload };
        service: { sendPrompt: (payload: import('../../shared/acp-chat/types').AcpChatPromptPayload) => Promise<unknown> };
      } }).__activeReloadFixture;
      return { duplicate: await fixture.service.sendPrompt(fixture.state.originalPayload), changed: await fixture.service.sendPrompt({ ...fixture.state.originalPayload, message: 'changed content' }) };
    });
    expect(receipts.duplicate).toEqual({ success: true });
    expect(receipts.changed).toMatchObject({ success: false, error: expect.stringContaining('different content') });
    expect((await readState(app)).userTurns).toEqual(['How are you today?']);
  } finally { await closeElectronApp(app); }
});

for (const surface of ['compact', 'full', 'advanced'] as const) {
  for (const action of ['answer', 'stop'] as const) {
    test(`original permission remains actionable after fresh ${surface} reload: ${action}`, async ({ launchElectronApp }, testInfo) => {
      const app = await launchElectronApp({ skipSetup: true });
      try {
        await installHeldPrompt(app, true);
        const page = await getStableWindow(app);
        await page.reload();
        await page.getByTestId('morpheus-command-input').fill('How are you today?');
        await page.getByTestId('morpheus-command-submit').click();
        await expect(page.getByTestId('acp-permission-card')).toContainText('Original permission: edit a synthetic file');
        if (surface === 'compact') await page.getByTestId('signal-nav-presence').click();
        else if (surface === 'advanced') await page.evaluate(() => { window.location.hash = '#/chat'; });
        await page.reload();
        const conversation = surface === 'compact' ? page.getByTestId('quick-command-conversation') : surface === 'full' ? page.getByTestId('workspace-conversation') : page.getByTestId('chat-page');
        const card = conversation.getByTestId('acp-permission-card').filter({ hasText: 'Original permission: edit a synthetic file' });
        await expect(card).toBeVisible();
        await expect(card.getByRole('button', { name: 'Allow once' })).toBeEnabled();
        if (surface !== 'advanced') await expect(conversation.getByTestId('morpheus-conversation-queued')).toContainText('Request received');
        const stop = page.getByTestId(surface === 'compact' ? 'quick-command-stop-conversation' : surface === 'full' ? 'morpheus-conversation-stop' : 'chat-composer-send');
        await expect(stop).toBeVisible();
        await expect(stop).toBeEnabled();
        if (surface === 'advanced') await expect(stop).toHaveAttribute('title', 'Stop');
        await page.screenshot({ path: testInfo.outputPath(`${surface}-original-permission.png`), animations: 'disabled' });
        expect((await readState(app)).pending).toBe(1);
        if (action === 'answer') await card.getByRole('button', { name: 'Allow once' }).click();
        else await stop.click();
        await expect.poll(async () => (await readState(app)).finished).toBe(true);
        await expect.poll(async () => (await readState(app)).pending).toBe(0);
        expect((await readState(app)).promptCount).toBe(1);
        expect((await readState(app)).statuses).toEqual([action === 'answer' ? 'dispatched' : 'cancelled']);
        if (action === 'answer') {
          await testInfo.attach('after-answer-thread.json', { body: JSON.stringify({ state: await readState(app), text: await conversation.innerText() }, null, 2), contentType: 'application/json' });
          await expect(conversation).toContainText('Original answer retained through reload.');
        }
        await page.reload();
        if (action === 'answer') await expect(conversation).toContainText('Original answer retained through reload.');
        expect((await readState(app)).promptCount).toBe(1);
      } finally { await closeElectronApp(app); }
    });
  }
}
