import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('pinned OpenClaw ACP bootstrap compatibility', () => {
  it('accepts the paired owner environment, while CLI URL deliberately suppresses env auth', () => {
    const dist = join(process.cwd(), 'node_modules', 'openclaw', 'dist');
    const entry = readdirSync(dist).find((name) => name.startsWith('client-bootstrap-')
      && name.endsWith('.js')
      && readFileSync(join(dist, name), 'utf8').includes('export { resolveGatewayClientBootstrap,'));
    expect(entry, 'Requalify the ACP bootstrap when updating the pinned runtime').toBeTruthy();
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { resolveGatewayClientBootstrap } = await import(process.argv[1]);
      process.env.OPENCLAW_GATEWAY_URL = 'ws://127.0.0.1:23189';
      process.env.OPENCLAW_GATEWAY_TOKEN = 'synthetic-runtime-contract';
      delete process.env.OPENCLAW_GATEWAY_PASSWORD;
      const env = await resolveGatewayClientBootstrap({ config: {} });
      const cli = await resolveGatewayClientBootstrap({ config: {}, gatewayUrl: process.env.OPENCLAW_GATEWAY_URL });
      console.log(JSON.stringify({ url: env.url, authenticated: env.auth.token === process.env.OPENCLAW_GATEWAY_TOKEN,
        passwordAbsent: env.auth.password === undefined, cliDropsEnvAuth: cli.auth.token === undefined }));
    `, pathToFileURL(join(dist, entry!)).href], {
      encoding: 'utf8', timeout: 30_000,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE)$/i.test(key))),
    });
    expect(JSON.parse(output)).toEqual({ url: 'ws://127.0.0.1:23189', authenticated: true,
      passwordAbsent: true, cliDropsEnvAuth: true });
  });
});
