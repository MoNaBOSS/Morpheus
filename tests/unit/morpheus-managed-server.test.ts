// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createManagedHttpServer } from '../../services/managed/server';
import { createManagedGateway } from '../../services/managed/gateway';
import { ManagedLedger } from '../../services/managed/ledger';

describe('managed HTTP listener', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => { for (const close of closers.splice(0)) await close(); });
  it('runs the actual gateway over HTTP without an authentication bypass', async () => {
    const ledger = new ManagedLedger(':memory:');
    const server = createManagedHttpServer(createManagedGateway({ ledger,
      identity: { async verify(token) { if (token !== 'fixture-token') throw new Error('invalid'); return { accountId: 'fixture-account' }; } }, routes: new Map() }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => new Promise<void>((resolve, reject) => { server.close((error) => { ledger.close(); if (error) reject(error); else resolve(); }); server.closeAllConnections(); }));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
    const origin = `http://127.0.0.1:${address.port}`;
    expect((await fetch(`${origin}/v1/account`)).status).toBe(401);
    const account = await fetch(`${origin}/v1/account`, { headers: { Authorization: 'Bearer fixture-token' } });
    expect(await account.json()).toMatchObject({ accountId: 'fixture-account', tier: 'basic', enabled: false });
    const execute = await fetch(`${origin}/v1/execute`, { method: 'POST', headers: {
      Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json',
    }, body: JSON.stringify({ requestId: 'r1', route: 'not-installed', input: {} }) });
    expect(execute.status).toBe(403);
    expect(await execute.json()).toEqual({ error: 'managed_route_unavailable' });
  });
});
