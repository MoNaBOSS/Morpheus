import { createHash } from 'node:crypto';

export interface RuntimeProviderSecretRef {
  source: 'env';
  provider: 'default';
  id: string;
}

/** A stable, provider-specific name that does not disclose the account id. */
export function getRuntimeProviderSecretEnvVar(runtimeProviderKey: string): string {
  const digest = createHash('sha256').update(runtimeProviderKey).digest('hex').slice(0, 24).toUpperCase();
  return `MORPHEUS_PROVIDER_KEY_${digest}`;
}

export function getRuntimeProviderSecretRef(runtimeProviderKey: string): RuntimeProviderSecretRef {
  return {
    source: 'env',
    provider: 'default',
    id: getRuntimeProviderSecretEnvVar(runtimeProviderKey),
  };
}
