/**
 * Morpheus native action registry.
 *
 * Frozen, compiled-in descriptions of the native capabilities Morpheus can
 * perform. This module is imported by BOTH the Main and Renderer processes, so
 * it must never import `electron` or any Node built-in.
 *
 * The registry is deliberately data-only. Adding a native action is a matter of
 * adding a descriptor here, adding a capability implementation under
 * `electron/services/morpheus/capabilities/<platform>/`, and adding interface
 * strings for every supported locale. See
 * `harness/reference/morpheus-execution-architecture.md`.
 *
 * SECURITY: the Renderer may reference entries in this registry by key only. It
 * must never supply or influence an executable path, an argument vector, an
 * environment, a shell string, or a filesystem root. Because `settings.set` is a
 * Renderer-reachable host action, this registry must never be sourced from the
 * settings store or from any other Renderer-writable state.
 */

export type MorpheusPlatform = 'win32' | 'darwin' | 'linux';

export type MorpheusActionKind = 'process' | 'filesystem' | 'introspection';

/** Coarse severity, used for presentation and for future policy tiers. */
export type MorpheusRiskTier = 'read' | 'write' | 'execute';

export type MorpheusActionId = 'app.launch' | 'file.createText' | 'system.report';

/** Logical name of a Main-canonicalized approved directory. */
export type MorpheusRootKey = 'morpheusFiles';

export type MorpheusParamKind = 'applicationKey' | 'textFileName' | 'textContent';

export type MorpheusParamDescriptor = {
  readonly key: string;
  readonly kind: MorpheusParamKind;
  readonly required: boolean;
};

export type MorpheusActionDescriptor = {
  readonly id: MorpheusActionId;
  readonly kind: MorpheusActionKind;
  readonly riskTier: MorpheusRiskTier;
  readonly labelKey: string;
  readonly descriptionKey: string;
  /** Platforms with a shipped capability implementation. */
  readonly platforms: readonly MorpheusPlatform[];
  readonly params: readonly MorpheusParamDescriptor[];
  /** Approved root this action writes into, when it writes at all. */
  readonly rootKey?: MorpheusRootKey;
};

/**
 * Applications this build is permitted to launch, addressed by key.
 *
 * `base` names a trusted process environment value resolved in Main. The
 * absolute path is always derived, never supplied.
 */
export type MorpheusApplicationBase = 'systemRoot';

export type MorpheusApplicationKey = 'notepad';

export type MorpheusApplicationEntry = {
  readonly key: MorpheusApplicationKey;
  readonly labelKey: string;
  readonly platform: MorpheusPlatform;
  readonly base: MorpheusApplicationBase;
  readonly relativeDir: string;
  readonly fileName: string;
  readonly args: readonly string[];
};

export const MORPHEUS_ACTIONS: Readonly<Record<MorpheusActionId, MorpheusActionDescriptor>> = Object.freeze({
  'app.launch': Object.freeze({
    id: 'app.launch',
    kind: 'process',
    riskTier: 'execute',
    labelKey: 'dashboard:morpheus.actions.appLaunch.label',
    descriptionKey: 'dashboard:morpheus.actions.appLaunch.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([
      Object.freeze({ key: 'applicationKey', kind: 'applicationKey', required: true } as const),
    ] as const),
  } as const),
  'file.createText': Object.freeze({
    id: 'file.createText',
    kind: 'filesystem',
    riskTier: 'write',
    labelKey: 'dashboard:morpheus.actions.fileCreateText.label',
    descriptionKey: 'dashboard:morpheus.actions.fileCreateText.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    params: Object.freeze([
      Object.freeze({ key: 'fileName', kind: 'textFileName', required: true } as const),
      Object.freeze({ key: 'content', kind: 'textContent', required: true } as const),
    ] as const),
  } as const),
  'system.report': Object.freeze({
    id: 'system.report',
    kind: 'introspection',
    riskTier: 'read',
    labelKey: 'dashboard:morpheus.actions.systemReport.label',
    descriptionKey: 'dashboard:morpheus.actions.systemReport.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([] as const),
  } as const),
} as const);

export const MORPHEUS_APPLICATIONS: Readonly<Record<MorpheusApplicationKey, MorpheusApplicationEntry>> = Object.freeze({
  notepad: Object.freeze({
    key: 'notepad',
    labelKey: 'dashboard:morpheus.applications.notepad',
    platform: 'win32',
    base: 'systemRoot',
    relativeDir: 'System32',
    fileName: 'notepad.exe',
    args: Object.freeze([] as const),
  } as const),
} as const);

/**
 * Permitted text file names. Rejects parent traversal, path separators and
 * alternate data stream separators by construction. Reserved Windows device
 * names are rejected separately in Main; see `electron/utils/morpheus-path-guard.ts`.
 */
export const MORPHEUS_TEXT_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.txt$/;

/** Upper bound on text file payload size. */
export const MORPHEUS_MAX_TEXT_BYTES = 64 * 1024;

/** Seconds a permission request may stay unanswered before it auto-denies. */
export const MORPHEUS_PERMISSION_TIMEOUT_MS = 60_000;

/** Concurrency and rate limits applied in Main. */
export const MORPHEUS_MAX_CONCURRENT_RUNS = 1;
export const MORPHEUS_MAX_RUNS_PER_MINUTE = 10;

/** Upper bound on how many audit entries the Renderer may request at once. */
export const MORPHEUS_MAX_AUDIT_PAGE = 200;

const ACTION_IDS = Object.freeze(Object.keys(MORPHEUS_ACTIONS) as MorpheusActionId[]);
const APPLICATION_KEYS = Object.freeze(Object.keys(MORPHEUS_APPLICATIONS) as MorpheusApplicationKey[]);

export function listMorpheusActionIds(): readonly MorpheusActionId[] {
  return ACTION_IDS;
}

export function listMorpheusApplicationKeys(): readonly MorpheusApplicationKey[] {
  return APPLICATION_KEYS;
}

/** Exact-match membership test. No normalization, no case folding. */
export function isMorpheusActionId(value: unknown): value is MorpheusActionId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MORPHEUS_ACTIONS, value);
}

export function isMorpheusApplicationKey(value: unknown): value is MorpheusApplicationKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MORPHEUS_APPLICATIONS, value);
}

export function getMorpheusActionDescriptor(id: MorpheusActionId): MorpheusActionDescriptor {
  return MORPHEUS_ACTIONS[id];
}

export function getMorpheusApplicationEntry(key: MorpheusApplicationKey): MorpheusApplicationEntry {
  return MORPHEUS_APPLICATIONS[key];
}

export function isMorpheusActionSupportedOn(id: MorpheusActionId, platform: string): boolean {
  return (MORPHEUS_ACTIONS[id].platforms as readonly string[]).includes(platform);
}
