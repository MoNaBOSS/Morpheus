import { isAbsolute, dirname } from 'node:path';
import { mkdirSync, chmodSync } from 'node:fs';
import { z } from 'zod';
import { ManagedLedger } from './ledger';
import { createSupabaseIdentityVerifier } from './identity';
import { createManagedGateway } from './gateway';
import { createManagedHttpServer } from './server';
import { configuredManagedProviderRoutes } from './provider-routes';

/** Account-only until operator-evaluated provider routes/rates are configured. */
const config = z.object({
  MORPHEUS_AUTH_ORIGIN: z.string().url(),
  MORPHEUS_AUTH_PUBLISHABLE_KEY: z.string().min(1),
  MORPHEUS_LEDGER_PATH: z.string().refine(isAbsolute),
  MORPHEUS_MANAGED_PORT: z.coerce.number().int().min(1024).max(65535).default(43820),
}).safeParse(process.env);
if (!config.success) {
  process.stderr.write('Managed service requires a valid auth origin, publishable key, absolute ledger path and optional port.\n');
  process.exitCode = 1;
} else {
  try {
    const value = config.data;
    const identity = createSupabaseIdentityVerifier({ origin: value.MORPHEUS_AUTH_ORIGIN, publishableKey: value.MORPHEUS_AUTH_PUBLISHABLE_KEY });
    mkdirSync(dirname(value.MORPHEUS_LEDGER_PATH), { recursive: true, mode: 0o700 });
    const ledger = new ManagedLedger(value.MORPHEUS_LEDGER_PATH);
    chmodSync(value.MORPHEUS_LEDGER_PATH, 0o600);
    const routes = configuredManagedProviderRoutes(process.env);
    const server = createManagedHttpServer(createManagedGateway({ ledger, identity, routes, timeoutMs: 120_000 }));
    server.once('error', () => { ledger.close(); process.stderr.write('Managed listener could not start.\n'); process.exitCode = 1; });
    server.listen(value.MORPHEUS_MANAGED_PORT, '127.0.0.1', () => {
      process.stdout.write(`Managed service listening on 127.0.0.1:${value.MORPHEUS_MANAGED_PORT}; ${routes.size} configured inference routes; billing is not configured.\n`);
    });
    let stopping = false;
    const stop = () => {
      if (stopping) return; stopping = true;
      server.close(() => ledger.close()); server.closeIdleConnections();
      const timer = setTimeout(() => server.closeAllConnections(), 5000); timer.unref();
    };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch { process.stderr.write('Managed service configuration or storage could not be opened.\n'); process.exitCode = 1; }
}
