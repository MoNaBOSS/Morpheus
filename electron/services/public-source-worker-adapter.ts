/** Public HTTPS retrieval: every connection resolves, validates and pins its IP. */
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import type { MorpheusWorkerRequest, MorpheusWorkerOutcome, MorpheusWorkerProgress } from '@shared/morpheus/worker-types';

export type PublicAddress = { address: string; family: number };
export type PublicResponse = { status: number; headers: Record<string, string | undefined>; body: Buffer };
export type PublicSourceTransport = (url: URL, address: PublicAddress, signal: AbortSignal, maxBytes: number) => Promise<PublicResponse>;

/** Conservative globally routable unicast allowlist; transition/mapped IPv6 denied. */
export function isPublicSourceAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168
      || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)
      || a === 192 && b === 0 || a === 192 && b === 88 && c === 99
      || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (isIP(address) !== 6) return false;
  const normalized = address.toLowerCase();
  const [first, second] = normalized.split(':').map((part) => parseInt(part || '0', 16));
  // Only 2000::/3 global unicast; exclude transition, documentation and benchmark ranges.
  return (first & 0xe000) === 0x2000 && first !== 0x2002 && first !== 0x3fff
    && !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}

export function resolvePublicSourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443'
    || url.hostname.length > 253 || url.href.length > 2048) throw new Error('A public HTTPS URL without credentials is required.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || host.endsWith('.') || !host.includes('.') && !isIP(host)
    || isIP(host) && !isPublicSourceAddress(host)) throw new Error('Private and local targets are unavailable for public research.');
  url.hash = '';
  return url;
}

export const requestPinnedPublicSource: PublicSourceTransport = (url, address, signal, maxBytes) => new Promise((resolve, reject) => {
  const connection = request(url, {
    method: 'GET', signal, agent: false,
    headers: { Accept: 'text/html, text/plain', 'Accept-Encoding': 'identity', 'User-Agent': 'Morpheus-PublicReader/1.0' },
    // The TLS hostname is kept for SNI/certificate verification; DNS is never repeated.
    lookup: (_host, options, callback) => options.all
      ? callback(null, [{ address: address.address, family: address.family }])
      : callback(null, address.address, address.family),
  }, (response) => {
    const status = response.statusCode ?? 0;
    const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value]));
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.destroy();
      resolve({ status, headers, body: Buffer.alloc(0) });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) { response.destroy(new Error('The source exceeds the bounded retrieval size.')); return; }
      chunks.push(chunk);
    });
    response.on('error', reject);
    response.on('aborted', () => reject(new Error('The source connection was interrupted.')));
    response.on('end', () => resolve({ status, headers, body: Buffer.concat(chunks) }));
  });
  connection.on('error', reject);
  connection.end();
});

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d{1,7}|#x[0-9a-f]{1,6});/gi, (entity) => {
    const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = parseInt(entity.slice(entity[2].toLowerCase() === 'x' ? 3 : 2, -1), entity[2].toLowerCase() === 'x' ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
  });
}

/** Extraction only: remote markup is never executed or treated as instructions. */
export function publicSourceText(body: Buffer, contentType: string): { title: string; text: string } {
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(body);
  const html = contentType.startsWith('text/html');
  const title = html ? decodeEntities(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  const cleaned = html ? raw.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ') : raw;
  return { title, text: Array.from(decodeEntities(cleaned)).filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 || [9, 10, 13].includes(code);
  }).join('').replace(/\s+/g, ' ').trim() };
}

export function createPublicSourceWorkerAdapter(options: {
  resolveAddresses?: (host: string) => Promise<PublicAddress[]>;
  transport?: PublicSourceTransport;
  now?: () => Date;
} = {}) {
  const resolveAddresses = options.resolveAddresses ?? ((host: string) => lookup(host, { all: true, verbatim: true }));
  const transport = options.transport ?? requestPinnedPublicSource;
  const abortable = <T>(operation: Promise<T>, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Worker cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
  return {
    async run(worker: MorpheusWorkerRequest, signal: AbortSignal, progress: (entry: MorpheusWorkerProgress) => Promise<void>): Promise<MorpheusWorkerOutcome> {
      if (worker.operation.kind !== 'web.readPage' || worker.authority.service !== 'public-https'
        || worker.authority.tools.length !== 1 || worker.authority.tools[0] !== 'https.get'
        || worker.authority.origins.length !== 1) throw new Error('Unsupported worker authority.');
      const original = resolvePublicSourceUrl(worker.operation.url);
      const origin = original.origin;
      if (worker.authority.origins[0] !== origin) throw new Error('The worker origin does not match its authority.');
      let current = original;
      let sequence = 0;
      for (let step = 0; step < worker.limits.maxSteps; step += 1) {
        signal.throwIfAborted();
        await progress({ workerRunId: worker.workerRunId, cancellationGeneration: worker.cancellationGeneration, sequence: ++sequence, phase: 'retrieving' });
        const host = current.hostname.replace(/^\[|\]$/g, '');
        const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await abortable(resolveAddresses(host), signal);
        signal.throwIfAborted();
        if (!addresses.length || addresses.some((entry) => !isPublicSourceAddress(entry.address))) throw new Error('The source resolved to an unavailable network address.');
        const response = await transport(current, addresses[0], signal, 512 * 1024);
        signal.throwIfAborted();
        if (response.body.byteLength > 512 * 1024) throw new Error('The source exceeds the bounded retrieval size.');
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.headers.location) throw new Error('The source redirect has no destination.');
          const redirected = resolvePublicSourceUrl(new URL(response.headers.location, current).href);
          if (redirected.origin !== origin) throw new Error('The source redirected beyond the approved origin.');
          current = redirected;
          continue;
        }
        const contentType = (response.headers['content-type'] ?? '').toLowerCase();
        if (response.status < 200 || response.status >= 300) throw new Error(`The source is unavailable (HTTP ${response.status}).`);
        if (!/^text\/(?:html|plain)(?:;|$)/.test(contentType) || response.headers['content-disposition']?.toLowerCase().includes('attachment')
          || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw new Error('The source is not an uncompressed public text page.');
        const charset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/)?.[1];
        if (charset && !['utf-8', 'utf8', 'us-ascii', 'ascii'].includes(charset)) throw new Error('The source text encoding is unsupported.');
        const extracted = publicSourceText(response.body, contentType);
        if (!extracted.text) throw new Error('The source contains no retrievable text.');
        // UTF-8 truncation keeps transport and model-context limits aligned.
        const allText = Buffer.from(extracted.text, 'utf8');
        const excerpt = allText.subarray(0, worker.limits.maxOutputBytes).toString('utf8').replace(/\uFFFD$/, '');
        const source = {
          originalUrl: original.href, finalUrl: current.href, title: extracted.title || current.hostname,
          retrievedAt: (options.now?.() ?? new Date()).toISOString(), excerpt, location: 'body-text' as const,
          contentSha256: createHash('sha256').update(response.body).digest('hex'), bytes: response.body.byteLength,
          truncated: allText.byteLength > worker.limits.maxOutputBytes,
        };
        await progress({ workerRunId: worker.workerRunId, cancellationGeneration: worker.cancellationGeneration, sequence: sequence + 1, phase: 'verified' });
        return { workerRunId: worker.workerRunId, source, effect: 'none', usage: { status: 'known', inputTokens: 0, outputTokens: 0, costUsd: 0 } };
      }
      throw new Error('The source exceeded its redirect/step limit.');
    },
  };
}
