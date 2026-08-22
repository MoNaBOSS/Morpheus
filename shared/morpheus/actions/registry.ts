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

import { PARAM_LIMITS } from '../capabilities/params';
import type { MorpheusParamDescriptor, ParamsFromDescriptors } from '../capabilities/params';

export type MorpheusPlatform = 'win32' | 'darwin' | 'linux';

export type MorpheusActionKind =
  | 'process'
  | 'filesystem'
  | 'introspection'
  | 'clipboard'
  | 'notification'
  | 'capture'
  | 'schedule';

/**
 * Risk classification driving the permission engine.
 *
 * `critical` always requires explicit confirmation regardless of the active
 * profile or any stored grant. `high` asks once per new scope and is then
 * grantable. See docs/security/PERMISSION_MODEL.md.
 */
export type MorpheusRiskTier = 'low' | 'medium' | 'high' | 'critical';

/**
 * Tiers whose confirmation can never be waived by a profile or a grant.
 *
 * 0.5 narrowed this to `critical` alone. Treating `high` as permanently
 * interrupting produced prompt fatigue — users stop reading dialogs they see
 * constantly, which is itself a security failure. `high` is now grantable but
 * never auto-runs on a scope the user has not already seen.
 * See docs/security/PERMISSION_MODEL.md.
 */
export const MORPHEUS_MANDATORY_CONFIRMATION_TIERS: readonly MorpheusRiskTier[] =
  Object.freeze(['critical']);

export function requiresMandatoryConfirmation(tier: MorpheusRiskTier): boolean {
  return MORPHEUS_MANDATORY_CONFIRMATION_TIERS.includes(tier);
}

/**
 * Tiers that must be explicitly approved at least once per scope before they
 * may ever run automatically. Distinct from mandatory confirmation: a grant
 * DOES satisfy this, a profile default alone does not.
 */
export function requiresExplicitFirstApproval(tier: MorpheusRiskTier): boolean {
  return tier === 'medium' || tier === 'high';
}

export type MorpheusActionId =
  | 'app.launch'
  | 'system.report'
  | 'file.createText'
  | 'file.create'
  | 'file.readText'
  | 'file.appendText'
  | 'file.list'
  | 'file.search'
  | 'file.move'
  | 'file.copy'
  | 'file.delete'
  | 'folder.create'
  | 'clipboard.readText'
  | 'clipboard.writeText'
  | 'system.notify'
  | 'reminder.schedule'
  | 'screen.capture'
  | 'system.storage'
  | 'system.processes'
  | 'web.openUrl'
  | 'site.verify'
  | 'dev.launchProject';

/**
 * Capabilities allowed on first use under Autonomous after Main resolves their
 * exact compiled-in target or registered workspace scope.
 *
 * This is an allow-list, not a risk shortcut. Unknown capabilities are absent
 * by default. Clipboard reads, process inspection, screen capture, deletion,
 * credentials, finance, privilege, security, and arbitrary commands are
 * deliberately not expressible here without a reviewed registry change.
 */
export const MORPHEUS_AUTONOMOUS_FIRST_USE_ACTIONS = Object.freeze([
  'app.launch',
  'system.report',
  'file.createText',
  'file.create',
  'file.readText',
  'file.appendText',
  'file.list',
  'file.search',
  'file.move',
  'file.copy',
  'folder.create',
  'clipboard.writeText',
  'system.notify',
  'reminder.schedule',
  'system.storage',
  'web.openUrl',
  'site.verify',
  'dev.launchProject',
] as const satisfies readonly MorpheusActionId[]);

export function allowsAutonomousFirstUse(actionId: MorpheusActionId): boolean {
  return MORPHEUS_AUTONOMOUS_FIRST_USE_ACTIONS.includes(actionId as never);
}

/** Actions that create, change, or remove durable state inside a workspace. */
export const MORPHEUS_WORKSPACE_WRITE_ACTIONS = Object.freeze([
  'file.createText',
  'file.create',
  'file.appendText',
  'file.move',
  'file.copy',
  'file.delete',
  'folder.create',
  'screen.capture',
] as const satisfies readonly MorpheusActionId[]);

export function isMorpheusWorkspaceWriteAction(actionId: MorpheusActionId): boolean {
  return MORPHEUS_WORKSPACE_WRITE_ACTIONS.includes(actionId as never);
}


/**
 * Named bundles of capabilities that share ONE trust decision for one exact
 * workspace.
 *
 * This is deliberately NOT a wildcard. A group is a frozen, enumerated list of
 * capability ids, and a grant made against it still binds to one canonical
 * root, one platform and one origin. "Allow every file operation everywhere"
 * remains impossible to express.
 *
 * It exists because trust is workspace-shaped in practice. A user who has
 * approved a workspace expects Morpheus to read, list and search inside it
 * without a fresh dialog for each distinct verb; asking separately for
 * `file.readText`, `file.list` and `file.search` over the same directory is
 * six prompts describing one decision the user already made.
 *
 * Destructive and irreversible operations are deliberately absent from every
 * group — `file.delete` is `critical` and always confirms on its own.
 */
export type MorpheusCapabilityGroup = 'workspace.read' | 'workspace.write';

export const MORPHEUS_CAPABILITY_GROUPS: Readonly<Record<MorpheusCapabilityGroup, readonly MorpheusActionId[]>> =
  Object.freeze({
    /** Non-mutating inspection of an approved workspace. */
    'workspace.read': Object.freeze([
      'file.readText', 'file.list', 'file.search', 'site.verify',
    ] as const),
    /** Additive and reversible changes inside an approved workspace. */
    'workspace.write': Object.freeze([
      'file.createText', 'file.create', 'file.appendText', 'file.move', 'file.copy', 'folder.create',
    ] as const),
  } as const);

export function isMorpheusCapabilityGroup(value: unknown): value is MorpheusCapabilityGroup {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(MORPHEUS_CAPABILITY_GROUPS, value);
}

/** Logical name of a Main-canonicalized approved directory. */
export type MorpheusRootKey = 'morpheusFiles';

export type { MorpheusParamKind, MorpheusParamDescriptor } from '../capabilities/params';

export type MorpheusActionDescriptor = {
  readonly id: MorpheusActionId;
  readonly kind: MorpheusActionKind;
  readonly riskTier: MorpheusRiskTier;
  /**
   * Read-only and free of identifying information, so it may run without a
   * prompt under every profile. Only ever true for `low` risk.
   */
  readonly privacySafe: boolean;
  readonly labelKey: string;
  readonly descriptionKey: string;
  /** Platforms with a shipped capability implementation. */
  readonly platforms: readonly MorpheusPlatform[];
  readonly params: readonly MorpheusParamDescriptor[];
  /** Approved root this action operates in, when it touches the filesystem. */
  readonly rootKey?: MorpheusRootKey;
  /**
   * Trust group this capability belongs to, if any.
   *
   * A grant for a grouped capability binds to the GROUP and the workspace, so
   * approving a workspace once covers the whole enumerated bundle. Ungrouped
   * capabilities — anything destructive — are always granted individually.
   */
  readonly group?: MorpheusCapabilityGroup;
};

/**
 * Applications this build is permitted to launch, addressed by key.
 *
 * `base` names a trusted process environment value resolved in Main. The
 * absolute path is always derived, never supplied.
 */
export type MorpheusApplicationBase = 'systemRoot';

export type MorpheusApplicationKey = 'notepad' | 'calculator' | 'paint';

export type MorpheusDeveloperTemplateKey = 'vscode';

export const MORPHEUS_DEVELOPER_TEMPLATES: Readonly<Record<MorpheusDeveloperTemplateKey, { readonly key: MorpheusDeveloperTemplateKey; readonly labelKey: string }>> = Object.freeze({
  vscode: Object.freeze({ key: 'vscode', labelKey: 'dashboard:morpheus.developerTemplates.vscode' }),
} as const);

export function isMorpheusDeveloperTemplateKey(value: unknown): value is MorpheusDeveloperTemplateKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MORPHEUS_DEVELOPER_TEMPLATES, value);
}

export type MorpheusApplicationEntry = {
  readonly key: MorpheusApplicationKey;
  readonly labelKey: string;
  readonly platform: MorpheusPlatform;
  readonly base: MorpheusApplicationBase;
  readonly relativeDir: string;
  readonly fileName: string;
  readonly args: readonly string[];
};

export const MORPHEUS_ACTIONS = Object.freeze({
  'app.launch': Object.freeze({
    id: 'app.launch',
    kind: 'process',
    riskTier: 'medium',
    privacySafe: false,
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
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileCreateText.label',
    descriptionKey: 'dashboard:morpheus.actions.fileCreateText.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.write',
    params: Object.freeze([
      Object.freeze({ key: 'fileName', kind: 'textFileName', required: true } as const),
      Object.freeze({ key: 'content', kind: 'textContent', required: true } as const),
    ] as const),
  } as const),
  'file.create': Object.freeze({
    id: 'file.create',
    kind: 'filesystem',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileCreate.label',
    descriptionKey: 'dashboard:morpheus.actions.fileCreate.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.write',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'writableRelativePath', required: true } as const),
      Object.freeze({ key: 'content', kind: 'textContent', required: true } as const),
    ] as const),
  } as const),
  'file.readText': Object.freeze({
    id: 'file.readText',
    kind: 'filesystem',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileReadText.label',
    descriptionKey: 'dashboard:morpheus.actions.fileReadText.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.read',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: true } as const),
    ] as const),
  } as const),
  'file.list': Object.freeze({
    id: 'file.list',
    kind: 'filesystem',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileList.label',
    descriptionKey: 'dashboard:morpheus.actions.fileList.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.read',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: false } as const),
    ] as const),
  } as const),
  'file.search': Object.freeze({
    id: 'file.search',
    kind: 'filesystem',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileSearch.label',
    descriptionKey: 'dashboard:morpheus.actions.fileSearch.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.read',
    params: Object.freeze([
      Object.freeze({ key: 'query', kind: 'query', required: true } as const),
      Object.freeze({ key: 'limit', kind: 'count', required: false } as const),
    ] as const),
  } as const),
  'file.appendText': Object.freeze({
    id: 'file.appendText',
    kind: 'filesystem',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileAppendText.label',
    descriptionKey: 'dashboard:morpheus.actions.fileAppendText.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.write',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: true } as const),
      Object.freeze({ key: 'content', kind: 'textContent', required: true } as const),
    ] as const),
  } as const),
  'file.move': Object.freeze({
    id: 'file.move',
    kind: 'filesystem',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileMove.label',
    descriptionKey: 'dashboard:morpheus.actions.fileMove.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.write',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: true } as const),
      Object.freeze({ key: 'destination', kind: 'relativePath', required: true } as const),
    ] as const),
  } as const),
  'file.copy': Object.freeze({
    id: 'file.copy',
    kind: 'filesystem',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileCopy.label',
    descriptionKey: 'dashboard:morpheus.actions.fileCopy.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.write',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: true } as const),
      Object.freeze({ key: 'destination', kind: 'relativePath', required: true } as const),
    ] as const),
  } as const),
  'folder.create': Object.freeze({
    id: 'folder.create',
    kind: 'filesystem',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.folderCreate.label',
    descriptionKey: 'dashboard:morpheus.actions.folderCreate.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.write',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: true } as const),
    ] as const),
  } as const),
  'file.delete': Object.freeze({
    id: 'file.delete',
    kind: 'filesystem',
    riskTier: 'critical',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.fileDelete.label',
    descriptionKey: 'dashboard:morpheus.actions.fileDelete.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: true } as const),
    ] as const),
  } as const),
  'clipboard.readText': Object.freeze({
    id: 'clipboard.readText',
    kind: 'clipboard',
    // Reads whatever the user last copied, which routinely includes passwords
    // and tokens. Sensitive but reversible, so it is grantable rather than
    // permanently interrupting — and deliberately in NO group, so trusting a
    // workspace or clipboard WRITES never implies trusting reads.
    riskTier: 'high',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.clipboardReadText.label',
    descriptionKey: 'dashboard:morpheus.actions.clipboardReadText.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([] as const),
  } as const),
  'clipboard.writeText': Object.freeze({
    id: 'clipboard.writeText',
    kind: 'clipboard',
    // Replaces clipboard contents: a bounded, visible side effect that
    // discloses nothing. Separate scope from reads, by design.
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.clipboardWriteText.label',
    descriptionKey: 'dashboard:morpheus.actions.clipboardWriteText.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([
      Object.freeze({ key: 'content', kind: 'textContent', required: true } as const),
    ] as const),
  } as const),
  'system.notify': Object.freeze({
    id: 'system.notify',
    kind: 'notification',
    // Draws a transient OS notification. Discloses nothing, reads nothing and
    // leaves no durable state, so it runs without a prompt under every profile
    // except Strict.
    riskTier: 'low',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.systemNotify.label',
    descriptionKey: 'dashboard:morpheus.actions.systemNotify.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([
      Object.freeze({ key: 'title', kind: 'shortText', required: true } as const),
      Object.freeze({ key: 'body', kind: 'shortText', required: false } as const),
    ] as const),
  } as const),
  'screen.capture': Object.freeze({
    id: 'screen.capture',
    kind: 'capture',
    // Captures whatever is on screen, including other applications. Sensitive
    // but reversible: it asks the first time for a scope and is then grantable,
    // never silently automatic on a scope the user has not seen. Every capture
    // is audited and shown live. In NO group — no other trust implies it.
    riskTier: 'high',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.screenCapture.label',
    descriptionKey: 'dashboard:morpheus.actions.screenCapture.description',
    platforms: Object.freeze(['win32'] as const),
    // Written into the approved workspace like any other artifact.
    rootKey: 'morpheusFiles',
    params: Object.freeze([] as const),
  } as const),
  'system.storage': Object.freeze({
    id: 'system.storage',
    kind: 'introspection',
    riskTier: 'low',
    privacySafe: true,
    labelKey: 'dashboard:morpheus.actions.systemStorage.label',
    descriptionKey: 'dashboard:morpheus.actions.systemStorage.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    params: Object.freeze([] as const),
  } as const),
  'reminder.schedule': Object.freeze({
    id: 'reminder.schedule',
    kind: 'schedule',
    // Creates a reversible Morpheus-owned schedule. It does not grant the
    // scheduled workflow any authority beyond its compiled notification step.
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.reminderSchedule.label',
    descriptionKey: 'dashboard:morpheus.actions.reminderSchedule.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([
      Object.freeze({ key: 'title', kind: 'shortText', required: true } as const),
      Object.freeze({ key: 'body', kind: 'shortText', required: true } as const),
      Object.freeze({ key: 'runAt', kind: 'isoDateTime', required: true } as const),
      Object.freeze({ key: 'repeatDaily', kind: 'flag', required: false } as const),
    ] as const),
  } as const),
  'system.processes': Object.freeze({
    id: 'system.processes',
    kind: 'introspection',
    riskTier: 'high',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.systemProcesses.label',
    descriptionKey: 'dashboard:morpheus.actions.systemProcesses.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([] as const),
  } as const),
  'web.openUrl': Object.freeze({
    id: 'web.openUrl',
    kind: 'process',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.webOpenUrl.label',
    descriptionKey: 'dashboard:morpheus.actions.webOpenUrl.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([
      Object.freeze({ key: 'url', kind: 'httpUrl', required: true } as const),
    ] as const),
  } as const),
  'site.verify': Object.freeze({
    id: 'site.verify',
    kind: 'introspection',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.siteVerify.label',
    descriptionKey: 'dashboard:morpheus.actions.siteVerify.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    group: 'workspace.read',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: true } as const),
    ] as const),
  } as const),
  'dev.launchProject': Object.freeze({
    id: 'dev.launchProject',
    kind: 'process',
    riskTier: 'medium',
    privacySafe: false,
    labelKey: 'dashboard:morpheus.actions.devLaunchProject.label',
    descriptionKey: 'dashboard:morpheus.actions.devLaunchProject.description',
    platforms: Object.freeze(['win32'] as const),
    rootKey: 'morpheusFiles',
    params: Object.freeze([
      Object.freeze({ key: 'path', kind: 'relativePath', required: true } as const),
      Object.freeze({ key: 'templateKey', kind: 'devTemplateKey', required: true } as const),
    ] as const),
  } as const),
  'system.report': Object.freeze({
    id: 'system.report',
    kind: 'introspection',
    riskTier: 'low',
    privacySafe: true,
    labelKey: 'dashboard:morpheus.actions.systemReport.label',
    descriptionKey: 'dashboard:morpheus.actions.systemReport.description',
    platforms: Object.freeze(['win32'] as const),
    params: Object.freeze([] as const),
  } as const),
} as const) satisfies Readonly<Record<MorpheusActionId, MorpheusActionDescriptor>>;

/**
 * The exact parameter object a given capability accepts, derived from its own
 * descriptors. Capability adapters annotate with this instead of a shared bag of
 * optionals, so a parameter belonging to a different capability is a type error.
 */
export type MorpheusParamsFor<K extends MorpheusActionId> =
  ParamsFromDescriptors<(typeof MORPHEUS_ACTIONS)[K]['params']>;

export const MORPHEUS_APPLICATIONS: Readonly<Record<MorpheusApplicationKey, MorpheusApplicationEntry>> = Object.freeze({
  notepad: Object.freeze({
    key: 'notepad',
    labelKey: 'dashboard:morpheus.applications.notepad',
    platform: 'win32',
    base: 'systemRoot',
    relativeDir: 'System32',
    fileName: 'notepad.exe',
    // Always empty. An argument vector is the difference between "launch an
    // approved application" and "run an arbitrary command", and the renderer
    // can never supply one.
    args: Object.freeze([] as const),
  } as const),
  calculator: Object.freeze({
    key: 'calculator',
    labelKey: 'dashboard:morpheus.applications.calculator',
    platform: 'win32',
    base: 'systemRoot',
    relativeDir: 'System32',
    fileName: 'calc.exe',
    args: Object.freeze([] as const),
  } as const),
  paint: Object.freeze({
    key: 'paint',
    labelKey: 'dashboard:morpheus.applications.paint',
    platform: 'win32',
    base: 'systemRoot',
    relativeDir: 'System32',
    fileName: 'mspaint.exe',
    args: Object.freeze([] as const),
  } as const),
} as const);

/**
 * Re-exported from the parameter layer, which owns them. Keeping one definition
 * means the validator that rejects at the transport boundary and the capability
 * that enforces at the filesystem boundary can never disagree.
 */
export { MORPHEUS_TEXT_FILE_NAME_PATTERN } from '../capabilities/params';

/** Upper bound on text file payload size. */
export const MORPHEUS_MAX_TEXT_BYTES = PARAM_LIMITS.textContentBytes;

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
