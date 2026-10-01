import { lookup } from 'node:dns/promises';
import { createServer, isIP } from 'node:net';
import type { Session } from 'electron';
import { isPublicSourceAddress, requestPinnedPublicSource, resolvePublicSourceUrl, type PublicAddress, type PublicSourceTransport } from '../public-source-worker-adapter';

export function publicBrowserUrl(value: string, origin?: string): URL {
  const url = resolvePublicSourceUrl(value);
  if (origin && url.origin !== origin) throw new Error('Browser navigation exceeds its approved origin.');
  for (const key of url.searchParams.keys()) {
    if (/(?:token|password|passwd|secret|signature|credential|api[-_]?key|authorization|session|oauth|code|jwt)/i.test(key)) {
      throw new Error('Credential-bearing URLs cannot enter the public browser.');
    }
  }
  return url;
}

export type TaskBrowserNetworkDependencies = {
  resolveAddresses?: (host: string) => Promise<PublicAddress[]>;
  transport?: PublicSourceTransport;
};

/** No request headers/cookies from Chromium are forwarded to the public network. */
export function createTaskBrowserNetwork(origin: string, signal: AbortSignal, dependencies: TaskBrowserNetworkDependencies = {}) {
  const resolveAddresses = dependencies.resolveAddresses ?? ((host: string) => lookup(host, { all: true, verbatim: true }));
  const transport = dependencies.transport ?? requestPinnedPublicSource;
  let requests = 0;
  let bytes = 0;
  let blocked = 0;
  let reservedBytes = 0;
  const statuses = new Map<string, number>();
  const fail = () => { blocked += 1; return new Response('Public browser request unavailable.', { status: 403 }); };
  return {
    stats: () => ({ requests, bytes, blocked }),
    status: (url: string) => statuses.get(url),
    async handle(request: Request): Promise<Response> {
      let reservation = 0;
      try {
        statuses.delete(request.url);
        signal.throwIfAborted();
        if (request.method !== 'GET' || ++requests > 128 || bytes >= 8 * 1024 * 1024) return fail();
        const url = publicBrowserUrl(request.url, origin);
        reservation = Math.min(2 * 1024 * 1024, 8 * 1024 * 1024 - bytes - reservedBytes);
        if (reservation <= 0) return fail();
        reservedBytes += reservation;
        const host = url.hostname.replace(/^\[|\]$/g, '');
        const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await new Promise<PublicAddress[]>((resolve, reject) => {
          const abort = () => reject(signal.reason);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
          void resolveAddresses(host).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
        });
        signal.throwIfAborted();
        if (!addresses.length || addresses.some((entry) => !isPublicSourceAddress(entry.address))) return fail();
        const response = await transport(url, addresses[0], signal, reservation);
        signal.throwIfAborted();
        bytes += response.body.byteLength;
        if (response.body.byteLength > reservation || bytes > 8 * 1024 * 1024) return fail();
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.headers.location) return fail();
          const location = publicBrowserUrl(new URL(response.headers.location, url).href, origin).href;
          return new Response(null, { status: response.status, headers: { Location: location } });
        }
        const contentType = response.headers['content-type'] ?? '';
        if (response.status < 200 || response.status >= 300
          || !/^(?:text\/(?:html|plain|css|javascript)|application\/(?:javascript|json)|image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/(?:woff2?|ttf))(?:;|$)/i.test(contentType)
          || response.headers['content-disposition']?.toLowerCase().includes('attachment')
          || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') return fail();
        statuses.set(url.href, response.status);
        const headers = new Headers({
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
          // Additional CSP intersects, never replaces, the site's own restrictions.
          'Content-Security-Policy': "sandbox allow-scripts allow-same-origin allow-forms; default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; base-uri 'self'; form-action 'self'",
        });
        if (response.headers['content-security-policy']) headers.append('Content-Security-Policy', response.headers['content-security-policy']);
        // Never forward Set-Cookie, authentication, refresh, download or CORS headers.
        return new Response(response.status === 204 ? null : new Uint8Array(response.body), { status: response.status, headers });
      } catch { return fail(); }
      finally { reservedBytes -= Math.max(0, reservation); }
    },
  };
}

/** HTTPS is serviced by the pinned Node transport; ALL other Chromium network
 * paths use a rejecting proxy, with implicit loopback bypass explicitly removed.
 * There is no DIRECT fallback even if a page reaches an unhandled protocol. */
export async function installTaskBrowserNetwork(session: Session, network: ReturnType<typeof createTaskBrowserNetwork>) {
  const rejectProxy = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    rejectProxy.once('error', reject);
    rejectProxy.listen(0, '127.0.0.1', resolve);
  });
  const address = rejectProxy.address();
  if (!address || typeof address === 'string') { rejectProxy.close(); throw new Error('Browser isolation failed.'); }
  try {
    await session.setProxy({ mode: 'fixed_servers', proxyRules: `http=127.0.0.1:${address.port};https=127.0.0.1:${address.port};socks=127.0.0.1:${address.port}`, proxyBypassRules: '<-loopback>' });
    session.protocol.handle('https', network.handle);
    for (const scheme of ['http', 'file', 'ftp']) session.protocol.handle(scheme, () => new Response(null, { status: 403 }));
    session.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !details.url.startsWith('https:') && details.url !== 'about:blank' && !details.url.startsWith('data:image/') });
    });
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.setDevicePermissionHandler(() => false);
    session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    session.on('will-download', (event, item) => { event.preventDefault(); item.cancel(); });
  } catch (error) { rejectProxy.close(); throw error; }
  return async () => {
    await session.closeAllConnections();
    rejectProxy.close();
    for (const scheme of ['https', 'http', 'file', 'ftp']) session.protocol.unhandle(scheme);
    await session.clearStorageData();
    await session.clearCache();
  };
}
