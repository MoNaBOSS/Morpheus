import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';

import { createMorpheusOrbHandlers, registerMorpheusOrbBridge } from '@electron/main/morpheus-orb-bridge';
import { MorpheusAssistantSession } from '@electron/services/morpheus-assistant-session';
import { MORPHEUS_ASSISTANT_DEFAULT_CONVERSATION_ID } from '@shared/morpheus/assistant-session-types';

type OrbHandlerEvent = Parameters<ReturnType<typeof createMorpheusOrbHandlers>['snapshot']>[0];

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getLocale: () => 'en-US' },
  ipcMain: { handle: electronMock.handle, removeHandler: electronMock.removeHandler },
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: vi.fn(async () => 'ja-JP'),
}));

function fixture() {
  const mainFrame = {};
  const webContents = { mainFrame, isDestroyed: () => false };
  const trustedEvent = { sender: webContents, senderFrame: mainFrame } as unknown as OrbHandlerEvent;
  const session = new MorpheusAssistantSession({
    now: () => new Date('2026-09-30T00:00:00.000Z'),
    createId: () => 'first',
  });
  const snapshot = vi.fn(async () => session.snapshot());
  const updateDraft = vi.fn(async (payload: Parameters<typeof session.updateDraft>[0]) => session.updateDraft(payload));
  const admitTurn = vi.fn(async (payload: Parameters<typeof session.admitTurn>[0]) => session.admitTurn(payload));
  const present = vi.fn();
  const options = {
    getOrbWebContents: () => webContents as unknown as WebContents,
    snapshot,
    updateDraft,
    admitTurn,
    present,
  };
  const handlers = createMorpheusOrbHandlers(options);
  return { webContents, trustedEvent, session, snapshot, updateDraft, admitTurn, present, options, handlers };
}

describe('sandboxed Morpheus orb bridge', () => {
  it('forwards the native presentation acknowledgement without dropping its promise', async () => {
    const { present, handlers, trustedEvent } = fixture();
    let release!: () => void;
    const applied = new Promise<void>((resolve) => { release = resolve; });
    present.mockReturnValue(applied);
    const result = handlers.present(trustedEvent, 'focus');
    expect(result).toBe(applied);
    release();
    await result;
  });
  it('registers only the four fixed native channels and removes them on disposal', () => {
    electronMock.handle.mockClear();
    electronMock.removeHandler.mockClear();
    const { options } = fixture();
    const dispose = registerMorpheusOrbBridge(options);
    const channels = [
      'morpheus-orb:snapshot',
      'morpheus-orb:update-draft',
      'morpheus-orb:admit-turn',
      'morpheus-orb:present',
    ];
    expect(electronMock.handle.mock.calls.map(([channel]) => channel)).toEqual(channels);
    dispose();
    expect(electronMock.removeHandler.mock.calls.map(([channel]) => channel)).toEqual(channels);
  });

  it('rejects a different webContents, a subframe and a destroyed orb before any delegate runs', async () => {
    const { webContents, trustedEvent, snapshot, updateDraft, admitTurn, present, handlers } = fixture();
    const draft = { conversationId: MORPHEUS_ASSISTANT_DEFAULT_CONVERSATION_ID, expectedRevision: 0, text: 'Hello' };
    const turn = { conversationId: MORPHEUS_ASSISTANT_DEFAULT_CONVERSATION_ID, clientRequestId: 'request-1', text: 'Hello', source: 'orb' };
    const untrustedEvents: OrbHandlerEvent[] = [
      { sender: { ...webContents }, senderFrame: webContents.mainFrame } as unknown as OrbHandlerEvent,
      { sender: webContents, senderFrame: {} } as unknown as OrbHandlerEvent,
    ];
    for (const event of untrustedEvents) {
      await expect(handlers.snapshot(event)).rejects.toThrow('Untrusted Morpheus orb request');
      await expect(handlers.updateDraft(event, draft)).rejects.toThrow('Untrusted Morpheus orb request');
      await expect(handlers.admitTurn(event, turn)).rejects.toThrow('Untrusted Morpheus orb request');
      expect(() => handlers.present(event, 'focus')).toThrow('Untrusted Morpheus orb request');
    }
    vi.spyOn(webContents, 'isDestroyed').mockReturnValue(true);
    await expect(handlers.snapshot(trustedEvent)).rejects.toThrow('Untrusted Morpheus orb request');
    expect(snapshot).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
    expect(admitTurn).not.toHaveBeenCalled();
    expect(present).not.toHaveBeenCalled();
  });

  it('rejects extra arguments, unknown payload fields and non-orb turn sources', async () => {
    const { trustedEvent, snapshot, updateDraft, admitTurn, present, handlers } = fixture();
    const conversationId = MORPHEUS_ASSISTANT_DEFAULT_CONVERSATION_ID;
    await expect(handlers.snapshot(trustedEvent, {})).rejects.toThrow('Invalid orb snapshot request');
    await expect(handlers.updateDraft(trustedEvent, {
      conversationId, expectedRevision: 0, text: 'Hello', unexpected: true,
    })).rejects.toThrow('Invalid orb draft');
    await expect(handlers.updateDraft(trustedEvent, {
      conversationId, expectedRevision: -1, text: 'Hello',
    })).rejects.toThrow('Invalid orb draft');
    await expect(handlers.updateDraft(trustedEvent, {
      conversationId, expectedRevision: 0, text: 'x'.repeat(4_001),
    })).rejects.toThrow('Invalid orb draft');
    await expect(handlers.admitTurn(trustedEvent, {
      conversationId, clientRequestId: 'request-1', text: 'Hello', source: 'full',
    })).rejects.toThrow('Invalid orb turn');
    await expect(handlers.admitTurn(trustedEvent, {
      conversationId, clientRequestId: 'request-1', text: 'Hello', source: 'orb', extra: 1,
    })).rejects.toThrow('Invalid orb turn');
    await expect(handlers.admitTurn(trustedEvent, {
      conversationId, clientRequestId: 'request-1', text: '   ', source: 'orb',
    })).rejects.toThrow('Invalid orb turn');
    expect(() => handlers.present(trustedEvent, 'shell')).toThrow('Invalid orb presentation request');
    expect(() => handlers.present(trustedEvent, 'focus', 'open')).toThrow('Invalid orb presentation request');
    expect(() => handlers.present(trustedEvent, { action: 'drag-move', x: 10, y: 20 })).toThrow('Invalid orb presentation request');
    expect(snapshot).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
    expect(admitTurn).not.toHaveBeenCalled();
    expect(present).not.toHaveBeenCalled();
  });

  it('shares one revisioned draft and one admission for a retried request id', async () => {
    const { trustedEvent, session, updateDraft, admitTurn, present, handlers } = fixture();
    const conversationId = MORPHEUS_ASSISTANT_DEFAULT_CONVERSATION_ID;
    const first = await handlers.snapshot(trustedEvent);
    expect(first.presentation.language).toBe('ja');
    expect(first.draft).toMatchObject({ conversationId, revision: 0, text: '' });

    const saved = await handlers.updateDraft(trustedEvent, { conversationId, expectedRevision: 0, text: 'Hello' });
    expect(saved).toMatchObject({ conversationId, revision: 1, text: 'Hello' });
    await expect(handlers.updateDraft(trustedEvent, {
      conversationId, expectedRevision: 0, text: 'Stale',
    })).rejects.toThrow('stale draft revision');
    expect(updateDraft).toHaveBeenCalledTimes(2);
    handlers.present(trustedEvent, 'collapse');
    expect(present).toHaveBeenCalledWith('collapse');
    expect((await handlers.snapshot(trustedEvent)).draft).toMatchObject({ revision: 1, text: 'Hello' });

    const request = { conversationId, clientRequestId: 'request-1', text: 'Hello', source: 'orb' };
    const admission = await handlers.admitTurn(trustedEvent, request);
    const repeated = await handlers.admitTurn(trustedEvent, request);
    expect(repeated).toEqual(admission);
    expect(admitTurn).toHaveBeenCalledTimes(2);
    expect(session.snapshot().pendingTurns).toHaveLength(1);
    expect(session.snapshot().draft).toMatchObject({ revision: 2, text: '' });
    await expect(handlers.admitTurn(trustedEvent, { ...request, text: 'Different' }))
      .rejects.toThrow('clientRequestId was reused with different content');
  });

  it('permits only the fixed presentation actions after trusted explicit input', () => {
    const { trustedEvent, present, handlers } = fixture();
    handlers.present(trustedEvent, 'hover');
    handlers.present(trustedEvent, 'collapse');
    handlers.present(trustedEvent, 'open');
    handlers.present(trustedEvent, 'focus');
    handlers.present(trustedEvent, 'drag-start');
    handlers.present(trustedEvent, 'drag-move');
    handlers.present(trustedEvent, 'drag-end');
    handlers.present(trustedEvent, 'move-left');
    handlers.present(trustedEvent, 'reset-position');
    expect(present.mock.calls.map(([action]) => action)).toEqual(['hover', 'collapse', 'open', 'focus', 'drag-start', 'drag-move', 'drag-end', 'move-left', 'reset-position']);
  });
});
