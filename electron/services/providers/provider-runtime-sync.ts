import type { GatewayManager } from '../../gateway/manager';
import { createHash } from 'node:crypto';
import { getProviderAccount, listProviderAccounts } from './provider-store';
import { getProviderSecret } from '../secrets/secret-store';
import type { ProviderConfig } from '../../utils/secure-storage';
import { getAllProviders, getApiKey, getDefaultProvider, getProvider } from '../../utils/secure-storage';
import { getProviderConfig, getProviderDefaultModel } from '../../utils/provider-registry';
import { normalizeOpenClawModelId } from '../../utils/provider-keys';
import {
  ensureAnthropicMessagesModelMaxTokens,
  ensureOpenClawProviderAgentRuntimePins,
  migrateAllAgentAuthProfilesToSqlite,
  pruneInvalidApiProviderEntries,
  removeProviderFromOpenClaw,
  removeProviderKeyFromOpenClaw,
  removeAppOwnedProviderRuntimeKeyRefs,
  saveOAuthTokenToOpenClaw,
  activateOpenClawOAuthProfile,
  saveProviderKeyRefToOpenClaw,
  OPENAI_CODEX_OAUTH_PROVIDER_CONFIG,
  setOpenClawDefaultModel,
  setOpenClawDefaultModelWithOverride,
  syncProviderConfigToOpenClaw,
  updateAgentModelProvider,
  updateSingleAgentModelProvider,
  getProviderApiKeyFromOpenClaw,
} from '../../utils/openclaw-auth';
import {
  piAiModelsJsonModelEntry,
  type PiAiModelCostRates,
} from '../../shared/pi-ai-model-cost';
import { logger } from '../../utils/logger';
import { listAgentsSnapshot } from '../../utils/agent-config';
import { getRuntimeProviderSecretEnvVar, getRuntimeProviderSecretRef } from './provider-runtime-secret-ref';
import { loadActiveRuntimeProviderAccounts, selectActiveRuntimeProviderAccounts } from './active-runtime-provider-selection';
import { reconcileAppOwnedProviderModelKeysBeforeLaunch } from '../../gateway/provider-model-key-reconciliation';

/** OpenClaw Codex OAuth hooks only apply to the canonical `openai` provider id. */
const OPENAI_OAUTH_RUNTIME_PROVIDER = 'openai';
const OPENAI_OAUTH_DEFAULT_MODEL_REF = `${OPENAI_OAUTH_RUNTIME_PROVIDER}/gpt-5.6-luna`;

/**
 * Provider types that are not in the built-in provider registry (no `providerConfig.api`).
 * They require explicit api-protocol defaulting to `openai-completions`.
 */
function isUnregisteredProviderType(type: string): boolean {
  return type === 'custom' || type === 'ollama';
}

type RuntimeProviderSyncContext = {
  runtimeProviderKey: string;
  meta: ReturnType<typeof getProviderConfig>;
  api: string;
};

function normalizeProviderBaseUrl(
  config: ProviderConfig,
  baseUrl?: string,
  apiProtocol?: string,
): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  const normalized = baseUrl.trim().replace(/\/+$/, '');

  if (config.type === 'minimax-portal' || config.type === 'minimax-portal-cn') {
    return normalized.replace(/\/v1$/, '').replace(/\/anthropic$/, '').replace(/\/$/, '') + '/anthropic';
  }

  if (isUnregisteredProviderType(config.type)) {
    const protocol = apiProtocol || config.apiProtocol || 'openai-completions';
    if (protocol === 'openai-responses') {
      return normalized.replace(/\/responses?$/i, '');
    }
    if (protocol === 'openai-completions') {
      return normalized.replace(/\/chat\/completions$/i, '');
    }
    if (protocol === 'anthropic-messages') {
      return normalized.replace(/\/v1\/messages$/i, '').replace(/\/messages$/i, '');
    }
  }

  return normalized;
}

function shouldUseExplicitDefaultOverride(config: ProviderConfig, runtimeProviderKey: string): boolean {
  return Boolean(config.baseUrl || config.apiProtocol || runtimeProviderKey !== config.type);
}

export function getOpenClawProviderKey(type: string, providerId: string): string {
  if (isUnregisteredProviderType(type)) {
    // If the providerId is already a runtime key (e.g. re-seeded from openclaw.json
    // as "custom-XXXXXXXX"), return it directly to avoid double-hashing.
    const prefix = `${type}-`;
    if (providerId.startsWith(prefix)) {
      const tail = providerId.slice(prefix.length);
      if (tail.length === 8 && !tail.includes('-')) {
        return providerId;
      }
    }
    const suffix = providerId.replace(/-/g, '').slice(0, 8);
    return `${type}-${suffix}`;
  }
  if (type === 'minimax-portal-cn') {
    return 'minimax-portal';
  }
  // OpenClaw Z.AI provider key is always `zai` (Global UI vendor aliases here).
  if (type === 'zai-global') {
    return 'zai';
  }
  return type;
}

async function resolveRuntimeProviderKey(config: ProviderConfig): Promise<string> {
  const account = await getProviderAccount(config.id);
  if (account?.authMode === 'oauth_browser' && config.type === 'openai') {
    return OPENAI_OAUTH_RUNTIME_PROVIDER;
  }
  return getOpenClawProviderKey(config.type, config.id);
}

async function getBrowserOAuthRuntimeProvider(config: ProviderConfig): Promise<string | null> {
  const account = await getProviderAccount(config.id);
  if (account?.authMode !== 'oauth_browser') {
    return null;
  }

  const secret = await getProviderSecret(config.id);
  if (secret?.type !== 'oauth') {
    return null;
  }

  if (config.type === 'openai') {
    return OPENAI_OAUTH_RUNTIME_PROVIDER;
  }
  return null;
}

export function getProviderModelRef(config: ProviderConfig): string | undefined {
  const providerKey = getOpenClawProviderKey(config.type, config.id);
  const modelId = normalizeRuntimeModelId(providerKey, config.model || getProviderDefaultModel(config.type), config.id);
  return modelId ? `${providerKey}/${modelId}` : undefined;
}

export async function getProviderFallbackModelRefs(config: ProviderConfig): Promise<string[]> {
  const allProviders = await getAllProviders();
  const providerMap = new Map(allProviders.map((provider) => [provider.id, provider]));
  const seen = new Set<string>();
  const results: string[] = [];
  const providerKey = getOpenClawProviderKey(config.type, config.id);

  for (const fallbackModel of config.fallbackModels ?? []) {
    const normalizedModel = fallbackModel.trim();
    if (!normalizedModel) continue;

    const modelRef = `${providerKey}/${normalizeRuntimeModelId(providerKey, normalizedModel, config.id)}`;

    if (seen.has(modelRef)) continue;
    seen.add(modelRef);
    results.push(modelRef);
  }

  for (const fallbackId of config.fallbackProviderIds ?? []) {
    if (!fallbackId || fallbackId === config.id) continue;

    const fallbackProvider = providerMap.get(fallbackId);
    if (!fallbackProvider) continue;

    const modelRef = getProviderModelRef(fallbackProvider);
    if (!modelRef || seen.has(modelRef)) continue;

    seen.add(modelRef);
    results.push(modelRef);
  }

  return results;
}

export async function syncProviderApiKeyToRuntime(
  providerType: string,
  providerId: string,
  apiKey: string,
  previousKey?: string,
  gatewayManager?: GatewayManager,
): Promise<void> {
  if (gatewayManager) {
    return deliverProviderRuntimeConfiguration(gatewayManager, async () => {
      const currentKey = await getApiKey(providerId);
      if (currentKey) await syncProviderApiKeyToRuntime(providerType, providerId, currentKey, previousKey);
    });
  }
  const ock = getOpenClawProviderKey(providerType, providerId);
  const selected = (await loadActiveRuntimeProviderAccounts()).get(ock);
  if (selected && selected.account.id !== providerId) return;
  await saveProviderKeyRefToOpenClaw(
    ock,
    getRuntimeProviderSecretEnvVar(ock),
    [...(selected?.verifiedKeys ?? []), apiKey, previousKey].filter((key): key is string => Boolean(key)),
  );
  // The key-only Settings route must also replace a legacy literal key in
  // models.providers; saving only the auth profile would leave that copy.
  const provider = await getProvider(providerId);
  if (provider) {
    const context = await resolveRuntimeSyncContext(provider);
    if (context) await syncRuntimeProviderConfig(provider, context, true);
    if (await getDefaultProvider() === providerId) {
      await syncDefaultProviderToRuntime(providerId);
    } else {
      await syncAgentModelsToRuntime();
    }
  }
}

/** No account data or credentials leave Main. The digest is only a race guard
 * tying a selected endpoint/model/default to the credential delivered at launch. */
async function runtimeSelectionFingerprint(): Promise<string> {
  const selected = await loadActiveRuntimeProviderAccounts();
  const configs = await getAllProviders();
  const defaultId = await getDefaultProvider();
  return createHash('sha256').update(JSON.stringify({
    defaultId,
    configs: [...configs].sort((left, right) => left.id.localeCompare(right.id)),
    selected: [...selected].sort(([left], [right]) => left.localeCompare(right))
      .map(([runtimeKey, { account, key }]) => ({ runtimeKey, account, key })),
  })).digest('hex');
}

async function deliverProviderRuntimeConfiguration(
  gatewayManager: GatewayManager,
  deliver: () => Promise<void>,
): Promise<void> {
  const delivered = await gatewayManager.deliverProviderConfiguration(async (staged) => {
    // Metadata can change while this delivery waits behind another request.
    // Resolve the current selection inside the serialized stage, then validate
    // it after writes and immediately before spawning the fresh child.
    const fingerprint = await runtimeSelectionFingerprint();
    await deliver();
    if (staged) await syncSelectedProviderConfigurationToRuntime();
    return async () => fingerprint === await runtimeSelectionFingerprint();
  });
  if (!delivered) throw new Error('Provider key saved; Gateway restart with the updated environment is required');
}

/** Re-select surviving accounts and retire the deleted credential's child env. */
export async function finishProviderSecretDeletionToRuntime(gatewayManager?: GatewayManager): Promise<void> {
  if (gatewayManager) {
    return deliverProviderRuntimeConfiguration(gatewayManager, syncSelectedProviderConfigurationToRuntime);
  }
  await syncSelectedProviderConfigurationToRuntime();
}

async function syncSelectedProviderConfigurationToRuntime(): Promise<void> {
  await syncAllProviderAuthToRuntime();
  const selected = await loadActiveRuntimeProviderAccounts();
  // A removed key can select a surviving sibling in the same runtime slot.
  // Deliver that sibling's endpoint/model before launching with its credential.
  for (const { account, key } of selected.values()) {
    const config = await getProvider(account.id);
    if (!config) continue;
    const browserOAuthProvider = await getBrowserOAuthRuntimeProvider(config);
    if (browserOAuthProvider) {
      await syncProviderConfigToOpenClaw(browserOAuthProvider,
        normalizeRuntimeModelId(browserOAuthProvider, config.model, config.id),
        OPENAI_CODEX_OAUTH_PROVIDER_CONFIG);
      continue;
    }
    const context = await resolveRuntimeSyncContext(config);
    if (!context) continue;
    await syncRuntimeProviderConfig(config, context, Boolean(key));
    await syncCustomProviderAgentModel(config, context.runtimeProviderKey, Boolean(key));
  }
  const defaultId = await getDefaultProvider();
  const defaultConfig = defaultId ? await getProvider(defaultId) : null;
  const activeDefault = defaultConfig
    ? selected.get(await resolveRuntimeProviderKey(defaultConfig)) : undefined;
  if (activeDefault) {
    await syncDefaultProviderToRuntime(activeDefault.account.id);
  } else {
    await syncAgentModelsToRuntime();
  }
}

async function hasEnabledRuntimeSibling(providerId: string, runtimeProviderKey: string): Promise<boolean> {
  return (await listProviderAccounts()).some((account) => account.id !== providerId
    && account.enabled !== false
    && getOpenClawProviderKey(account.vendorId, account.id) === runtimeProviderKey);
}

export async function syncAllProviderAuthToRuntime(): Promise<void> {
  await migrateAllAgentAuthProfilesToSqlite();
  const selected = await loadActiveRuntimeProviderAccounts();
  for (const [runtimeProviderKey, { account, key, verifiedKeys }] of selected) {
    if (verifiedKeys?.size) {
      await saveProviderKeyRefToOpenClaw(runtimeProviderKey, getRuntimeProviderSecretEnvVar(runtimeProviderKey),
        [...verifiedKeys], undefined, { activate: Boolean(key) });
    }
    const secret = await getProviderSecret(account.id);
    if (secret?.type === 'oauth') {
      await saveOAuthTokenToOpenClaw(runtimeProviderKey, {
        access: secret.accessToken,
        refresh: secret.refreshToken,
        expires: secret.expiresAt,
        email: secret.email,
        projectId: secret.subject,
      }, undefined, { onlyIfMissing: true, activate: false });
      await activateOpenClawOAuthProfile(runtimeProviderKey);
      await removeAppOwnedProviderRuntimeKeyRefs(runtimeProviderKey, getRuntimeProviderSecretEnvVar(runtimeProviderKey));
    }
  }
}

async function syncProviderSecretToRuntime(
  config: ProviderConfig,
  runtimeProviderKey: string,
  apiKey: string | undefined,
  previousKey?: string,
): Promise<boolean> {
  const secret = await getProviderSecret(config.id);
  if (apiKey !== undefined) {
    const trimmedKey = apiKey.trim();
    if (trimmedKey) {
      await saveProviderKeyRefToOpenClaw(runtimeProviderKey, getRuntimeProviderSecretEnvVar(runtimeProviderKey),
        [trimmedKey, previousKey].filter((key): key is string => Boolean(key)));
      return true;
    } else {
      // An explicit empty string means the caller wants to clear the key.
      // Mirror that intent into OpenClaw auth-profiles so the gateway no
      // longer authenticates with the stale value (matches the explicit
      // delete branch in the legacy /api/providers/:id PUT handler).
      await removeProviderKeyFromOpenClaw(runtimeProviderKey, undefined, previousKey);
    }
    return false;
  }

  if (secret?.type === 'api_key') {
    await saveProviderKeyRefToOpenClaw(runtimeProviderKey, getRuntimeProviderSecretEnvVar(runtimeProviderKey), [secret.apiKey, previousKey].filter((key): key is string => Boolean(key)));
    return true;
  }

  if (secret?.type === 'oauth') {
    await saveOAuthTokenToOpenClaw(runtimeProviderKey, {
      access: secret.accessToken,
      refresh: secret.refreshToken,
      expires: secret.expiresAt,
      email: secret.email,
      projectId: secret.subject,
    }, undefined, { onlyIfMissing: true });
    return false;
  }

  if (secret?.type === 'local' && secret.apiKey) {
    await saveProviderKeyRefToOpenClaw(runtimeProviderKey, getRuntimeProviderSecretEnvVar(runtimeProviderKey), [secret.apiKey, previousKey].filter((key): key is string => Boolean(key)));
    return true;
  }
  return false;
}

async function resolveRuntimeSyncContext(config: ProviderConfig): Promise<RuntimeProviderSyncContext | null> {
  const runtimeProviderKey = await resolveRuntimeProviderKey(config);
  const meta = getProviderConfig(config.type);
  const api = config.apiProtocol || (isUnregisteredProviderType(config.type) ? 'openai-completions' : meta?.api);
  if (!api) {
    return null;
  }

  return {
    runtimeProviderKey,
    meta,
    api,
  };
}

async function syncRuntimeProviderConfig(
  config: ProviderConfig,
  context: RuntimeProviderSyncContext,
  hasStaticKey: boolean,
): Promise<void> {
  const modelId = normalizeRuntimeModelId(context.runtimeProviderKey, config.model, config.id);
  await syncProviderConfigToOpenClaw(context.runtimeProviderKey, modelId, {
    baseUrl: normalizeProviderBaseUrl(config, config.baseUrl || context.meta?.baseUrl, context.api),
    api: context.api,
    apiKeyEnv: context.meta?.apiKeyEnv,
    apiKeyRef: hasStaticKey ? getRuntimeProviderSecretRef(context.runtimeProviderKey) : undefined,
    headers: config.headers ?? context.meta?.headers,
  });
  if (!hasStaticKey) {
    await removeAppOwnedProviderRuntimeKeyRefs(
      context.runtimeProviderKey,
      getRuntimeProviderSecretEnvVar(context.runtimeProviderKey),
    );
  }
}

async function syncCustomProviderAgentModel(
  config: ProviderConfig,
  runtimeProviderKey: string,
  hasStaticKey: boolean,
): Promise<void> {
  if (!isUnregisteredProviderType(config.type)) {
    return;
  }

  if (!hasStaticKey || !config.baseUrl) {
    return;
  }

  const modelId = normalizeRuntimeModelId(runtimeProviderKey, config.model, config.id);
  await updateAgentModelProvider(runtimeProviderKey, {
    baseUrl: normalizeProviderBaseUrl(config, config.baseUrl, config.apiProtocol || 'openai-completions'),
    api: config.apiProtocol || 'openai-completions',
    models: modelId ? [piAiModelsJsonModelEntry(modelId)] : [],
  });
}

async function syncProviderToRuntime(
  config: ProviderConfig,
  apiKey: string | undefined,
  previousKey?: string,
): Promise<(RuntimeProviderSyncContext & { hasStaticKey: boolean }) | null> {
  if (config.enabled === false) return null;
  const context = await resolveRuntimeSyncContext(config);
  if (!context) {
    return null;
  }
  const selected = (await loadActiveRuntimeProviderAccounts()).get(context.runtimeProviderKey);
  if (selected && selected.account.id !== config.id) return null;

  const hasStaticKey = await syncProviderSecretToRuntime(config, context.runtimeProviderKey, apiKey, previousKey);
  await syncRuntimeProviderConfig(config, context, hasStaticKey);
  await syncCustomProviderAgentModel(config, context.runtimeProviderKey, hasStaticKey);
  return { ...context, hasStaticKey };
}

async function removeDeletedProviderFromOpenClaw(
  provider: ProviderConfig,
  providerId: string,
  runtimeProviderKey?: string,
): Promise<void> {
  const keys = new Set<string>();
  if (runtimeProviderKey) {
    keys.add(runtimeProviderKey);
  } else {
    keys.add(await resolveRuntimeProviderKey({ ...provider, id: providerId }));
  }
  keys.add(providerId);

  for (const key of keys) {
    await removeProviderFromOpenClaw(key);
  }

  // Legacy Codex OAuth used runtime key openai-codex; cleanup may leave a bare
  // models.providers.openai entry behind. Drop that slot when no API key credentials remain.
  if (runtimeProviderKey === OPENAI_OAUTH_RUNTIME_PROVIDER || runtimeProviderKey === 'openai-codex') {
    const openClawKey = await getProviderApiKeyFromOpenClaw('openai');
    if (openClawKey) {
      return;
    }
    const storeAccounts = await listProviderAccounts();
    for (const account of storeAccounts) {
      if (account.vendorId !== 'openai' || account.authMode === 'oauth_browser') {
        continue;
      }
      const apiKey = await getApiKey(account.id);
      if (apiKey) {
        return;
      }
    }
    await removeProviderFromOpenClaw('openai');
  }
}

function parseModelRef(modelRef: string): { providerKey: string; modelId: string } | null {
  const trimmed = modelRef.trim();
  const separatorIndex = trimmed.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null;
  }

  return {
    providerKey: trimmed.slice(0, separatorIndex),
    modelId: trimmed.slice(separatorIndex + 1),
  };
}

function normalizeRuntimeModelId(
  runtimeProviderKey: string,
  modelId: string | undefined,
  accountId?: string,
): string | undefined {
  const value = modelId?.trim();
  if (!value) return undefined;
  // Preserve existing non-OpenRouter account-alias behavior. OpenRouter and
  // Core share native namespace handling without rewriting saved metadata.
  return normalizeOpenClawModelId(runtimeProviderKey, value, runtimeProviderKey === 'openrouter' ? accountId : undefined);
}

async function buildRuntimeProviderConfigMap(): Promise<Map<string, ProviderConfig>> {
  const configs = await getAllProviders();
  const selected = await loadActiveRuntimeProviderAccounts();
  const runtimeMap = new Map<string, ProviderConfig>();

  for (const config of configs) {
    const runtimeKey = await resolveRuntimeProviderKey(config);
    const active = selected.get(runtimeKey);
    if (!active || active.account.id !== config.id) continue;
    runtimeMap.set(runtimeKey, config);
  }

  return runtimeMap;
}

async function buildAgentModelProviderEntry(
  config: ProviderConfig,
  modelId: string,
): Promise<{
  baseUrl?: string;
  api?: string;
  models?: Array<{ id: string; name: string; cost: PiAiModelCostRates }>;
  apiKey?: string;
  authHeader?: boolean;
} | null> {
  const meta = getProviderConfig(config.type);
  const api = config.apiProtocol || (isUnregisteredProviderType(config.type) ? 'openai-completions' : meta?.api);
  const baseUrl = normalizeProviderBaseUrl(config, config.baseUrl || meta?.baseUrl, api);
  if (!api || !baseUrl) {
    return null;
  }

  let apiKey: string | undefined;
  let authHeader: boolean | undefined;

  // The SecretRef in openclaw.json is authoritative for static keys. A
  // targeted scrub replaces only previously app-owned raw models.json keys.
  if (config.type === 'minimax-portal' || config.type === 'minimax-portal-cn') {
    const accountApiKey = await getApiKey(config.id);
    if (!accountApiKey) {
      authHeader = true;
      apiKey = 'minimax-oauth';
    }
  }

  return {
    baseUrl,
    api,
    models: [piAiModelsJsonModelEntry(modelId)],
    apiKey,
    authHeader,
  };
}

async function syncAgentModelsToRuntime(agentIds?: Set<string>): Promise<void> {
  const snapshot = await listAgentsSnapshot();
  const runtimeProviderConfigs = await buildRuntimeProviderConfigMap();

  const targets = snapshot.agents.filter((agent) => {
    if (!agent.modelRef) return false;
    if (!agentIds) return true;
    return agentIds.has(agent.id);
  });

  for (const agent of targets) {
    const parsed = parseModelRef(agent.modelRef || '');
    if (!parsed) {
      continue;
    }

    const providerConfig = runtimeProviderConfigs.get(parsed.providerKey);
    if (!providerConfig) {
      logger.warn(
        `[provider-runtime] No provider account mapped to runtime key "${parsed.providerKey}" for agent "${agent.id}"`,
      );
      continue;
    }

    const entry = await buildAgentModelProviderEntry(providerConfig, parsed.modelId);
    if (!entry) {
      continue;
    }

    await updateSingleAgentModelProvider(agent.id, parsed.providerKey, entry);
  }
}

export async function syncAgentModelOverrideToRuntime(agentId: string): Promise<void> {
  await syncAgentModelsToRuntime(new Set([agentId]));
}

export async function syncSavedProviderToRuntime(
  config: ProviderConfig,
  apiKey: string | undefined,
  gatewayManager?: GatewayManager,
  previousKey?: string,
): Promise<void> {
  if (gatewayManager) {
    return deliverProviderRuntimeConfiguration(gatewayManager, async () => {
      const current = await getProvider(config.id);
      if (current) await syncSavedProviderToRuntime(current, undefined, undefined, previousKey);
    });
  }
  const context = await syncProviderToRuntime(config, apiKey, previousKey);
  if (!context) {
    return;
  }

  if (await getDefaultProvider() === config.id) {
    await syncDefaultProviderToRuntime(config.id);
  } else {
    await syncAgentModelsToRuntime();
  }
}

async function hasUsableRuntimeSibling(providerId: string, runtimeProviderKey: string): Promise<boolean> {
  const siblings = (await listProviderAccounts()).filter((account) => account.id !== providerId
    && getOpenClawProviderKey(account.vendorId, account.id) === runtimeProviderKey);
  const secrets = new Map(await Promise.all(siblings.map(async (account) => (
    [account.id, await getProviderSecret(account.id)] as const
  ))));
  return selectActiveRuntimeProviderAccounts(siblings, secrets).has(runtimeProviderKey);
}

/**
 * Migrate the *old* app-owned key out of OpenClaw's plaintext config before
 * replacing that key in the protected vault. If the process stops after the
 * protected write, the durable config already points at the stable env ref.
 */
export async function reconcileProviderBeforeStaticKeyReplacement(
  existing: ProviderConfig | null,
  previousKey: string | null,
  nextKey: string | undefined,
  gatewayManager?: GatewayManager,
): Promise<void> {
  const replacement = nextKey?.trim();
  if (!previousKey || !replacement || replacement === previousKey) return;
  if (!existing || !await resolveRuntimeSyncContext(existing)) {
    throw new Error('Existing provider cannot be reconciled before replacing its key');
  }
  if (await getApiKey(existing.id) !== previousKey) {
    throw new Error('Provider key changed during replacement; retry the operation');
  }
  const runtimeKey = await resolveRuntimeProviderKey(existing);
  const selected = (await loadActiveRuntimeProviderAccounts()).get(runtimeKey);
  if (selected && selected.account.id !== existing.id) {
    // Rotation must scrub the old key while its vault provenance still exists,
    // without changing which sibling account supplies this runtime provider.
    await saveProviderKeyRefToOpenClaw(runtimeKey, getRuntimeProviderSecretEnvVar(runtimeKey),
      [...(selected.verifiedKeys ?? []), previousKey], undefined, { activate: Boolean(selected.key) });
    await reconcileAppOwnedProviderModelKeysBeforeLaunch();
    return;
  }
  await syncSavedProviderToRuntime(existing, undefined, gatewayManager, previousKey);
}

/** Clear an abandoned runtime key before account metadata stops supplying its env value. */
export async function reconcileProviderBeforeRuntimeKeyChange(
  existing: ProviderConfig | null,
  nextType: string,
  previousKey?: string | null,
): Promise<void> {
  if (!existing) return;
  const oldRuntimeKey = await resolveRuntimeProviderKey(existing);
  const nextRuntimeKey = getOpenClawProviderKey(nextType, existing.id);
  if (oldRuntimeKey === nextRuntimeKey) return;
  const key = previousKey ?? await getApiKey(existing.id);
  if (!key) return;
  const siblings = await listProviderAccounts();
  for (const account of siblings) {
    if (account.id === existing.id || getOpenClawProviderKey(account.vendorId, account.id) !== oldRuntimeKey) continue;
    const siblingSecret = await getProviderSecret(account.id);
    if (siblingSecret?.type === 'api_key' || (siblingSecret?.type === 'local' && siblingSecret.apiKey)) {
      return; // another account still supplies this shared runtime provider
    }
  }
  await removeAppOwnedProviderRuntimeKeyRefs(oldRuntimeKey, getRuntimeProviderSecretEnvVar(oldRuntimeKey), key);
  await removeProviderKeyFromOpenClaw(oldRuntimeKey, undefined, key);
}

export async function syncUpdatedProviderToRuntime(
  config: ProviderConfig,
  apiKey: string | undefined,
  gatewayManager?: GatewayManager,
  previousKey?: string,
): Promise<void> {
  if (gatewayManager) {
    return deliverProviderRuntimeConfiguration(gatewayManager, async () => {
      const current = await getProvider(config.id);
      if (current) await syncUpdatedProviderToRuntime(current, undefined, undefined, previousKey);
    });
  }
  const context = await syncProviderToRuntime(config, apiKey, previousKey);
  if (!context) {
    return;
  }

  const ock = context.runtimeProviderKey;
  const fallbackModels = await getProviderFallbackModelRefs(config);

  const defaultProviderId = await getDefaultProvider();
  const isDefaultProvider = defaultProviderId === config.id;
  if (isDefaultProvider) {
    const selectedModelId = normalizeRuntimeModelId(ock, config.model, config.id);
    const modelOverride = selectedModelId ? `${ock}/${selectedModelId}` : undefined;
    if (!isUnregisteredProviderType(config.type)) {
      if (shouldUseExplicitDefaultOverride(config, ock)) {
        await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
          baseUrl: normalizeProviderBaseUrl(config, config.baseUrl || context.meta?.baseUrl, context.api),
          api: context.api,
          apiKeyEnv: context.meta?.apiKeyEnv,
          apiKeyRef: await getApiKey(config.id) ? getRuntimeProviderSecretRef(ock) : undefined,
          headers: config.headers ?? context.meta?.headers,
        }, fallbackModels);
      } else {
        await setOpenClawDefaultModel(ock, modelOverride, fallbackModels);
      }
    } else {
      await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
        baseUrl: normalizeProviderBaseUrl(config, config.baseUrl, config.apiProtocol || 'openai-completions'),
        api: config.apiProtocol || 'openai-completions',
        apiKeyRef: await getApiKey(config.id) ? getRuntimeProviderSecretRef(ock) : undefined,
        headers: config.headers,
      }, fallbackModels);
    }
  }

  await syncAgentModelsToRuntime();
}

export async function syncDeletedProviderToRuntime(
  provider: ProviderConfig | null,
  providerId: string,
  _gatewayManager?: GatewayManager,
  runtimeProviderKey?: string,
): Promise<void> {
  if (!provider?.type) {
    return;
  }

  const ock = runtimeProviderKey ?? await resolveRuntimeProviderKey({ ...provider, id: providerId });
  if (await hasEnabledRuntimeSibling(providerId, ock)) {
    // A built-in vendor has one runtime slot, shared by multiple app accounts.
    // Keep the saved sibling's slot, but retire abandoned owned refs before
    // this account's protected credential loses its provenance.
    await syncDeletedProviderApiKeyToRuntime(provider, providerId, ock,
      (await getApiKey(providerId)) ?? undefined);
    return;
  }
  await removeDeletedProviderFromOpenClaw(provider, providerId, ock);

}

export async function syncDeletedProviderApiKeyToRuntime(
  provider: ProviderConfig | null,
  providerId: string,
  runtimeProviderKey?: string,
  previousKey?: string,
): Promise<void> {
  if (!provider?.type) {
    return;
  }

  const ock = runtimeProviderKey ?? await resolveRuntimeProviderKey({ ...provider, id: providerId });
  if (await hasUsableRuntimeSibling(providerId, ock)) {
    await syncAllProviderAuthToRuntime();
    await reconcileAppOwnedProviderModelKeysBeforeLaunch();
    return;
  }
  await removeAppOwnedProviderRuntimeKeyRefs(ock, getRuntimeProviderSecretEnvVar(ock), previousKey);
  await removeProviderKeyFromOpenClaw(ock, undefined, previousKey);
}

export async function syncDefaultProviderToRuntime(
  providerId: string,
  gatewayManager?: GatewayManager,
): Promise<void> {
  if (gatewayManager) {
    return deliverProviderRuntimeConfiguration(gatewayManager, async () => {
      const currentId = await getDefaultProvider();
      if (currentId) await syncDefaultProviderToRuntime(currentId);
    });
  }
  const provider = await getProvider(providerId);
  if (!provider) {
    return;
  }

  // Self-heal: opportunistically remove any pre-existing models.providers
  // entries with an invalid `api` field so a switch to a healthy provider
  // can rescue the user from a previously broken config (e.g. the historical
  // openrouter `api: 'openrouter'` bug).  Covers both OAuth and non-OAuth
  // branches below.
  try {
    const removed = await pruneInvalidApiProviderEntries();
    if (removed.length > 0) {
      logger.warn(
        `[provider-runtime] Pruned invalid models.providers entries before switch: ${removed.join(', ')}`,
      );
    }
  } catch (err) {
    logger.warn('[provider-runtime] Failed to prune invalid provider entries before switch:', err);
  }

  // Self-heal: pin the embedded agent runtime for legacy OpenAI provider entries
  // (`openai`, `openai-codex`) that would otherwise be auto-routed to the
  // unbundled `codex` harness. Running this before every default-provider switch
  // repairs on-disk config written by earlier ClawX builds.
  try {
    const pinned = await ensureOpenClawProviderAgentRuntimePins();
    if (pinned.length > 0) {
      logger.warn(
        `[provider-runtime] Pinned embedded agent runtime for models.providers entries before switch: ${pinned.join(', ')}`,
      );
    }
  } catch (err) {
    logger.warn('[provider-runtime] Failed to pin embedded agent runtime for provider entries before switch:', err);
  }

  try {
    const healed = await ensureAnthropicMessagesModelMaxTokens();
    if (healed.length > 0) {
      logger.warn(
        `[provider-runtime] Ensured anthropic-messages maxTokens for models.providers entries before switch: ${healed.join(', ')}`,
      );
    }
  } catch (err) {
    logger.warn('[provider-runtime] Failed to ensure anthropic-messages maxTokens before switch:', err);
  }

  const ock = await resolveRuntimeProviderKey(provider);
  const providerKey = await getApiKey(providerId);
  const fallbackModels = await getProviderFallbackModelRefs(provider);
  const oauthTypes = ['minimax-portal', 'minimax-portal-cn'];
  const browserOAuthRuntimeProvider = await getBrowserOAuthRuntimeProvider(provider);
  const isOAuthProvider = (oauthTypes.includes(provider.type) && !providerKey) || Boolean(browserOAuthRuntimeProvider);

  if (!isOAuthProvider) {
    if (providerKey) {
      await saveProviderKeyRefToOpenClaw(ock, getRuntimeProviderSecretEnvVar(ock), [providerKey]);
    }
    const modelOverride = provider.model ? getProviderModelRef(provider) : undefined;

    if (isUnregisteredProviderType(provider.type)) {
      await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
        baseUrl: normalizeProviderBaseUrl(provider, provider.baseUrl, provider.apiProtocol || 'openai-completions'),
        api: provider.apiProtocol || 'openai-completions',
        apiKeyRef: providerKey ? getRuntimeProviderSecretRef(ock) : undefined,
        headers: provider.headers,
      }, fallbackModels);
    } else if (shouldUseExplicitDefaultOverride(provider, ock)) {
      await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
        baseUrl: normalizeProviderBaseUrl(
          provider,
          provider.baseUrl || getProviderConfig(provider.type)?.baseUrl,
          provider.apiProtocol || getProviderConfig(provider.type)?.api,
        ),
        api: provider.apiProtocol || getProviderConfig(provider.type)?.api,
        apiKeyEnv: getProviderConfig(provider.type)?.apiKeyEnv,
        apiKeyRef: providerKey ? getRuntimeProviderSecretRef(ock) : undefined,
        headers: provider.headers ?? getProviderConfig(provider.type)?.headers,
      }, fallbackModels);
    } else if (providerKey) {
      const meta = getProviderConfig(provider.type);
      await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
        baseUrl: normalizeProviderBaseUrl(provider, meta?.baseUrl, meta?.api),
        api: meta?.api,
        apiKeyRef: getRuntimeProviderSecretRef(ock),
        headers: meta?.headers,
      }, fallbackModels);
    } else {
      await setOpenClawDefaultModel(ock, modelOverride, fallbackModels);
    }

  } else {
    if (browserOAuthRuntimeProvider) {
      const secret = await getProviderSecret(provider.id);
      if (secret?.type === 'oauth') {
        await saveOAuthTokenToOpenClaw(browserOAuthRuntimeProvider, {
          access: secret.accessToken,
          refresh: secret.refreshToken,
          expires: secret.expiresAt,
          email: secret.email,
          projectId: secret.subject,
          accountId: secret.subject,
        }, undefined, { onlyIfMissing: true, activate: false });
      }
      await activateOpenClawOAuthProfile(browserOAuthRuntimeProvider);
      await removeAppOwnedProviderRuntimeKeyRefs(browserOAuthRuntimeProvider, getRuntimeProviderSecretEnvVar(browserOAuthRuntimeProvider));

      const defaultModelRef = OPENAI_OAUTH_DEFAULT_MODEL_REF;
      const modelOverride = provider.model
        ? (provider.model.startsWith(`${browserOAuthRuntimeProvider}/`)
          ? provider.model.replace(/^openai-codex\//, `${browserOAuthRuntimeProvider}/`)
          : `${browserOAuthRuntimeProvider}/${provider.model}`)
        : defaultModelRef;

      await setOpenClawDefaultModelWithOverride(
        browserOAuthRuntimeProvider,
        modelOverride,
        {
          baseUrl: OPENAI_CODEX_OAUTH_PROVIDER_CONFIG.baseUrl,
          api: OPENAI_CODEX_OAUTH_PROVIDER_CONFIG.api,
        },
        fallbackModels.map((fallback) => fallback.replace(/^openai-codex\//, `${browserOAuthRuntimeProvider}/`)),
      );
      logger.info(`Configured openclaw.json for browser OAuth provider "${provider.id}"`);
      await syncAgentModelsToRuntime();
      return;
    }

    const defaultBaseUrl = provider.type === 'minimax-portal'
      ? 'https://api.minimax.io/anthropic'
      : 'https://api.minimaxi.com/anthropic';
    const api = 'anthropic-messages' as const;

    let baseUrl = provider.baseUrl || defaultBaseUrl;
    if (baseUrl) {
      baseUrl = baseUrl.replace(/\/v1$/, '').replace(/\/anthropic$/, '').replace(/\/$/, '') + '/anthropic';
    }

    const targetProviderKey = 'minimax-portal';

    await setOpenClawDefaultModelWithOverride(targetProviderKey, getProviderModelRef(provider), {
      baseUrl,
      api,
      authHeader: targetProviderKey === 'minimax-portal' ? true : undefined,
      apiKeyEnv: targetProviderKey === 'minimax-portal' ? 'minimax-oauth' : 'qwen-oauth',
    }, fallbackModels);

    logger.info(`Configured openclaw.json for OAuth provider "${provider.type}"`);

    const defaultModelId = provider.model?.split('/').pop();
    await updateAgentModelProvider(targetProviderKey, {
      baseUrl,
      api,
      authHeader: targetProviderKey === 'minimax-portal' ? true : undefined,
      apiKey: targetProviderKey === 'minimax-portal' ? 'minimax-oauth' : 'qwen-oauth',
      models: defaultModelId ? [piAiModelsJsonModelEntry(defaultModelId)] : [],
    });
  }

  if (
    isUnregisteredProviderType(provider.type) &&
    providerKey &&
    provider.baseUrl
  ) {
    const modelId = provider.model;
    await updateAgentModelProvider(ock, {
      baseUrl: normalizeProviderBaseUrl(provider, provider.baseUrl, provider.apiProtocol || 'openai-completions'),
      api: provider.apiProtocol || 'openai-completions',
      models: modelId ? [piAiModelsJsonModelEntry(modelId)] : [],
    });
  }

  await syncAgentModelsToRuntime();
}
