/**
 * Deterministic command interpreter.
 *
 * Temporary but real. It performs no AI inference and fabricates nothing: a
 * phrase either maps to a genuine capability or the user is told plainly what
 * Morpheus supports.
 *
 * Its only lasting obligation is the SHAPE of what it returns. A future
 * OpenClaw- or provider-backed planner must emit the same `ExecutionPlan`, at
 * which point this module is deleted and nothing downstream changes.
 *
 * Imported by BOTH processes: no `electron`, no `node:*` imports.
 */

import {
  getMorpheusActionDescriptor,
  listMorpheusActionIds,
  requiresMandatoryConfirmation,
  type MorpheusActionId,
  type MorpheusApplicationKey,
} from '../actions/registry';
import {
  MORPHEUS_PLAN_VERSION,
  type ExecutionOrigin,
  type ExecutionPlan,
  type ExecutionStep,
  type InterpretationResult,
  type PermissionRequirement,
} from '../execution-types';
import type { MorpheusActionParams } from '../action-types';

export type InterpretOptions = {
  objective: string;
  origin: ExecutionOrigin;
  platform: string;
  /** Canonical approved directory, used as the resource scope for writes. */
  filesRoot: string;
  now?: () => Date;
  createId?: () => string;
};

const SYSTEM_REPORT_PATTERNS = [
  /\bsystem\s+(information|info|report|status|details)\b/i,
  /\b(show|report|get|display|tell)\b.*\bsystem\b/i,
  /\bspecs?\b/i,
  /\bmachine\s+info(rmation)?\b/i,
];

const STORAGE_PATTERNS = [
  /\b(storage|disk|drive)\s+(information|info|space|usage|status)\b/i,
  /\b(show|report|get|check)\b.*\b(storage|disk|drive)\b/i,
];

const PROCESS_PATTERNS = [
  /\b(running\s+)?process(es)?\b/i,
  /\b(task|application)\s+list\b/i,
];

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/i;
const BROWSER_HOME_PATTERNS = [
  /\b(open|launch|start)\b[^.]*\b(browser|web)\b/i,
];
const WEB_SEARCH_PATTERNS = [
  /\b(?:open|launch|start)\b[^.]*\bbrowser\b[^.]*\bsearch\b(?:\s+the\s+web)?(?:\s+for)?\s+(.{1,200})$/i,
  /\b(?:search|google|look\s+up)\b(?:\s+the\s+web)?(?:\s+for)?\s+(.{1,200})$/i,
];
const PROJECT_PATTERNS = [
  /\b(open|launch)\b.*\b(vscode|visual\s+studio\s+code|project|workspace)\b/i,
];

/**
 * Approved applications, matched by name.
 *
 * Only compiled-in keys appear here. There is no branch that turns a
 * user-supplied word into an executable — an application Morpheus does not
 * already know is a truthful refusal, not a path lookup.
 */
const APP_LAUNCH_ALIASES: ReadonlyArray<[RegExp, MorpheusApplicationKey]> = [
  [/\bnotepad\b/i, 'notepad'],
  [/\b(calculator|calc)\b/i, 'calculator'],
  [/\b(paint|mspaint)\b/i, 'paint'],
];

const APP_LAUNCH_VERBS = /\b(open|launch|start|run)\b/i;

const CLIPBOARD_READ_PATTERNS = [
  /\b(read|get|show|what(?:'s|\s+is))\b[^.]*\bclipboard\b/i,
  /\bclipboard\s+contents?\b/i,
];

const CLIPBOARD_WRITE_PATTERNS = [
  /\b(copy|put|write|set|place)\b[^.]*\b(to|on|into)\b[^.]*\bclipboard\b/i,
  /\bcopy\b[^.]*\bclipboard\b/i,
];

const NOTIFY_PATTERNS = [
  /\b(notify|notification|remind|alert)\b/i,
  /\bshow\b[^.]*\bmessage\b/i,
];

const SCREEN_CAPTURE_PATTERNS = [
  /\b(screenshot|screen\s*shot|screen\s*grab)\b/i,
  /\b(capture|take)\b[^.]*\bscreen\b/i,
];

/** Quoted text, or text after a leading verb — for clipboard and notifications. */
export function extractQuoted(objective: string): string | null {
  const quoted = /["“]([^"”]{1,400})["”]/.exec(objective);
  return quoted?.[1]?.trim() || null;
}

const FILE_CREATE_PATTERNS = [
  /\b(create|make|write|new)\b[^.]*\b(text\s+)?file\b/i,
  /\b(create|make|write|save)\b[^.]*\.txt\b/i,
];

/**
 * Filesystem intents.
 *
 * Deliberately narrow. A pattern that matched loosely would turn an
 * unrecognised command into a confident wrong plan, and this interpreter's
 * contract is a truthful refusal when it does not understand.
 *
 * Deletion is matched so Morpheus can state what it WOULD do and let the
 * `critical` tier confirm it — not so deleting becomes quietly convenient.
 */
const FILE_DELETE_PATTERNS = [
  /\b(delete|remove|erase)\b[^.]*\b(file|folder|directory)\b/i,
  /\b(delete|remove)\s+[\w-]+\.\w{1,6}\b/i,
];

const FOLDER_CREATE_PATTERNS = [
  /\b(create|make|add|new)\b[^.]*\b(folder|directory)\b/i,
  /\bmkdir\b/i,
];

const FILE_SEARCH_PATTERNS = [
  /\b(find|search|locate)\b[^.]*\b(files?|folders?)\b/i,
  /\bfiles?\s+(named|called|matching)\b/i,
];

const FILE_READ_PATTERNS = [
  /\b(read|open|show|print)\b[^.]*\b(file|contents?)\b/i,
  /\bwhat(?:'s|\s+is)\s+in\b/i,
];

const FILE_LIST_PATTERNS = [
  /\b(list|show)\b[^.]*\b(files?|folders?|directory|directories|workspace)\b/i,
  /\bwhat\s+files\b/i,
];

/** An explicit `named X` / `called X`, or a bare path-looking token. */
export function extractPath(objective: string): string | null {
  const named = /(?:named|called)\s+"?([\w./\\-]+)"?/i.exec(objective);
  if (named?.[1]) return named[1];
  const bare = /\b([\w-]+(?:[/\\][\w.-]+)+|[\w-]+\.\w{1,6})\b/.exec(objective);
  return bare?.[1] ?? null;
}

/** The term a search should match names against. */
export function extractQuery(objective: string): string | null {
  const quoted = /"([^"]{1,64})"/.exec(objective);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  const matching = /(?:named|called|matching|containing|for)\s+"?([\w.-]{1,64})"?/i.exec(objective);
  return matching?.[1] ?? null;
}

export function extractHttpUrl(objective: string): string | null {
  const match = URL_PATTERN.exec(objective);
  return match?.[0]?.replace(/[),.;!?]+$/, '') ?? null;
}

export function extractWebSearchQuery(objective: string): string | null {
  // Filesystem search is a different capability and is handled earlier. Never
  // reinterpret an incomplete file command as a web search.
  if (/\b(files?|folders?|director(?:y|ies)|workspace)\b/i.test(objective)) return null;
  for (const pattern of WEB_SEARCH_PATTERNS) {
    const match = pattern.exec(objective);
    const query = match?.[1]?.trim().replace(/^["']|["'.!?]+$/g, '').trim();
    if (query && query.length <= 200 && !URL_PATTERN.test(query)) return query;
  }
  return null;
}

export function extractProjectPath(objective: string): string | null {
  const match = /\b(?:project|workspace|folder)\s+(?:at|named|in)?\s*["']?([A-Za-z0-9._\\/-]+)["']?/i.exec(objective);
  return match?.[1] ?? null;
}

/** Extracts an explicit `name.txt`, or derives a safe default. */
export function extractFileName(objective: string): string {
  const explicit = objective.match(/\b([A-Za-z0-9][A-Za-z0-9._-]{0,63}\.txt)\b/);
  if (explicit) return explicit[1];

  const named = objective.match(/\b(?:named|called)\s+["']?([A-Za-z0-9][A-Za-z0-9._-]{0,59})["']?/i);
  if (named) return `${named[1]}.txt`;

  return 'note.txt';
}

/** Extracts quoted content, if the user supplied any. */
export function extractFileContent(objective: string): string {
  const quoted = objective.match(/["“']([^"”']{1,4000})["”']/);
  if (quoted && !quoted[1].toLowerCase().endsWith('.txt')) return quoted[1];

  const saying = objective.match(/\b(?:saying|containing|with(?:\s+the)?\s+(?:text|content))\s+(.{1,4000})$/i);
  if (saying) return saying[1].trim();

  return 'Created by Morpheus.';
}

function buildPermission(
  capabilityId: MorpheusActionId,
  platform: string,
  resourceScope: string,
): PermissionRequirement {
  const descriptor = getMorpheusActionDescriptor(capabilityId);
  return {
    capabilityId,
    platform,
    riskTier: descriptor.riskTier,
    resourceScope,
    mandatoryConfirmation: requiresMandatoryConfirmation(descriptor.riskTier),
  };
}

function makeStep(
  stepId: string,
  capabilityId: MorpheusActionId,
  params: MorpheusActionParams,
  permission: PermissionRequirement,
  summaryKey: string,
  summaryValues?: Record<string, string | number>,
): ExecutionStep {
  return { stepId, capabilityId, params, permission, summaryKey, summaryValues, dependsOn: [] };
}

/**
 * Maps a natural-language objective onto a typed plan.
 *
 * Order matters: the file-creation patterns are checked before app launch so
 * "create a file called notepad.txt" is not mistaken for "open Notepad".
 */
export function interpretCommand(options: InterpretOptions): InterpretationResult {
  const { objective, origin, platform, filesRoot } = options;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `plan-${Math.random().toString(36).slice(2, 10)}`);

  const text = objective.trim();
  const supportedCapabilities = listMorpheusActionIds();

  if (!text) {
    return { ok: false, unsupported: { objective, reason: 'not-understood', supportedCapabilities } };
  }

  const basePlan = (steps: ExecutionStep[]): ExecutionPlan => ({
    v: MORPHEUS_PLAN_VERSION,
    planId: createId(),
    createdAt: now().toISOString(),
    origin,
    objective: text,
    status: 'draft',
    steps,
    plannedBy: 'deterministic',
  });

  if (FILE_CREATE_PATTERNS.some((pattern) => pattern.test(text))) {
    const fileName = extractFileName(text);
    const content = extractFileContent(text);
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'file.createText',
          { fileName, content },
          buildPermission('file.createText', platform, filesRoot),
          'morpheus.plan.steps.fileCreateText',
          { fileName },
        ),
      ]),
    };
  }

  // Deletion is checked BEFORE the other filesystem verbs: "delete the report
  // file" also matches the read patterns, and resolving it as a read would
  // silently downgrade a `critical` intent into a `medium` one.
  const deletePath = FILE_DELETE_PATTERNS.some((pattern) => pattern.test(text))
    ? extractPath(text)
    : null;
  if (deletePath) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'file.delete',
          { path: deletePath },
          buildPermission('file.delete', platform, filesRoot),
          'morpheus.plan.steps.fileDelete',
          { path: deletePath },
        ),
      ]),
    };
  }

  const folderPath = FOLDER_CREATE_PATTERNS.some((pattern) => pattern.test(text))
    ? extractPath(text)
    : null;
  if (folderPath) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'folder.create',
          { path: folderPath },
          buildPermission('folder.create', platform, filesRoot),
          'morpheus.plan.steps.folderCreate',
          { path: folderPath },
        ),
      ]),
    };
  }

  const searchQuery = FILE_SEARCH_PATTERNS.some((pattern) => pattern.test(text))
    ? extractQuery(text)
    : null;
  if (searchQuery) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'file.search',
          { query: searchQuery },
          buildPermission('file.search', platform, filesRoot),
          'morpheus.plan.steps.fileSearch',
          { query: searchQuery },
        ),
      ]),
    };
  }

  const readPath = FILE_READ_PATTERNS.some((pattern) => pattern.test(text))
    ? extractPath(text)
    : null;
  if (readPath) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'file.readText',
          { path: readPath },
          buildPermission('file.readText', platform, filesRoot),
          'morpheus.plan.steps.fileReadText',
          { path: readPath },
        ),
      ]),
    };
  }

  if (FILE_LIST_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'file.list',
          {},
          buildPermission('file.list', platform, filesRoot),
          'morpheus.plan.steps.fileList',
        ),
      ]),
    };
  }

  // Screen capture is checked before the clipboard and notification verbs:
  // "take a screenshot and copy it" mentions both, and the capture is the
  // higher-risk half.
  if (SCREEN_CAPTURE_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'screen.capture',
          {},
          buildPermission('screen.capture', platform, filesRoot),
          'morpheus.plan.steps.screenCapture',
        ),
      ]),
    };
  }

  const url = URL_PATTERN.test(text) ? extractHttpUrl(text) : null;
  if (url) {
    let origin: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, unsupported: { objective: text, reason: 'not-understood', supportedCapabilities } };
      origin = parsed.origin;
    } catch {
      return { ok: false, unsupported: { objective: text, reason: 'not-understood', supportedCapabilities } };
    }
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'web.openUrl',
          { url },
          buildPermission('web.openUrl', platform, origin),
          'morpheus.plan.steps.webOpenUrl',
          { url },
        ),
      ]),
    };
  }

  const webSearchQuery = extractWebSearchQuery(text);
  const openBrowserHome = BROWSER_HOME_PATTERNS.some((pattern) => pattern.test(text));
  if (webSearchQuery || openBrowserHome) {
    const targetUrl = webSearchQuery
      ? `https://www.google.com/search?q=${encodeURIComponent(webSearchQuery)}`
      : 'https://www.google.com/';
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'web.openUrl',
          { url: targetUrl },
          buildPermission('web.openUrl', platform, 'https://www.google.com'),
          webSearchQuery ? 'morpheus.plan.steps.webSearch' : 'morpheus.plan.steps.webOpenUrl',
          webSearchQuery ? { query: webSearchQuery } : { url: targetUrl },
        ),
      ]),
    };
  }

  if (PROJECT_PATTERNS.some((pattern) => pattern.test(text))) {
    const path = extractProjectPath(text);
    if (!path) return { ok: false, unsupported: { objective: text, reason: 'not-understood', supportedCapabilities } };
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'dev.launchProject',
          { path, templateKey: 'vscode' },
          buildPermission('dev.launchProject', platform, filesRoot),
          'morpheus.plan.steps.devLaunchProject',
          { path },
        ),
      ]),
    };
  }

  // Reading is checked before writing: "show me the clipboard" must never be
  // resolved as a write, which would both do the wrong thing and evaluate the
  // lower-risk of the two scopes.
  if (CLIPBOARD_READ_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'clipboard.readText',
          {},
          buildPermission('clipboard.readText', platform, 'clipboard'),
          'morpheus.plan.steps.clipboardReadText',
        ),
      ]),
    };
  }

  const clipboardText = CLIPBOARD_WRITE_PATTERNS.some((pattern) => pattern.test(text))
    ? extractQuoted(text)
    : null;
  if (clipboardText) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'clipboard.writeText',
          { content: clipboardText },
          buildPermission('clipboard.writeText', platform, 'clipboard'),
          'morpheus.plan.steps.clipboardWriteText',
        ),
      ]),
    };
  }

  const notifyText = NOTIFY_PATTERNS.some((pattern) => pattern.test(text))
    ? extractQuoted(text)
    : null;
  if (notifyText) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'system.notify',
          { title: 'Morpheus', body: notifyText },
          buildPermission('system.notify', platform, 'notification'),
          'morpheus.plan.steps.systemNotify',
        ),
      ]),
    };
  }

  const application = APP_LAUNCH_VERBS.test(text) || APP_LAUNCH_ALIASES.some(([p]) => p.test(text))
    ? APP_LAUNCH_ALIASES.find(([pattern]) => pattern.test(text))?.[1]
    : undefined;
  if (application) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'app.launch',
          { applicationKey: application },
          // Scope is the application KEY, so a grant for one approved app never
          // extends to another.
          buildPermission('app.launch', platform, application),
          'morpheus.plan.steps.appLaunch',
          { application },
        ),
      ]),
    };
  }

  if (SYSTEM_REPORT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'system.report',
          {},
          buildPermission('system.report', platform, 'runtime'),
          'morpheus.plan.steps.systemReport',
        ),
      ]),
    };
  }

  if (STORAGE_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'system.storage',
          {},
          buildPermission('system.storage', platform, filesRoot),
          'morpheus.plan.steps.systemStorage',
        ),
      ]),
    };
  }

  if (PROCESS_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'system.processes',
          {},
          buildPermission('system.processes', platform, 'process-inventory'),
          'morpheus.plan.steps.systemProcesses',
        ),
      ]),
    };
  }

  // Truthful refusal. Morpheus never invents a capability to look capable.
  return { ok: false, unsupported: { objective: text, reason: 'not-understood', supportedCapabilities } };
}
