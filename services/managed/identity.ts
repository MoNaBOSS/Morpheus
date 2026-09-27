import { z } from 'zod';
import type { ManagedIdentityVerifier } from './gateway';
import { idSchema, ManagedError, readBoundedJson } from './validation';

/** Supabase Auth user verification, usable for Google and email sessions.
 * Browser sign-in/PKCE issuance is configured separately; this never treats a
 * local provider OAuth account as a Morpheus identity.
 */
export function createSupabaseIdentityVerifier(options: {
  origin: string;
  publishableKey: string;
  fetch?: typeof fetch;
}): ManagedIdentityVerifier {
  const origin = new URL(options.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new ManagedError('invalid_auth_origin');
  }
  if (!options.publishableKey.trim()) throw new ManagedError('missing_auth_configuration');
  const transport = options.fetch ?? fetch;
  return {
    async verify(accessToken) {
      const response = await transport(new URL('/auth/v1/user', origin), {
        headers: { apikey: options.publishableKey, Authorization: `Bearer ${accessToken}` },
        redirect: 'error', signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ManagedError('unauthenticated', 401);
      }
      const user = z.object({ id: idSchema }).parse(await readBoundedJson(response.body, 64 * 1024));
      return { accountId: user.id };
    },
  };
}
