// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ManagedLedger } from '../../services/managed/ledger';
import { createManagedGateway, type ManagedRoute } from '../../services/managed/gateway';
import { createSupabaseIdentityVerifier } from '../../services/managed/identity';

describe('managed gateway boundary', () => {
  let ledger: ManagedLedger;
  const execute = vi.fn<ManagedRoute['execute']>();
  const inputSchema = z.object({ text: z.string().max(100) }).strict();
  const route: ManagedRoute = {
    feature: 'planning', parse: (input) => inputSchema.parse(input),
    quote: () => ({ maximumMicroUsd: 60, rateVersion: 'fixture-v1' }), execute,
  };
  const identity = { verify: vi.fn(async (token: string) => {
    if (token !== 'a' && token !== 'b') throw new Error('secret upstream detail');
    return { accountId: token };
  }) };
  const gateway = (timeoutMs?: number) => createManagedGateway({ ledger, identity,
    routes: new Map([['planner', route]]), timeoutMs });
  const payload = (requestId = 'r1') => ({ requestId, route: 'planner', input: { text: 'hello' } });
  const request = (body: unknown = payload(), token = 'a', signal?: AbortSignal) => new Request('https://managed.test/v1/execute', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal,
  });
  beforeEach(() => {
    ledger = new ManagedLedger(':memory:');
    ledger.grant({ grantId: 'trial:a', accountId: 'a', tier: 'trial', amountMicroUsd: 100,
      expiresAt: Date.now() + 60_000, features: ['planning'] });
    execute.mockReset(); identity.verify.mockClear();
    execute.mockResolvedValue({ output: { answer: 'done' }, costMicroUsd: 20, costEvidence: 'rate-estimate' });
  });
  afterEach(() => ledger.close());

  it('authenticates and accounts before returning output', async () => {
    const response = await gateway()(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ output: { answer: 'done' }, receipt: {
      state: 'settled', chargedMicroUsd: 20, costEvidence: 'rate-estimate' } });
    expect(ledger.status('a').allowance.spent).toBe(20);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('blocks unauthenticated or unentitled callers before dispatch', async () => {
    expect((await gateway()(request(payload(), 'invalid'))).status).toBe(401);
    expect((await gateway()(request(payload(), 'b'))).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects client account, entitlement, pricing and upstream overrides', async () => {
    for (const addition of [{ accountId: 'b' }, { tier: 'premium' }, { maximumMicroUsd: 0 }, { endpoint: 'https://evil.test' }]) {
      expect((await gateway()(request({ ...payload(), ...addition }))).status).toBe(400);
    }
    expect((await gateway()(request({ ...payload(), input: { text: 'hello', model: 'arbitrary' } }))).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('never dispatches the same request twice, including after completion', async () => {
    const handle = gateway();
    await handle(request());
    const replay = await handle(request());
    expect(await replay.json()).toMatchObject({ replay: true, receipt: { state: 'settled' } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('blocks changed content using the same request ID', async () => {
    const handle = gateway(); await handle(request());
    expect((await handle(request({ ...payload(), input: { text: 'changed' } }))).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('serializes overlapping reservations while the first request is running', async () => {
    let finish!: (value: Awaited<ReturnType<ManagedRoute['execute']>>) => void;
    execute.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const handle = gateway();
    const first = handle(request());
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect((await handle(request(payload('r2')))).status).toBe(402);
    const duplicate = await handle(request());
    expect(duplicate.status).toBe(202);
    finish({ output: 'done', costMicroUsd: 20, costEvidence: 'provider-reported' });
    expect((await first).status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
  });
  it('holds ambiguous failures and sanitizes errors', async () => {
    execute.mockRejectedValue(new Error('secret-token raw provider body'));
    const response = await gateway()(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret-token');
    expect(ledger.receipt('a', 'r1')?.state).toBe('uncertain');
    expect(ledger.status('a').allowance.available).toBe(40);
    expect((await gateway()(request())).status).toBe(202);
    expect(execute).toHaveBeenCalledOnce();
  });
  it('returns useful output with an honest unknown-cost hold', async () => {
    execute.mockResolvedValue({ output: 'done', costMicroUsd: null, costEvidence: null });
    expect(await (await gateway()(request())).json()).toMatchObject({ output: 'done', receipt: { state: 'uncertain', chargedMicroUsd: null } });
    expect(ledger.status('a').allowance.reserved).toBe(60);
  });
  it('bounds a hung adapter and retains uncertain cost', async () => {
    execute.mockImplementation(() => new Promise(() => undefined));
    expect((await gateway(10)(request())).status).toBe(502);
    expect(ledger.receipt('a', 'r1')?.state).toBe('uncertain');
  });
  it('releases a request cancelled before dispatch', async () => {
    const controller = new AbortController(); controller.abort();
    expect((await gateway()(request(payload(), 'a', controller.signal))).status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
    expect(ledger.status('a').allowance.available).toBe(100);
  });
  it('rejects unmediated routes and oversized payloads', async () => {
    expect((await gateway()(request({ ...payload(), route: 'plugin' }))).status).toBe(403);
    expect((await gateway()(request({ ...payload(), input: { text: 'x'.repeat(300_000) } }))).status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });
  it('isolates provider idempotency across accounts using the same client ID', async () => {
    ledger.grant({ grantId: 'trial:b', accountId: 'b', tier: 'trial', amountMicroUsd: 100,
      expiresAt: Date.now() + 60_000, features: ['planning'] });
    await gateway()(request()); await gateway()(request(payload(), 'b'));
    expect(execute.mock.calls[0][1].requestId).not.toBe(execute.mock.calls[1][1].requestId);
  });
  it('never dispatches when persistence is unavailable', async () => {
    vi.spyOn(ledger, 'reserve').mockImplementation(() => { throw new Error('disk unavailable'); });
    expect((await gateway()(request())).status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
  });
  it('keeps account/status and request receipts scoped to the authenticated user', async () => {
    await gateway()(request());
    const get = (path: string, token = 'a') => gateway()(new Request(`https://managed.test${path}`, { headers: { Authorization: `Bearer ${token}` } }));
    expect(await (await get('/v1/account')).json()).toMatchObject({ accountId: 'a', allowance: { spent: 20 }, billing: 'not-configured' });
    expect((await get('/v1/requests/r1', 'b')).status).toBe(404);
    expect((await get('/v1/billing/checkout')).status).toBe(503);
    expect((await get('/v1/billing/portal')).status).toBe(503);
  });
});

describe('hosted identity verification', () => {
  it('verifies with the configured HTTPS issuer without following redirects', async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ id: 'verified-user', email: 'private@example.test' }));
    const verifier = createSupabaseIdentityVerifier({ origin: 'https://auth.example.test', publishableKey: 'public-key', fetch: transport });
    expect(await verifier.verify('session-token')).toEqual({ accountId: 'verified-user' });
    expect(transport).toHaveBeenCalledWith(new URL('https://auth.example.test/auth/v1/user'), expect.objectContaining({
      redirect: 'error', headers: { apikey: 'public-key', Authorization: 'Bearer session-token' },
    }));
  });
  it('rejects insecure configuration and invalid tokens', async () => {
    expect(() => createSupabaseIdentityVerifier({ origin: 'http://auth.example.test', publishableKey: 'key' })).toThrow('invalid_auth_origin');
    const verifier = createSupabaseIdentityVerifier({ origin: 'https://auth.example.test', publishableKey: 'key',
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 401 })) });
    await expect(verifier.verify('bad')).rejects.toThrow('unauthenticated');
  });
});
