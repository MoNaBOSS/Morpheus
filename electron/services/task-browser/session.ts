import { randomUUID } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import type { MorpheusBrowserCommand, MorpheusBrowserSnapshot } from '@shared/morpheus/browser-types';
import { browserDomScript } from './dom';
import { createTaskBrowserNetwork, installTaskBrowserNetwork, publicBrowserUrl, type TaskBrowserNetworkDependencies } from './network';

const WORLD = 934;
const keys = ['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp'];

function validateCommand(command: MorpheusBrowserCommand): void {
  const allowed = command.kind === 'fill' ? ['kind', 'revision', 'ref', 'text'] : command.kind === 'select' ? ['kind', 'revision', 'ref', 'value'] : command.kind === 'press' ? ['kind', 'revision', 'ref', 'key'] : ['kind', 'revision', 'ref'];
  if (!['click', 'fill', 'select', 'press'].includes(command.kind) || Object.keys(command).some((key) => !allowed.includes(key))
    || !/^[a-f0-9-]{36}$/.test(command.revision) || !/^e\d{1,3}$/.test(command.ref)
    || command.kind === 'fill' && (typeof command.text !== 'string' || command.text.length > 2000)
    || command.kind === 'select' && (typeof command.value !== 'string' || command.value.length > 200)
    || command.kind === 'press' && !keys.includes(command.key)) throw new Error('Invalid typed browser command.');
}

/** Main-only building block. Core supplies ownership/authority before this is
 * exposed as a capability. Never accepts user-supplied preload, JS or session. */
export async function createTaskBrowser(input: {
  url: string;
  signal: AbortSignal;
  lifetimeMs?: number;
}, dependencies: TaskBrowserNetworkDependencies = {}) {
  const original = publicBrowserUrl(input.url);
  input.signal.throwIfAborted();
  const id = randomUUID();
  const controller = new AbortController();
  const relay = () => controller.abort(input.signal.reason);
  input.signal.addEventListener('abort', relay, { once: true });
  const browserSession = session.fromPartition(`morpheus-task-${id}`, { cache: false });
  const network = createTaskBrowserNetwork(original.origin, controller.signal, dependencies);
  let cleanup: (() => Promise<void>) | undefined;
  let window: BrowserWindow | undefined;
  let closed = false;
  let busy = false;
  let operations = 0;
  let latestSnapshot: MorpheusBrowserSnapshot | undefined;
  const timer = setTimeout(() => controller.abort(new Error('Browser session expired.')), Math.min(120_000, Math.max(1, input.lifetimeMs ?? 120_000)));
  timer.unref();
  const close = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    input.signal.removeEventListener('abort', relay);
    controller.abort(new Error('Browser session closed.'));
    if (window && !window.isDestroyed()) window.destroy();
    await cleanup?.();
  };
  controller.signal.addEventListener('abort', () => { void close(); }, { once: true });
  const requireWindow = () => {
    controller.signal.throwIfAborted();
    if (!window || window.isDestroyed() || closed) throw new Error('Browser session unavailable.');
    return window;
  };
  const runDom = async (code: string) => {
    try { return await requireWindow().webContents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]); }
    catch {
      controller.signal.throwIfAborted();
      throw new Error('Page control changed or is unavailable; inspect it again.');
    }
  };
  const snapshot = async (): Promise<MorpheusBrowserSnapshot> => {
    const wc = requireWindow().webContents;
    const url = publicBrowserUrl(wc.getURL(), original.origin).href;
    if (!network.status(url)) throw new Error('The page did not produce a verified public response.');
    const revision = randomUUID();
    const observed = await runDom(browserDomScript({ origin: original.origin, revision }));
    controller.signal.throwIfAborted();
    if (!observed || observed.url !== wc.getURL()) throw new Error('Page changed while being observed.');
    // Strip credential-bearing links before returning any page data to Core.
    observed.controls = observed.controls.filter((control: { href?: string }) => { try { if (control.href) publicBrowserUrl(control.href, original.origin); return true; } catch { return false; } });
    latestSnapshot = { ...observed, sessionId: id, revision, blockedRequests: network.stats().blocked };
    return latestSnapshot!;
  };
  const exclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
    requireWindow();
    if (busy || ++operations > 24) throw new Error('Browser session is busy or reached its operation limit.');
    busy = true;
    try { return await operation(); } finally { busy = false; }
  };
  const waitForPage = async () => {
    const wc = requireWindow().webContents;
    // Settle synchronous page handlers/navigation without waiting for ad trackers
    // to become idle. The session deadline remains the outer cancellation bound.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    requireWindow();
    if (!wc.isLoadingMainFrame()) return;
    await new Promise<void>((resolve, reject) => {
      const done = () => { remove(); resolve(); };
      const abort = () => { remove(); reject(controller.signal.reason); };
      const remove = () => { wc.off('did-stop-loading', done); controller.signal.removeEventListener('abort', abort); };
      wc.once('did-stop-loading', done);
      controller.signal.addEventListener('abort', abort, { once: true });
      if (!wc.isLoadingMainFrame()) done();
      if (controller.signal.aborted) abort();
    });
  };
  try {
    cleanup = await installTaskBrowserNetwork(browserSession, network);
    controller.signal.throwIfAborted();
    window = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: {
      session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false,
      nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false,
      plugins: false, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false,
      backgroundThrottling: true,
    } });
    const wc = window.webContents;
    wc.setAudioMuted(true);
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (event, url) => { try { publicBrowserUrl(url, original.origin); } catch { event.preventDefault(); } });
    wc.on('will-redirect', (event, url) => { try { publicBrowserUrl(url, original.origin); } catch { event.preventDefault(); } });
    wc.on('will-attach-webview', (event) => event.preventDefault());
    wc.on('will-prevent-unload', (event) => event.preventDefault());
    wc.on('render-process-gone', () => controller.abort(new Error('Browser renderer stopped.')));
    wc.on('unresponsive', () => controller.abort(new Error('Browser renderer stopped responding.')));
    wc.on('login', (event, _details, _info, callback) => { event.preventDefault(); callback(); });
    await wc.loadURL(original.href);
    await snapshot();
    return {
      id, origin: original.origin,
      snapshot: () => exclusive(snapshot),
      navigate: (url: string) => exclusive(async () => {
        latestSnapshot = undefined;
        await requireWindow().webContents.loadURL(publicBrowserUrl(url, original.origin).href);
        return snapshot();
      }),
      act: (command: MorpheusBrowserCommand) => exclusive(async () => {
        validateCommand(command);
        if (latestSnapshot?.revision !== command.revision || !latestSnapshot.controls.some((control) => control.ref === command.ref)) throw new Error('Page control changed; inspect it again.');
        latestSnapshot = undefined;
        await runDom(browserDomScript({ origin: original.origin, command }));
        if (command.kind === 'press') {
          const wc = requireWindow().webContents;
          wc.sendInputEvent({ type: 'keyDown', keyCode: command.key });
          wc.sendInputEvent({ type: 'keyUp', keyCode: command.key });
        }
        await waitForPage();
        return snapshot();
      }),
      close,
    };
  } catch (error) {
    // An abort during setup may precede assignment of the cleanup callback.
    if (closed) await cleanup?.(); else await close();
    throw error;
  }
}

export type MorpheusTaskBrowser = Awaited<ReturnType<typeof createTaskBrowser>>;
