import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ request: transport.request, default: { request: transport.request } }));
import { requestPinnedPublicSource } from '@electron/services/public-source-worker-adapter';

function response(body: string, override: Record<string, unknown> = {}) {
  const incoming = new EventEmitter() as EventEmitter & { headers: Record<string, string>; statusCode: number; destroy: ReturnType<typeof vi.fn> };
  incoming.headers = { 'content-type': 'text/plain' };
  incoming.statusCode = 200;
  incoming.destroy = vi.fn((error?: Error) => { if (error) incoming.emit('error', error); });
  Object.assign(incoming, override);
  return { incoming, write() { incoming.emit('data', Buffer.from(body)); incoming.emit('end'); } };
}
beforeEach(() => transport.request.mockReset());
describe('production DNS-pinned HTTPS transport', () => {
  it('keeps certificate hostname while using only the validated address and no reused agent/cookies/auth', async () => {
    const page = response('observed text');
    const client = new EventEmitter() as EventEmitter & { end: () => void };
    client.end = () => { const listener = transport.request.mock.calls[0][2]; listener(page.incoming); page.write(); };
    transport.request.mockReturnValue(client);
    const signal = new AbortController().signal;
    const result = await requestPinnedPublicSource(new URL('https://example.com/read'), { address: '8.8.8.8', family: 4 }, signal, 1024);
    const [url, options] = transport.request.mock.calls[0];
    expect(url.hostname).toBe('example.com');
    expect(options).toMatchObject({ method: 'GET', agent: false, signal, headers: { 'Accept-Encoding': 'identity' } });
    expect(options.rejectUnauthorized).not.toBe(false);
    expect(Object.keys(options.headers)).not.toContain('Cookie');
    expect(Object.keys(options.headers)).not.toContain('Authorization');
    const pinned = vi.fn(); options.lookup('example.com', {}, pinned);
    expect(pinned).toHaveBeenCalledExactlyOnceWith(null, '8.8.8.8', 4);
    const familySelection = vi.fn(); options.lookup('example.com', { all: true }, familySelection);
    expect(familySelection).toHaveBeenCalledExactlyOnceWith(null, [{ address: '8.8.8.8', family: 4 }]);
    expect(result.body.toString()).toBe('observed text');
  });
  it('rejects a body over the bound and destroys the stream', async () => {
    const page = response('too much content');
    const client = new EventEmitter() as EventEmitter & { end: () => void };
    client.end = () => { transport.request.mock.calls[0][2](page.incoming); page.write(); };
    transport.request.mockReturnValue(client);
    await expect(requestPinnedPublicSource(new URL('https://example.com'), { address: '8.8.8.8', family: 4 }, new AbortController().signal, 4)).rejects.toThrow('bounded');
    expect(page.incoming.destroy).toHaveBeenCalledTimes(1);
  });
  it('closes redirect body without auto following another origin', async () => {
    const page = response('ignored', { statusCode: 302, headers: { location: 'https://other.example' } });
    const client = new EventEmitter() as EventEmitter & { end: () => void };
    client.end = () => transport.request.mock.calls[0][2](page.incoming);
    transport.request.mockReturnValue(client);
    const result = await requestPinnedPublicSource(new URL('https://example.com'), { address: '8.8.8.8', family: 4 }, new AbortController().signal, 4);
    expect(result.body.length).toBe(0);
    expect(transport.request).toHaveBeenCalledTimes(1);
    expect(page.incoming.destroy).toHaveBeenCalledTimes(1);
  });
});
