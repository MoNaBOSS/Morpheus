import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ManagedFeature, ManagedIdentity, ManagedRequestReceipt } from '../../shared/morpheus/managed-types';
import { ManagedLedger } from './ledger';
import { canonicalJson, idSchema, ManagedError, moneySchema, readBoundedJson, requestSchema } from './validation';

export interface ManagedIdentityVerifier {
  /** Validate token with the configured issuer; never decode-and-trust a JWT. */
  verify(accessToken: string): Promise<ManagedIdentity>;
}

export interface ManagedRoute {
  feature: ManagedFeature;
  /** Validate allowed input fields. Endpoint, model, account and key are server-owned. */
  parse(input: unknown): unknown;
  /** Upper bound for ALL work, retries and modalities in one dispatch. */
  quote(input: unknown): { maximumMicroUsd: number; rateVersion: string };
  /** Adapter must enforce its quote, time/output bounds, and cancellation.
   * Unknown usage returns null; exceptions may already have incurred charges.
   * No raw upstream Response or credential-bearing errors may be returned.
   */
  execute(input: unknown, context: { requestId: string; signal: AbortSignal }): Promise<{
    output: unknown;
    costMicroUsd: number | null;
    costEvidence: NonNullable<ManagedRequestReceipt['costEvidence']> | null;
  }>;
}

export function createManagedGateway(options: {
  ledger: ManagedLedger;
  identity: ManagedIdentityVerifier;
  routes: ReadonlyMap<string, ManagedRoute>;
  timeoutMs?: number;
}) {
  const routes = new Map(options.routes);
  const timeoutMs = z.number().int().min(1).max(120_000).parse(options.timeoutMs ?? 30_000);
  const json = (data: unknown, status = 200) => Response.json(data, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

  return async (request: Request): Promise<Response> => {
    try {
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer [^\s]{1,8192}$/.test(authorization)) throw new ManagedError('unauthenticated', 401);
      let identity: ManagedIdentity;
      try {
        identity = await options.identity.verify(authorization.slice(7));
        idSchema.parse(identity.accountId);
      } catch { throw new ManagedError('unauthenticated', 401); }
      const path = new URL(request.url).pathname;
      if (request.method === 'GET' && path === '/v1/account') return json(options.ledger.status(identity.accountId));
      if (request.method === 'GET' && path.startsWith('/v1/requests/')) {
        const receipt = options.ledger.receipt(identity.accountId, idSchema.parse(path.slice('/v1/requests/'.length)));
        if (!receipt) throw new ManagedError('request_not_found', 404);
        return json({ receipt });
      }
      if (path === '/v1/billing/checkout' || path === '/v1/billing/portal') throw new ManagedError('billing_not_configured', 503);
      if (request.method !== 'POST' || path !== '/v1/execute') throw new ManagedError('route_not_found', 404);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ManagedError('json_required', 415);
      const payload = requestSchema.parse(await readBoundedJson(request.body));
      const route = routes.get(payload.route);
      if (!route) throw new ManagedError('managed_route_unavailable', 403);
      const input = route.parse(payload.input);
      const quote = z.object({ maximumMicroUsd: moneySchema.positive(), rateVersion: idSchema }).strict().parse(route.quote(input));
      const fingerprint = createHash('sha256').update(canonicalJson({ ...payload, ...quote })).digest('hex');
      let receipt = options.ledger.reserve({ accountId: identity.accountId,
        requestId: payload.requestId, objectiveId: payload.objectiveId, route: payload.route,
        fingerprint, feature: route.feature, ...quote });
      if (request.signal.aborted) {
        // Only this still-undispatched reservation can be released. If another
        // worker dispatched it, release rejects and never refunds that worker.
        if (receipt.state === 'reserved') options.ledger.releaseUndispatched(identity.accountId, payload.requestId);
        throw new ManagedError('request_cancelled', 409);
      }
      if (!options.ledger.dispatch(identity.accountId, payload.requestId)) {
        receipt = options.ledger.receipt(identity.accountId, payload.requestId)!;
        // Never store/replay raw prompt or output content in the billing ledger.
        return json({ receipt, replay: true }, receipt.state === 'settled' ? 200 : 202);
      }
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = AbortSignal.any([request.signal, deadline]);
      let onAbort: (() => void) | undefined;
      try {
        const cancelled = new Promise<never>((_, reject) => {
          onAbort = () => reject(new ManagedError('upstream_outcome_uncertain', 502));
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        });
        const result = await Promise.race([
          route.execute(input, {
            // Provider idempotency must also be isolated across accounts.
            requestId: createHash('sha256').update(`${identity.accountId}\n${payload.requestId}`).digest('hex'),
            signal,
          }), cancelled,
        ]);
        // Serialize/validate before settling so malformed output cannot leak
        // implementation details or turn missing usage into an implied zero.
        const output = z.json().parse(result.output);
        if (Buffer.byteLength(JSON.stringify(output), 'utf8') > 1024 * 1024) throw new ManagedError('upstream_output_too_large', 502);
        if (result.costMicroUsd === null) {
          options.ledger.uncertain(identity.accountId, payload.requestId);
          receipt = options.ledger.receipt(identity.accountId, payload.requestId)!;
        } else {
          if (!result.costEvidence) throw new ManagedError('missing_cost_evidence', 502);
          receipt = options.ledger.settle(identity.accountId, payload.requestId, result.costMicroUsd, result.costEvidence);
        }
        return json({ output, receipt });
      } catch {
        options.ledger.uncertain(identity.accountId, payload.requestId);
        throw new ManagedError('upstream_outcome_uncertain', 502);
      } finally {
        if (onAbort) signal.removeEventListener('abort', onAbort);
      }
    } catch (error) {
      if (error instanceof ManagedError) return json({ error: error.code }, error.status);
      if (error instanceof z.ZodError) return json({ error: 'invalid_request' }, 400);
      return json({ error: 'service_unavailable' }, 503);
    }
  };
}
