import { describe, expect, it, vi } from 'vitest';
import { createTaskBrowserNetwork, publicBrowserUrl } from '@electron/services/task-browser/network';
import type { PublicResponse } from '@electron/services/public-source-worker-adapter';

function setup(response: Partial<PublicResponse> = {}) {
  const controller = new AbortController();
  const transport = vi.fn(async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<h1>Observed</h1>'), ...response }));
  const resolveAddresses = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
  const network = createTaskBrowserNetwork('https://example.com', controller.signal, { transport, resolveAddresses });
  return { network, controller, transport, resolveAddresses };
}

describe('task browser public network boundary', () => {
  it('pins public resolution and drops browser credentials and response authority', async () => {
    const { network, transport } = setup({ headers: { 'content-type': 'text/html', 'set-cookie': 'session=secret', refresh: '0;url=file:///x', 'content-security-policy': "script-src 'none'" } });
    const response = await network.handle(new Request('https://example.com/', { headers: { Cookie: 'private-cookie', Authorization: 'Bearer private-token' } }));
    expect(response.status).toBe(200);
    expect(transport.mock.calls[0]).toEqual([new URL('https://example.com/'), { address: '93.184.216.34', family: 4 }, expect.any(AbortSignal), 2 * 1024 * 1024]);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('refresh')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain("script-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("worker-src 'none'");
  });
  it.each(['http://example.com/', 'https://localhost/', 'https://127.0.0.1/', 'https://example.com:8443/', 'https://user:pass@example.com/', 'file:///c:/secret', 'https://example.com/?access_token=secret', 'https://example.com/?X-Amz-Signature=secret', 'https://elsewhere.com/'])('rejects unscoped address %s', async (url) => {
    const { network, transport } = setup();
    expect((await network.handle({ url, method: 'GET' } as Request)).status).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects mixed/private DNS and revalidates on the next request', async () => {
    const { network, resolveAddresses, transport } = setup();
    expect((await network.handle(new Request('https://example.com/'))).status).toBe(200);
    resolveAddresses.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    expect((await network.handle(new Request('https://example.com/next'))).status).toBe(403);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('permits only same-origin redirects without forwarding server cookies', async () => {
    const { network, transport } = setup({ status: 302, headers: { location: '/next', 'set-cookie': 'x=y' }, body: Buffer.alloc(0) });
    const response = await network.handle(new Request('https://example.com/'));
    expect(response.headers.get('location')).toBe('https://example.com/next');
    expect(response.headers.get('set-cookie')).toBeNull();
    transport.mockResolvedValue({ status: 302, headers: { location: 'https://other.com/' }, body: Buffer.alloc(0) });
    expect((await network.handle(new Request('https://example.com/'))).status).toBe(403);
  });
  it.each([
    { 'content-type': 'application/octet-stream' },
    { 'content-type': 'text/html', 'content-disposition': 'attachment; filename=a.html' },
    { 'content-type': 'text/html', 'content-encoding': 'gzip' },
  ])('denies downloads or unsupported encoding %j', async (headers) => {
    const { network } = setup({ headers });
    expect((await network.handle(new Request('https://example.com/'))).status).toBe(403);
  });
  it('bounds requests bytes and cancelled work', async () => {
    const { network, transport, controller } = setup({ body: Buffer.alloc(2 * 1024 * 1024) });
    for (let i = 0; i < 4; i++) expect((await network.handle(new Request('https://example.com/'))).status).toBe(200);
    expect((await network.handle(new Request('https://example.com/'))).status).toBe(403);
    expect(transport).toHaveBeenCalledTimes(4);
    controller.abort();
    expect((await network.handle(new Request('https://example.com/'))).status).toBe(403);
    const bounded = setup();
    for (let i = 0; i < 128; i++) await bounded.network.handle(new Request('https://example.com/'));
    expect((await bounded.network.handle(new Request('https://example.com/'))).status).toBe(403);
    expect(bounded.transport).toHaveBeenCalledTimes(128);
  });
  it('rejects state-changing methods before network dispatch', async () => {
    const { network, transport } = setup();
    expect((await network.handle(new Request('https://example.com/', { method: 'POST', body: 'data' }))).status).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  });
  it('does not reuse a previous successful response as evidence for a denied reload', async () => {
    const { network, resolveAddresses } = setup();
    await network.handle(new Request('https://example.com/'));
    expect(network.status('https://example.com/')).toBe(200);
    resolveAddresses.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await network.handle(new Request('https://example.com/'));
    expect(network.status('https://example.com/')).toBeUndefined();
  });
  it('does not rewrite ordinary public search queries', () => {
    expect(publicBrowserUrl('https://example.com/search?q=books#results').href).toBe('https://example.com/search?q=books');
  });
});
