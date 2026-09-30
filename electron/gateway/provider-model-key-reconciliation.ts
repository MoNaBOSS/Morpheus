/**
 * Recover legacy app-owned model keys before an owned Gateway starts.  A key is
 * app-owned only when it exactly matches a key read from the protected vault.
 * Each file is replaced atomically; a crash between files is retried on the
 * next launch, and the Gateway is not spawned until the whole pass succeeds.
 */
import { randomUUID } from 'node:crypto';
import { open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import JSON5 from 'json5';
import { loadActiveRuntimeProviderAccounts, type SelectedRuntimeProviderAccount } from '../services/providers/active-runtime-provider-selection';
import { getRuntimeProviderSecretEnvVar, getRuntimeProviderSecretRef } from '../services/providers/provider-runtime-secret-ref';
import { getApiKey } from '../utils/secure-storage';
import { CLAWX_OPENAI_IMAGE_PROVIDER_KEY } from '../utils/provider-keys';
import { resolveOpenClawConfigPath, resolveOpenClawStateDir } from '../utils/paths';
import { withConfigLock } from '../utils/config-mutex';
import { saveProviderKeyRefToOpenClaw } from '../utils/openclaw-auth';

type Credential = { key?: string; verifiedKeys: ReadonlySet<string>; envVar: string };
type JsonObject = Record<string, unknown>;
type PlannedWrite = { path: string; previousRaw: string; nextRaw: string };

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function loadProtectedCredentials(selected: Map<string, SelectedRuntimeProviderAccount>): Promise<Map<string, Credential>> {
  const credentials = new Map<string, Credential>();
  for (const [provider, active] of selected) {
    credentials.set(provider, { key: active.key, verifiedKeys: active.verifiedKeys ?? new Set(), envVar: getRuntimeProviderSecretEnvVar(provider) });
  }

  // The image relay is app-owned but is not a provider account.
  const relayKey = await getApiKey(CLAWX_OPENAI_IMAGE_PROVIDER_KEY);
  if (relayKey) credentials.set(CLAWX_OPENAI_IMAGE_PROVIDER_KEY, { key: relayKey, verifiedKeys: new Set([relayKey]), envVar: getRuntimeProviderSecretEnvVar(CLAWX_OPENAI_IMAGE_PROVIDER_KEY) });
  return credentials;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function reconcileEntry(
  entry: JsonObject,
  provider: string,
  credential: Credential,
  kind: 'config' | 'models',
): boolean {
  if (!Object.hasOwn(entry, 'apiKey')) return false;
  const value = entry.apiKey;
  const ref = getRuntimeProviderSecretRef(provider);
  const expected = kind === 'config' ? ref : credential.envVar;
  const isRef = kind === 'config' && isObject(value)
    && value.source === ref.source && value.provider === ref.provider && value.id === ref.id
    && Object.keys(value).length === 3;
  // OAuth/local selection must not retain a static credential from a sibling.
  if (!credential.key && (isRef || value === credential.envVar
    || (typeof value === 'string' && credential.verifiedKeys.has(value)))) {
    delete entry.apiKey;
    return true;
  }
  if (isRef) return false;
  if (value === expected) return false;
  if ((typeof value === 'string' && credential.verifiedKeys.has(value)) || (kind === 'config' && value === credential.envVar)) {
    entry.apiKey = expected;
    return true;
  }
  // A different value may belong to an imported account. Never overwrite it
  // or let an owned launch silently select an ambiguous credential.
  throw new Error(`Unverified OpenClaw ${kind} credential for provider "${provider}"`);
}

function planFile(
  path: string,
  raw: string | undefined,
  credentials: Map<string, Credential>,
  kind: 'config' | 'models',
): PlannedWrite | undefined {
  if (raw === undefined) return undefined;
  const parsed: unknown = kind === 'config' ? JSON5.parse(raw) : JSON.parse(raw);
  if (!isObject(parsed)) throw new Error(`Invalid OpenClaw ${kind} document`);
  const providers = kind === 'config'
    ? (isObject(parsed.models) ? parsed.models.providers : undefined)
    : parsed.providers;
  if (providers === undefined) return undefined;
  if (!isObject(providers)) throw new Error(`Invalid OpenClaw ${kind} providers document`);
  let changed = false;
  for (const [provider, credential] of credentials) {
    const entry = providers[provider];
    if (entry === undefined) continue;
    if (!isObject(entry)) throw new Error(`Invalid OpenClaw ${kind} provider "${provider}"`);
    changed = reconcileEntry(entry, provider, credential, kind) || changed;
  }
  return changed ? { path, previousRaw: raw, nextRaw: `${JSON.stringify(parsed, null, 2)}\n` } : undefined;
}

async function writeIfUnchanged(plan: PlannedWrite): Promise<void> {
  const temporary = `${plan.path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(plan.nextRaw, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    if (await readOptional(plan.path) !== plan.previousRaw) {
      throw new Error('OpenClaw model credentials changed during reconciliation');
    }
    await rename(temporary, plan.path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

async function agentModelPaths(stateDir: string): Promise<string[]> {
  const root = join(stateDir, 'agents');
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return names.map((name) => join(root, name, 'agent', 'models.json'));
}

/** Runs on every owned launch, before OpenClaw can read model credentials. */
export async function reconcileAppOwnedProviderModelKeysBeforeLaunch(options: {
  configPath?: string;
  stateDir?: string;
} = {}): Promise<Map<string, SelectedRuntimeProviderAccount>> {
  const configPath = options.configPath ?? resolveOpenClawConfigPath();
  const stateDir = options.stateDir ?? resolveOpenClawStateDir();
  let selected = new Map<string, SelectedRuntimeProviderAccount>();
  let credentials = new Map<string, Credential>();
  await withConfigLock(async () => {
    const documents = [{ path: configPath, raw: await readOptional(configPath), kind: 'config' as const }];
    const modelDocuments = await Promise.all((await agentModelPaths(stateDir)).sort().map(async (path) => (
      { path, raw: await readOptional(path), kind: 'models' as const }
    )));
    selected = await loadActiveRuntimeProviderAccounts();
    credentials = await loadProtectedCredentials(selected);
    if (credentials.size === 0) return;
    // Validate every target before writing any. If a later write fails, files
    // already converted to refs remain safe and the next launch retries.
    const plans: PlannedWrite[] = [];
    for (const document of [...documents, ...modelDocuments]) {
      const plan = planFile(document.path, document.raw, credentials, document.kind);
      if (plan) plans.push(plan);
    }
    for (const plan of plans) await writeIfUnchanged(plan);
  });
  // A crash after vault commit but before the compatibility auth JSON write
  // must not leave a dedicated image-relay key in plaintext indefinitely.
  const relay = credentials.get(CLAWX_OPENAI_IMAGE_PROVIDER_KEY);
  if (relay?.key) {
    await saveProviderKeyRefToOpenClaw(CLAWX_OPENAI_IMAGE_PROVIDER_KEY, relay.envVar, [relay.key]);
  }
  return selected;
}
