import { createServer } from 'node:http';
import { Readable } from 'node:stream';

/** A loopback listener for a single-host pilot behind a TLS reverse proxy.
 * No development authentication bypass. The same gateway verifies every request.
 */
export function createManagedHttpServer(handle: (request: Request) => Promise<Response>) {
  const server = createServer(async (incoming, outgoing) => {
    const controller = new AbortController();
    incoming.once('aborted', () => controller.abort());
    outgoing.once('close', () => { if (!outgoing.writableEnded) controller.abort(); });
    const timer = setTimeout(() => { controller.abort(); incoming.destroy(); outgoing.destroy(); }, 125_000);
    timer.unref();
    try {
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) { outgoing.writeHead(400).end(); return; }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value);
      }
      const method = incoming.method ?? 'GET';
      const request = new Request(new URL(incoming.url, 'http://127.0.0.1').toString(), {
        method, headers, signal: controller.signal,
        ...(method === 'GET' || method === 'HEAD' ? {} : { body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: 'half' }),
      } as RequestInit);
      const response = await handle(request);
      if (outgoing.destroyed) return;
      response.headers.forEach((value, name) => outgoing.setHeader(name, value));
      outgoing.writeHead(response.status);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      outgoing.end('{"error":"service_unavailable"}');
    } finally { clearTimeout(timer); }
  });
  server.maxConnections = 64;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5000;
  return server;
}
