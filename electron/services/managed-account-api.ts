import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import type { ManagedAccountSnapshot } from '@shared/morpheus/managed-types';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { createManagedClient } from './morpheus/managed/managed-client';
import { createManagedAuthSession } from './morpheus/managed/auth-session';
import { createManagedAuthHttp, requireHttpsOrigin } from './morpheus/managed/auth-http';
import { createManagedAuthCallback } from './morpheus/managed/auth-callback';
import { createProtectedManagedSessionStore } from './morpheus/managed/session-store';
import { createManagedRuntimeBridge, type ManagedRuntimeBridge } from './morpheus/managed/runtime-bridge';
import { createManagedServiceModeStore, type ManagedServiceMode } from './morpheus/managed/service-mode-store';

type ManagedAccountApi = CompleteHostServiceRegistry['managedAccount'] & {
  setMode(payload: { mode: ManagedServiceMode }): Promise<ManagedAccountSnapshot>;
};

export function createManagedAccountApi(options: {
  userDataDir: string;
  env: NodeJS.ProcessEnv;
  protection: Parameters<typeof createProtectedManagedSessionStore>[0]['protection'];
  openExternal(url: string): Promise<void>;
  fetch?: typeof fetch;
  /** Enable only after planner/conversation/voice composition is installed. */
  runtimeReady?: boolean;
}): { api: ManagedAccountApi; readonly runtime: ManagedRuntimeBridge | null; getRuntime(): ManagedRuntimeBridge | null; dispose(): void } {
  const mode = createManagedServiceModeStore(join(options.userDataDir, 'morpheus', 'managed-service-mode.json'));
  const failureRuntime = createManagedRuntimeBridge(createManagedClient({ sessions: {
    get: async () => null, set: async () => { throw new Error('Managed service not configured'); }, clear: async () => {},
  } }));
  const selectMode = (payload: { mode: ManagedServiceMode }) => {
    const next = z.object({ mode: z.enum(['byok', 'managed']) }).strict().parse(payload).mode;
    if (next === 'managed' && !options.runtimeReady) throw new Error('Managed runtime integration is not available yet');
    mode.set(next);
  };
  const empty = (): ManagedAccountSnapshot => ({ configured: false, signedIn: false, authState: 'idle', serviceMode: mode.get(), runtimeReady: false,
    access: { state: 'not-configured', account: null } });
  const unavailable = () => ({ success: false as const, error: 'not-configured' as const });
  const disabledRuntime = () => mode.get() === 'managed' ? failureRuntime : null;
  const disabled = { api: { status: empty, googleSignIn: unavailable, requestEmailCode: unavailable,
    verifyEmailCode: unavailable, cancelSignIn: empty, signOut: unavailable,
    setMode: async (payload: { mode: ManagedServiceMode }) => { selectMode(payload); failureRuntime.invalidate(); return empty(); } },
    get runtime() { return disabledRuntime(); }, getRuntime: disabledRuntime, dispose() { failureRuntime.invalidate(); } };
  const serviceOrigin = options.env.MORPHEUS_MANAGED_ORIGIN?.trim();
  const authOrigin = options.env.MORPHEUS_AUTH_ORIGIN?.trim();
  const publishableKey = options.env.MORPHEUS_AUTH_PUBLISHABLE_KEY?.trim();
  if (!serviceOrigin || !authOrigin || !publishableKey) return disabled;
  try {
    requireHttpsOrigin(serviceOrigin); requireHttpsOrigin(authOrigin);
    const port = z.coerce.number().int().min(1024).max(65535).parse(options.env.MORPHEUS_AUTH_CALLBACK_PORT ?? 43821);
    // A changed issuer/service must never receive a previous deployment's bearer.
    const scope = createHash('sha256').update(`${serviceOrigin}\n${authOrigin}`).digest('hex').slice(0, 24);
    const sessions = createProtectedManagedSessionStore({
      path: join(options.userDataDir, 'morpheus', `managed-session-${scope}.enc`), protection: options.protection,
    });
    const http = createManagedAuthHttp({ origin: authOrigin, publishableKey, fetch: options.fetch });
    const auth = createManagedAuthSession({ sessions, http, openExternal: options.openExternal,
      callback: () => createManagedAuthCallback(port) });
    const client = createManagedClient({ origin: serviceOrigin, sessions: { ...sessions, get: () => auth.session() }, fetch: options.fetch });
    const runtime = createManagedRuntimeBridge(client);
    const getRuntime = () => mode.get() === 'byok' ? null : mode.available() ? runtime : failureRuntime;
    const status = async (): Promise<ManagedAccountSnapshot> => {
      const access = await client.status();
      let signedIn = false;
      try { signedIn = Boolean(await sessions.get()); } catch { /* Surface access unavailable. */ }
      return { configured: true, signedIn, authState: auth.state(), access, serviceMode: mode.get(), runtimeReady: options.runtimeReady === true };
    };
    return { api: {
      status,
      googleSignIn: () => { client.invalidate(); return auth.google(); },
      requestEmailCode: (payload) => { client.invalidate(); return auth.requestEmail(payload); },
      verifyEmailCode: (payload) => auth.verifyEmail(payload),
      cancelSignIn: async () => { auth.cancel(); return status(); },
      signOut: () => { client.invalidate(); return auth.signOut(); },
      setMode: async (payload) => { selectMode(payload); client.invalidate(); return status(); },
    }, get runtime() { return getRuntime(); }, getRuntime, dispose: () => { client.invalidate(); auth.cancel(); } };
  } catch { return disabled; }
}
