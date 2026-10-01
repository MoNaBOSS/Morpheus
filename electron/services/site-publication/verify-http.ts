import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import type { MorpheusPublicationTarget } from '@shared/morpheus/publication-types';
import { isPublicSourceAddress, requestPinnedPublicSource, type PublicAddress, type PublicSourceTransport } from '../public-source-worker-adapter';
import { validatePublicationSnapshot, type PublicationSnapshot } from './snapshot';

/** Read-only HTTP acceptance, not merely a successful push or returned URL. */
export async function verifyPublishedSnapshot(target: MorpheusPublicationTarget, snapshot: PublicationSnapshot, signal: AbortSignal, dependencies: {
  resolveAddresses?: (host: string) => Promise<PublicAddress[]>;
  transport?: PublicSourceTransport;
} = {}): Promise<boolean> {
  validatePublicationSnapshot(snapshot);
  if (!/^[A-Za-z0-9-]{1,39}$/.test(target.owner) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(target.repository)
    || target.repository.includes('..') || !/^sites\/[a-z0-9][a-z0-9-]{0,47}$/.test(target.sitePath)) throw new Error('Invalid publication verification target.');
  const url = new URL(target.url);
  const prefix = target.repository.toLowerCase() === `${target.owner.toLowerCase()}.github.io` ? '/' : `/${target.repository}/`;
  if (url.origin !== `https://${target.owner.toLowerCase()}.github.io` || url.username || url.password || url.search || url.hash
    || url.pathname !== `${prefix}${target.sitePath}/`) throw new Error('Publication verification target changed.');
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  const resolve = dependencies.resolveAddresses ?? ((host: string) => lookup(host, { all: true, verbatim: true }));
  const transport = dependencies.transport ?? requestPinnedPublicSource;
  bounded.throwIfAborted();
  const addresses = await new Promise<PublicAddress[]>((done, fail) => {
    const abort = () => fail(new Error('Publication verification cancelled or timed out.'));
    bounded.addEventListener('abort', abort, { once: true });
    if (bounded.aborted) abort();
    void resolve(url.hostname).then(done, fail).finally(() => bounded.removeEventListener('abort', abort));
  });
  if (!addresses.length || addresses.some((entry) => !isPublicSourceAddress(entry.address))) throw new Error('Publication verification requires public addresses.');
  for (const file of snapshot.files) {
    bounded.throwIfAborted();
    const response = await transport(new URL(file.path, url), addresses[0], bounded, file.bytes + 1);
    bounded.throwIfAborted();
    const mediaType = response.headers['content-type']?.split(';')[0].trim().toLowerCase();
    const expectedType = file.path.endsWith('.html') ? ['text/html'] : file.path.endsWith('.css') ? ['text/css'] : file.path.endsWith('.js') ? ['text/javascript', 'application/javascript'] : ['application/json'];
    if (response.status !== 200 || !mediaType || !expectedType.includes(mediaType) || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity'
      || response.body.byteLength !== file.bytes || createHash('sha256').update(response.body).digest('hex') !== file.sha256) return false;
  }
  return true;
}
