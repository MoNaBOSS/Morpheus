import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

export type ManagedAuthCallback = { redirectUrl: string; code: Promise<string>; cancel(): void };

/** Bind before launching the browser. Only this flow's nonce can consume it. */
export async function createManagedAuthCallback(port = 43821, timeoutMs = 180_000): Promise<ManagedAuthCallback> {
  const nonce = randomBytes(32).toString('base64url');
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  let consumed = false;
  let expectedHost = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const code = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // The browser may not be launched yet when a bind error/cancel occurs.
  void code.catch(() => undefined);
  const finish = (value?: string) => {
    if (consumed) return;
    consumed = true; clearTimeout(timer); server.close(); server.closeIdleConnections();
    if (value) resolveCode(value); else rejectCode(new Error('Managed sign-in cancelled'));
  };
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.method !== 'GET' || request.headers.host !== expectedHost || consumed) {
      response.writeHead(400).end(); return;
    }
    let url: URL;
    try { url = new URL(request.url ?? '/', `http://${expectedHost}`); }
    catch { response.writeHead(400).end(); return; }
    if (url.origin !== `http://${expectedHost}`) { response.writeHead(400).end(); return; }
    if (url.pathname !== '/morpheus/auth/callback' || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== nonce) {
      response.writeHead(400).end(); return;
    }
    const values = url.searchParams.getAll('code');
    if (values.length !== 1 || !/^[a-zA-Z0-9._-]{1,2048}$/.test(values[0])) {
      response.writeHead(400).end(); finish(); return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Morpheus</title><p>Morpheus ✓</p>');
    finish(values[0]);
  });
  server.maxConnections = 8;
  server.headersTimeout = 5000; server.requestTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('Managed callback unavailable'); }
  expectedHost = `127.0.0.1:${address.port}`;
  timer = setTimeout(() => finish(), timeoutMs); timer.unref();
  return { redirectUrl: `http://${expectedHost}/morpheus/auth/callback?state=${nonce}`, code, cancel: () => finish() };
}
