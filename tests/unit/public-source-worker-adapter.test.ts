import { describe, expect, it, vi } from 'vitest';
import { createPublicSourceWorkerAdapter, isPublicSourceAddress, resolvePublicSourceUrl, publicSourceText } from '@electron/services/public-source-worker-adapter';
import type { MorpheusWorkerRequest } from '@shared/morpheus/worker-types';

const worker = (url = 'https://example.com/start'): MorpheusWorkerRequest => ({
  v: 1, workerRunId: 'worker-1', objectiveRunId: 'objective-1', attemptId: 'attempt-1', planId: 'plan-1', stepId: 'read', cancellationGeneration: 1,
  operation: { kind: 'web.readPage', url },
  authority: { capabilityId: 'web.readPage', origins: [new URL(url).origin], service: 'public-https', tools: ['https.get'], providerRouteRef: 'local-public-http' },
  limits: { deadlineAt: new Date(Date.now() + 30_000).toISOString(), maxSteps: 4, maxOutputBytes: 1024, maxInputTokens: 0, maxOutputTokens: 0, maxCostUsd: 0 },
});
const publicDns = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
const textResponse = (body = '<title>Source &amp; Evidence</title><main>Actual page text.</main>') => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(body) });

describe('actual public source adapter boundaries', () => {
  it.each(['127.0.0.1', '10.0.0.1', '172.31.2.3', '192.168.1.3', '169.254.169.254', '100.64.0.1', '198.19.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '::1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', '2002:0808:0808::1', '2001:0000:1234::1', '2001:0db8::1', '3fff::1'])('rejects non-public/transition network address %s', (address) => {
    expect(isPublicSourceAddress(address)).toBe(false);
  });
  it.each(['8.8.8.8', '93.184.216.34', '2001:4860:4860::8888', '2606:4700:4700::1111'])('accepts public address %s', (address) => {
    expect(isPublicSourceAddress(address)).toBe(true);
  });
  it.each(['http://example.com', 'https://user:password@example.com', 'https://localhost', 'https://127.1', 'https://example.com:8443', 'file:///C:/secret', 'https://host.local', 'https://host.internal'])('rejects invalid source URL %s', (url) => {
    expect(() => resolvePublicSourceUrl(url)).toThrow();
  });
  it('revalidates DNS and pins the actual chosen public address for each same-origin redirect', async () => {
    const dns = vi.fn().mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]);
    const transport = vi.fn().mockResolvedValueOnce({ status: 302, headers: { location: '/final' }, body: Buffer.alloc(0) }).mockResolvedValueOnce(textResponse());
    const progress = vi.fn(async () => {});
    const result = await createPublicSourceWorkerAdapter({ resolveAddresses: dns, transport }).run(worker(), new AbortController().signal, progress);
    expect(transport.mock.calls.map((call) => [call[0].href, call[1].address])).toEqual([['https://example.com/start', '93.184.216.34'], ['https://example.com/final', '8.8.8.8']]);
    expect(result.source).toMatchObject({ originalUrl: 'https://example.com/start', finalUrl: 'https://example.com/final', title: 'Source & Evidence', location: 'body-text' });
    expect(result.source.excerpt).toContain('Actual page text.');
    expect(result.source.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.usage).toEqual({ status: 'known', inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });
  it('rejects a rebound/private DNS answer before a second connection', async () => {
    const dns = vi.fn().mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
    const transport = vi.fn().mockResolvedValue({ status: 302, headers: { location: '/rebound' }, body: Buffer.alloc(0) });
    await expect(createPublicSourceWorkerAdapter({ resolveAddresses: dns, transport }).run(worker(), new AbortController().signal, async () => {})).rejects.toThrow('network address');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(['https://evil.example/path', 'https://127.0.0.1/admin', 'http://example.com/insecure', 'file:///C:/secret'])('blocks redirect %s before requesting it', async (location) => {
    const transport = vi.fn().mockResolvedValue({ status: 302, headers: { location }, body: Buffer.alloc(0) });
    await expect(createPublicSourceWorkerAdapter({ resolveAddresses: publicDns, transport }).run(worker(), new AbortController().signal, async () => {})).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('cancels a stuck DNS lookup and discards its late result without making a request', async () => {
    let finish: (value: { address: string; family: number }[]) => void = () => {};
    const dns = vi.fn(() => new Promise<{ address: string; family: number }[]>((resolve) => { finish = resolve; }));
    const transport = vi.fn();
    const controller = new AbortController();
    const result = createPublicSourceWorkerAdapter({ resolveAddresses: dns, transport }).run(worker(), controller.signal, async () => {});
    await vi.waitFor(() => expect(dns).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    await expect(result).rejects.toThrow('Cancelled');
    finish([{ address: '8.8.8.8', family: 4 }]);
    await Promise.resolve();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    { status: 404, headers: { 'content-type': 'text/plain' }, body: Buffer.from('missing') },
    { status: 200, headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from('binary') },
    { status: 200, headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, body: Buffer.from('encoded') },
    { status: 200, headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment' }, body: Buffer.from('download') },
    { status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.alloc(512 * 1024 + 1, 'a') },
  ])('rejects unavailable/binary/encoded/download/oversized sources', async (response) => {
    await expect(createPublicSourceWorkerAdapter({ resolveAddresses: publicDns, transport: async () => response }).run(worker(), new AbortController().signal, async () => {})).rejects.toThrow();
  });
  it('bounds Unicode context and strips scripts and embedded instructions from executable markup', async () => {
    const payload = '<script>steal()</script><style>body{}</style><p>' + 'বাংলা '.repeat(500) + '</p>';
    const result = await createPublicSourceWorkerAdapter({ resolveAddresses: publicDns, transport: async () => textResponse(payload) }).run(worker(), new AbortController().signal, async () => {});
    expect(Buffer.byteLength(result.source.excerpt)).toBeLessThanOrEqual(1024);
    expect(result.source.truncated).toBe(true);
    expect(result.source.excerpt).not.toContain('steal');
    expect(publicSourceText(Buffer.from('&#x1f600; &amp; &unknown;'), 'text/plain').text).toBe('😀 & &unknown;');
  });
});
