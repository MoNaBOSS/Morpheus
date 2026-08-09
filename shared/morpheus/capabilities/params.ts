/**
 * Capability parameter kinds and their validators.
 *
 * 0.1.1 used a flat bag of optional keys (`{applicationKey?, fileName?,
 * content?}`). At three capabilities that was fine. At ~18 it becomes forty
 * optionals with no way to express which combination is valid for which
 * capability, and no way for the validator to reject a parameter that belongs
 * to a different action.
 *
 * Instead of writing one validator per capability, each parameter declares a
 * KIND. The kind owns the rule. Adding a capability means listing its
 * parameters, not writing new validation code — which is what keeps the trust
 * boundary reviewable as the capability set grows.
 *
 * Imported by BOTH processes: no `electron`, no `node:*` imports. These
 * validators are syntactic only; anything requiring the filesystem or the
 * registry (canonical path resolution, application identity) is re-checked in
 * Main by the capability itself. This layer exists to reject obvious garbage
 * early, never as the sole gate.
 */

/**
 * Permitted text file names. Rejects parent traversal, path separators and
 * alternate data stream separators by construction. Reserved Windows device
 * names are rejected separately, below and in `electron/utils/morpheus-path-guard.ts`.
 *
 * Defined here rather than in the registry so the transport validator and the
 * capability that ultimately writes the file cannot drift apart: two copies of
 * a limit means the boundary that rejects and the boundary that enforces
 * eventually disagree, and the looser one wins.
 */
export const MORPHEUS_TEXT_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.txt$/;

/** Upper bounds. Deliberately conservative; widen with a reason. */
export const PARAM_LIMITS = {
  textContentBytes: 64 * 1024,
  shortTextChars: 512,
  queryChars: 256,
  pathSegmentChars: 64,
  relativePathChars: 260,
  urlChars: 2048,
  maxResults: 500,
} as const;

export type MorpheusParamKind =
  /** Key into the compiled-in approved-application record. */
  | 'applicationKey'
  /** Single filename ending in .txt, no separators. */
  | 'textFileName'
  /** Single filename with a permitted extension, no separators. */
  | 'fileName'
  /** Single directory name, no separators. */
  | 'folderName'
  /** Path relative to an approved root. No absolute paths, no traversal. */
  | 'relativePath'
  /** Logical approved-root selector, resolved to a real path in Main. */
  | 'rootKey'
  /** Bounded UTF-8 text payload. */
  | 'textContent'
  /** Short single-line text. */
  | 'shortText'
  /** Search or filter expression. */
  | 'query'
  /** Absolute http(s) URL. */
  | 'httpUrl'
  /** Key into the compiled-in developer command template record. */
  | 'devTemplateKey'
  /** Positive integer within a capability-declared bound. */
  | 'count'
  /** Literal true/false. */
  | 'flag';

export type MorpheusParamDescriptor = {
  readonly key: string;
  readonly kind: MorpheusParamKind;
  readonly required: boolean;
  /** Documents intent in the Permission Center and plan preview. */
  readonly labelKey?: string;
};

export type ParamValidationResult =
  | { ok: true; value: string | number | boolean }
  | { ok: false; reason: string };

/** Filenames: no separators, no traversal, no ADS colon, no reserved shapes. */
const SAFE_LEAF = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,62}$/;

/**
 * Extensions a capability may create or edit.
 *
 * Executable and script extensions are absent on purpose: allowing Morpheus to
 * write a `.ps1` or `.bat` and then launch it would reconstruct arbitrary shell
 * execution out of two individually-innocent capabilities.
 */
export const WRITABLE_EXTENSIONS: readonly string[] = Object.freeze([
  '.txt', '.md', '.json', '.csv', '.log', '.yml', '.yaml', '.ini', '.xml', '.html', '.css',
]);

const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

function reservedName(name: string): boolean {
  const stem = name.includes('.') ? name.slice(0, name.indexOf('.')) : name;
  return WINDOWS_RESERVED.has(stem.toLowerCase()) || WINDOWS_RESERVED.has(name.toLowerCase());
}

function badLeaf(name: string): string | null {
  if (!SAFE_LEAF.test(name)) return 'must be a simple name without path separators';
  if (/[. ]$/.test(name)) return 'must not end with a dot or space';
  if (reservedName(name)) return 'is a reserved device name';
  return null;
}

function utf8Bytes(value: string): number {
  // Avoids Buffer so this stays platform-neutral for the renderer.
  return new TextEncoder().encode(value).length;
}

/**
 * Validates one parameter against its declared kind.
 *
 * Returns a typed result rather than throwing so the caller can aggregate every
 * problem in a payload instead of surfacing only the first.
 */
export function validateParam(kind: MorpheusParamKind, raw: unknown): ParamValidationResult {
  if (kind === 'flag') {
    if (typeof raw !== 'boolean') return { ok: false, reason: 'must be true or false' };
    return { ok: true, value: raw };
  }

  if (kind === 'count') {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
      return { ok: false, reason: 'must be a positive whole number' };
    }
    if (raw > PARAM_LIMITS.maxResults) return { ok: false, reason: 'exceeds the permitted maximum' };
    return { ok: true, value: raw };
  }

  if (typeof raw !== 'string') return { ok: false, reason: 'must be a string' };
  const value = raw;

  switch (kind) {
    case 'applicationKey':
    case 'rootKey':
    case 'devTemplateKey':
      // Membership is checked in Main against the frozen registry; here we only
      // reject shapes that could never be a key.
      if (!/^[a-z][a-z0-9.-]{0,63}$/.test(value)) return { ok: false, reason: 'is not a valid key' };
      return { ok: true, value };

    case 'textFileName': {
      if (!MORPHEUS_TEXT_FILE_NAME_PATTERN.test(value)) return { ok: false, reason: 'must be a .txt file name' };
      const bad = badLeaf(value);
      return bad ? { ok: false, reason: bad } : { ok: true, value };
    }

    case 'fileName': {
      const bad = badLeaf(value);
      if (bad) return { ok: false, reason: bad };
      const dot = value.lastIndexOf('.');
      const ext = dot === -1 ? '' : value.slice(dot).toLowerCase();
      if (!WRITABLE_EXTENSIONS.includes(ext)) {
        return { ok: false, reason: `must use a permitted extension (${WRITABLE_EXTENSIONS.join(', ')})` };
      }
      return { ok: true, value };
    }

    case 'folderName': {
      if (value.includes('.')) return { ok: false, reason: 'must not contain a dot' };
      const bad = badLeaf(value);
      return bad ? { ok: false, reason: bad } : { ok: true, value };
    }

    case 'relativePath': {
      if (!value) return { ok: false, reason: 'must not be empty' };
      if (value.length > PARAM_LIMITS.relativePathChars) return { ok: false, reason: 'is too long' };
      if (/^[A-Za-z]:/.test(value) || value.startsWith('/') || value.startsWith('\\')) {
        return { ok: false, reason: 'must be relative to an approved location' };
      }
      const segments = value.split(/[\\/]/).filter(Boolean);
      if (segments.length === 0) return { ok: false, reason: 'must name at least one segment' };
      for (const segment of segments) {
        if (segment === '.' || segment === '..') return { ok: false, reason: 'must not traverse directories' };
        const bad = badLeaf(segment);
        if (bad) return { ok: false, reason: `segment "${segment}" ${bad}` };
      }
      return { ok: true, value };
    }

    case 'textContent': {
      if (utf8Bytes(value) > PARAM_LIMITS.textContentBytes) return { ok: false, reason: 'exceeds the permitted size' };
      // Lone surrogates cannot round-trip through UTF-8 and would make a stored
      // byte count disagree with its recorded digest.
      if (/[\uD800-\uDFFF]/.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))) {
        return { ok: false, reason: 'contains unpaired surrogates' };
      }
      return { ok: true, value };
    }

    case 'shortText':
      if (value.length > PARAM_LIMITS.shortTextChars) return { ok: false, reason: 'is too long' };
      if (/[\r\n]/.test(value)) return { ok: false, reason: 'must be a single line' };
      return { ok: true, value };

    case 'query':
      if (!value.trim()) return { ok: false, reason: 'must not be empty' };
      if (value.length > PARAM_LIMITS.queryChars) return { ok: false, reason: 'is too long' };
      return { ok: true, value };

    case 'httpUrl': {
      if (value.length > PARAM_LIMITS.urlChars) return { ok: false, reason: 'is too long' };
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return { ok: false, reason: 'is not a valid URL' };
      }
      // http(s) only. `file:`, `javascript:` and custom protocols are how an
      // "open a link" capability turns into local file access or code execution.
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, reason: 'must be an http or https URL' };
      }
      return { ok: true, value: parsed.toString() };
    }

    default: {
      const exhaustive: never = kind;
      return { ok: false, reason: `unhandled parameter kind: ${String(exhaustive)}` };
    }
  }
}

/** The concrete value a kind produces once validated. */
export type ParamValueOfKind<K extends MorpheusParamKind> =
  K extends 'count' ? number
    : K extends 'flag' ? boolean
      : string;

/**
 * Derives a capability's exact parameter object from its declared descriptors.
 *
 * The descriptors are the single source of truth: a hand-written parallel union
 * would drift from them the first time someone edits one and not the other.
 * Required keys land in the first mapped type, optional in the second, so
 * `params.fileName` is a `string` where required and `string | undefined` where
 * not — without any capability author writing a type by hand.
 */
export type ParamsFromDescriptors<D extends readonly MorpheusParamDescriptor[]> =
  { readonly [E in D[number] as E extends { required: true } ? E['key'] : never]: ParamValueOfKind<E['kind']> }
  & { readonly [E in D[number] as E extends { required: false } ? E['key'] : never]?: ParamValueOfKind<E['kind']> };

export type ValidatedParams = Record<string, string | number | boolean>;

export type ParamsValidation =
  | { ok: true; params: ValidatedParams }
  | { ok: false; errors: Array<{ key: string; reason: string }> };

/**
 * Validates a whole parameter object against a capability's descriptors.
 *
 * Unknown keys are REJECTED, not ignored: a payload smuggling an extra field
 * fails loudly rather than being silently dropped.
 */
export function validateParams(
  descriptors: readonly MorpheusParamDescriptor[],
  raw: unknown,
): ParamsValidation {
  const errors: Array<{ key: string; reason: string }> = [];

  if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
    return { ok: false, errors: [{ key: '(params)', reason: 'must be an object' }] };
  }
  const source = (raw ?? {}) as Record<string, unknown>;

  const allowed = new Set(descriptors.map((descriptor) => descriptor.key));
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) errors.push({ key, reason: 'is not a parameter of this capability' });
  }

  const params: ValidatedParams = {};
  for (const descriptor of descriptors) {
    const value = source[descriptor.key];
    if (value === undefined) {
      if (descriptor.required) errors.push({ key: descriptor.key, reason: 'is required' });
      continue;
    }
    const result = validateParam(descriptor.kind, value);
    if (result.ok) params[descriptor.key] = result.value;
    else errors.push({ key: descriptor.key, reason: result.reason });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, params };
}
