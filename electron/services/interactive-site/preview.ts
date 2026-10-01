import { randomUUID } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import { installTaskBrowserNetwork } from '../task-browser/network';
import { buildInteractiveSite, INTERACTIVE_SITE_CSP, type MorpheusInteractiveBuild } from './template';

export const INTERACTIVE_PREVIEW_ORIGIN = 'https://morpheus-preview.invalid';

export function createInteractivePreviewNetwork(build: MorpheusInteractiveBuild) {
  // Main re-compiles only bounded content: never trust caller-provided files.
  const snapshot = buildInteractiveSite(build.spec);
  if (snapshot.revision !== build.revision) throw new Error('Interactive preview revision does not match its build.');
  const types: Record<string, string> = { '/index.html': 'text/html', '/styles.css': 'text/css', '/app.js': 'text/javascript' };
  let requests = 0;
  let bytes = 0;
  let blocked = 0;
  const statuses = new Map<string, number>();
  return {
    stats: () => ({ requests, bytes, blocked }),
    status: (url: string) => statuses.get(url),
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      if (request.method !== 'GET' || url.origin !== INTERACTIVE_PREVIEW_ORIGIN || url.username || url.password || url.search || !Object.hasOwn(types, path) || ++requests > 128) {
        blocked += 1;
        return new Response(null, { status: 403 });
      }
      const body = snapshot.files[path.slice(1)];
      bytes += Buffer.byteLength(body);
      statuses.set(url.href, 200);
      return new Response(body, { headers: {
        'Content-Type': `${types[path]}; charset=utf-8`, 'Content-Security-Policy': INTERACTIVE_SITE_CSP,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
      } });
    },
  };
}

/** Separate, ephemeral guest with no preload. Only the three pinned memory
 * resources are served; the shared rejecting proxy blocks every other network
 * path, including loopback. This does not relax the existing local HTML viewer. */
export async function openInteractivePreview(build: MorpheusInteractiveBuild, options: { show?: boolean; lifetimeMs?: number } = {}) {
  const browserSession = session.fromPartition(`morpheus-interactive-${randomUUID()}`, { cache: false });
  const network = createInteractivePreviewNetwork(build);
  const cleanup = await installTaskBrowserNetwork(browserSession, network);
  let window: BrowserWindow | undefined;
  let closing: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;
  const close = (): Promise<void> => {
    if (closing) return closing;
    if (timer) clearTimeout(timer);
    // Promise assignment precedes destroy: closed/render-process-gone can reenter.
    closing = Promise.resolve().then(async () => {
      if (window && !window.isDestroyed()) window.destroy();
      await cleanup();
    });
    return closing;
  };
  try {
    window = new BrowserWindow({ show: false, width: 1100, height: 800, title: 'Morpheus · Interactive preview', autoHideMenuBar: true, webPreferences: {
      session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false,
      nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false,
      webSecurity: true, allowRunningInsecureContent: false, plugins: false, spellcheck: false,
    } });
    const wc = window.webContents;
    wc.setAudioMuted(true);
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    const guardNavigation = (event: { preventDefault(): void }, url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.origin !== INTERACTIVE_PREVIEW_ORIGIN || !['/', '/index.html'].includes(parsed.pathname) || parsed.search) event.preventDefault();
      } catch { event.preventDefault(); }
    };
    wc.on('will-navigate', guardNavigation);
    wc.on('will-redirect', guardNavigation);
    wc.on('will-attach-webview', (event) => event.preventDefault());
    wc.on('will-prevent-unload', (event) => event.preventDefault());
    wc.on('login', (event, _details, _info, callback) => { event.preventDefault(); callback(); });
    wc.on('render-process-gone', () => { void close().catch(() => {}); });
    wc.on('unresponsive', () => { void close().catch(() => {}); });
    window.on('closed', () => { void close().catch(() => {}); });
    timer = setTimeout(() => { void close().catch(() => {}); }, Math.min(30 * 60_000, Math.max(1, options.lifetimeMs ?? 30 * 60_000)));
    timer.unref();
    await wc.loadURL(`${INTERACTIVE_PREVIEW_ORIGIN}/`);
    if (closing || window.isDestroyed()) throw new Error('Interactive preview closed before loading.');
    if (options.show !== false) window.show();
    return { id: window.id, revision: build.revision, close };
  } catch (error) { await close(); throw error; }
}
