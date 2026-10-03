import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const documents: JSDOM[] = [];
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); });

async function fixture() {
  const dom = new JSDOM(readFileSync(resolve('resources/morpheus-orb/orb.html'), 'utf8'), {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://orb.test/',
  });
  documents.push(dom);
  const window = dom.window;
  const bridge = {
    present: vi.fn(async (_action: string) => undefined),
    snapshot: vi.fn(async () => ({ schemaVersion: 1, conversationId: 'original-session', draft: { text: '', revision: 0 } })),
    updateDraft: vi.fn(), admitTurn: vi.fn(),
  };
  Object.defineProperty(window, 'morpheusOrb', { value: bridge });
  // Keep the real event handlers, pointer lifetime and presentation admission;
  // this fixture does not move a native window or create audio activity.
  window.requestAnimationFrame = vi.fn(() => 1);
  window.cancelAnimationFrame = vi.fn();
  const orb = window.document.querySelector('.orb') as HTMLButtonElement;
  let captured: number | null = null;
  const release = vi.fn(() => { captured = null; });
  Object.defineProperties(orb, {
    setPointerCapture: { value: (id: number) => { captured = id; } },
    hasPointerCapture: { value: (id: number) => captured === id },
    releasePointerCapture: { value: release },
  });
  window.eval(readFileSync(resolve('resources/morpheus-orb/orb.js'), 'utf8'));
  const flush = async () => { for (let index = 0; index < 5; index++) await Promise.resolve(); };
  await flush();
  const pointer = (type: string, x: number) => {
    const event = new window.MouseEvent(type, { bubbles: true, button: 0, screenX: x, screenY: 0 });
    Object.defineProperty(event, 'pointerId', { value: 7 }); orb.dispatchEvent(event);
  };
  const click = async () => { orb.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await flush(); };
  return { window, bridge, pointer, click, flush, release };
}

describe('native orb pointer cancellation', () => {
  it('ends a cancelled drag and lets the next deliberate click open the composer', async () => {
    const { bridge, pointer, click, flush, window, release } = await fixture();
    pointer('pointerdown', 0); pointer('pointermove', 12); await flush();
    expect(bridge.present).toHaveBeenCalledWith('drag-start');
    pointer('pointercancel', 12); await flush();
    expect(bridge.present).toHaveBeenCalledWith('drag-end');
    expect(release).toHaveBeenCalledOnce();
    await click();
    expect(bridge.present.mock.calls.filter(([action]) => action === 'focus')).toHaveLength(1);
    expect(window.document.activeElement?.id).toBe('orb-input');
    expect(bridge.admitTurn).not.toHaveBeenCalled();
  });

  it('still suppresses the release click after a completed drag, then accepts a new click', async () => {
    const { bridge, pointer, click, flush } = await fixture();
    pointer('pointerdown', 0); pointer('pointermove', 12); await flush();
    pointer('pointerup', 12); await flush();
    await click();
    expect(bridge.present.mock.calls.some(([action]) => action === 'focus')).toBe(false);
    await click();
    expect(bridge.present.mock.calls.filter(([action]) => action === 'focus')).toHaveLength(1);
    expect(bridge.present.mock.calls.filter(([action]) => action === 'drag-end')).toHaveLength(1);
  });
});
