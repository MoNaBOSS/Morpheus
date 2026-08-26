import { randomUUID } from 'node:crypto';

import type { ProviderAccount, ProviderProtocol } from '../../../shared/providers/types';
import { getProviderDefinition } from '../../../shared/providers/registry';
import type { MorpheusPlatform } from '@shared/morpheus/actions/registry';
import {
  morpheusPlannerProtocolFor,
  type MorpheusPlannerProtocol,
} from '@shared/morpheus/provider-readiness';
import {
  createPlanFromProviderText,
  createReviewFromProviderText,
  MorpheusProviderPlanError,
} from '@shared/morpheus/provider-plan';
import type {
  MorpheusPlanner,
  MorpheusPlannerReviewRequest,
  MorpheusPlanningCapability,
  MorpheusPlanningRequest,
} from '@shared/morpheus/planner';

const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;

export type SupportedPlannerProtocol = MorpheusPlannerProtocol;

export type MorpheusProviderPlannerOptions = {
  account: ProviderAccount;
  apiKey: string | null;
  modelId?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  createId?: () => string;
};

function protocolFor(account: ProviderAccount): SupportedPlannerProtocol | null {
  return morpheusPlannerProtocolFor(account);
}

export function isProviderPlannerProtocolSupported(protocol: ProviderProtocol | undefined, vendorId?: string): boolean {
  return protocolFor({ apiProtocol: protocol, vendorId } as ProviderAccount) !== null;
}

function baseUrlFor(account: ProviderAccount, protocol: SupportedPlannerProtocol): URL {
  const configured = account.baseUrl ?? getProviderDefinition(account.vendorId)?.providerConfig?.baseUrl
    ?? (protocol === 'anthropic-messages' ? 'https://api.anthropic.com'
      : protocol === 'google-generative-ai' ? 'https://generativelanguage.googleapis.com/v1beta'
        : protocol === 'ollama' ? 'http://127.0.0.1:11434/v1'
          : undefined);
  if (!configured) throw new Error(`Provider ${account.label} has no planning endpoint configured.`);
  const url = new URL(configured);
  const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('Planner endpoints must use HTTPS, except for an explicit loopback local provider.');
  }
  return url;
}

function modelFor(account: ProviderAccount, override?: string): string {
  const raw = (override ?? account.model ?? getProviderDefinition(account.vendorId)?.defaultModelId ?? '').trim();
  if (!raw || raw.length > 200) throw new Error(`Provider ${account.label} has no valid planner model selected.`);
  const prefix = `${account.id}/`;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

function safeProviderHeaders(account: ProviderAccount): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(account.headers ?? {})) {
    const lower = name.toLowerCase();
    if ((!lower.startsWith('x-') && lower !== 'http-referer' && lower !== 'anthropic-beta')
      || ['authorization', 'x-api-key', 'host', 'content-length', 'cookie'].includes(lower)) continue;
    if (typeof value === 'string' && value.length <= 1_000) result[name] = value;
  }
  // Never carry the inherited product identity into provider telemetry.
  if (account.vendorId === 'openrouter') result['X-OpenRouter-Title'] = 'Morpheus';
  return result;
}

function endpoint(base: URL, suffix: string): string {
  const copy = new URL(base.toString());
  copy.pathname = `${copy.pathname.replace(/\/$/, '')}${suffix}`.replace(/\/+/g, '/');
  return copy.toString();
}

function capabilityPrompt(capabilities: readonly MorpheusPlanningCapability[]): string {
  return capabilities.map((capability) => {
    const params = capability.params.map((param) => (
      `${param.key}:${param.kind}${param.required ? '' : '?'}`
    )).join(', ');
    return `- ${capability.capabilityId} [${capability.riskTier}] (${params || 'no parameters'}): ${capability.description}`;
  }).join('\n');
}

function specialistGuidance(capabilities: readonly MorpheusPlanningCapability[]): string {
  const available = new Set(capabilities.map((capability) => capability.capabilityId));
  if (!available.has('file.create') || !available.has('site.verify')) return '';
  return `\nWEBSITE PROJECT RULES:\n`
    + `For an objective that asks Morpheus to build a business website, produce a real local project rather than a report claiming it was built. `
    + `Create one workspace-relative project folder, then create index.html, at least one local .css stylesheet, analytics.json, a concise business-plan.md, and a 30-day-plan.md. `
    + `index.html must link the local stylesheet and include responsive viewport metadata. CSS must include at least one @media rule. `
    + `The project must be self-contained: no script, iframe, object, embed, form, remote asset, remote URL, or active navigation. `
    + `analytics.json must be valid JSON with {"schema":"morpheus.analytics.v1","events":["page_view",...]} and no credential or tracking id. `
    + `Run site.verify only after every required project file succeeds. `
    + `${available.has('reminder.schedule') ? 'If the objective asks for a reminder, run reminder.schedule after site.verify, use the supplied current time, and never claim the reminder exists unless that capability succeeds. ' : ''}`
    + `Never claim public deployment, market research, analytics collection, income, or financial return unless a real capability result proves it.\n`;
}

function systemPrompt(capabilities: readonly MorpheusPlanningCapability[]): string {
  return `You are the planning component of Morpheus. You propose typed plans; you never execute anything.\n`
    + `Return JSON only, with exactly this shape: {"steps":[{"stepId":"lowercase-id","capabilityId":"id","params":{},"dependsOn":[],"summary":"short truthful description"}]}.\n`
    + `Use only the capabilities below. Never invent shell, PowerShell, executable paths, arguments, environment variables, absolute paths, credentials, or capabilities.\n`
    + `Use workspace-relative paths only. Prefer the smallest complete sequential plan. Ask for clarification by producing no plan only when the objective is materially ambiguous.\n\n`
    + `${specialistGuidance(capabilities)}\nAVAILABLE CAPABILITIES:\n${capabilityPrompt(capabilities)}`;
}

function userPlanPrompt(request: MorpheusPlanningRequest, currentTime: Date): string {
  const context = (request.context ?? []).filter((item) => item.sensitivity === 'normal')
    .map((item) => `[${item.source}] ${item.text}`).join('\n');
  return `CURRENT LOCAL TIME:\n${currentTime.toString()}\nCURRENT ISO TIME:\n${currentTime.toISOString()}\n\n`
    + `OBJECTIVE:\n${request.objective}\n\n`
    + `AGENT:\n${request.agent?.name ?? 'General Agent'}\n${(request.agent?.instructions ?? '').slice(0, 8_000)}\n\n`
    + `BOUNDED CONTEXT:\n${context || '(none)'}`;
}

function reviewPrompt(request: MorpheusPlannerReviewRequest): string {
  const observations = request.stepResults.map((step) => ({
    stepId: step.stepId,
    status: step.status,
    errorCode: step.error?.code,
    artifact: step.artifact ? { kind: step.artifact.kind } : undefined,
  }));
  return `Review whether the objective is complete using only the structured observation below.\n`
    + `Return JSON only as one of:\n`
    + `{"outcome":"complete","summary":"concise user-facing result"}\n`
    + `{"outcome":"clarify","question":"one necessary question"}\n`
    + `{"outcome":"continue","reason":"why another plan is needed","steps":[...same strict step shape...]}\n`
    + `A continuation may use only the supplied capabilities and must not repeat completed work.\n\n`
    + `OBJECTIVE: ${request.objective}\nITERATION: ${request.iteration}\nPLAN STATUS: ${request.planStatus}\n`
    + `OBSERVATION: ${JSON.stringify(observations)}`;
}

function extractText(protocol: SupportedPlannerProtocol, payload: unknown): string {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (protocol === 'openai-completions' || protocol === 'ollama') {
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const message = choices[0] && typeof choices[0] === 'object'
      ? (choices[0] as Record<string, unknown>).message : null;
    const content = message && typeof message === 'object' ? (message as Record<string, unknown>).content : null;
    if (typeof content === 'string') return content;
  }
  if (protocol === 'openai-responses') {
    if (typeof record.output_text === 'string') return record.output_text;
    const output = Array.isArray(record.output) ? record.output : [];
    const texts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const content = Array.isArray((item as Record<string, unknown>).content)
        ? (item as Record<string, unknown>).content as unknown[] : [];
      for (const part of content) {
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          texts.push((part as Record<string, unknown>).text as string);
        }
      }
    }
    if (texts.length > 0) return texts.join('');
  }
  if (protocol === 'anthropic-messages') {
    const content = Array.isArray(record.content) ? record.content : [];
    const texts = content.flatMap((part) => (
      part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
        ? [(part as Record<string, unknown>).text as string] : []
    ));
    if (texts.length > 0) return texts.join('');
  }
  if (protocol === 'google-generative-ai') {
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];
    const content = candidates[0] && typeof candidates[0] === 'object'
      ? (candidates[0] as Record<string, unknown>).content : null;
    const parts = content && typeof content === 'object' && Array.isArray((content as Record<string, unknown>).parts)
      ? (content as Record<string, unknown>).parts as unknown[] : [];
    const texts = parts.flatMap((part) => (
      part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
        ? [(part as Record<string, unknown>).text as string] : []
    ));
    if (texts.length > 0) return texts.join('');
  }
  throw new Error('The planning provider returned no usable text.');
}

async function invokeProvider(
  options: MorpheusProviderPlannerOptions,
  protocol: SupportedPlannerProtocol,
  model: string,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  if (options.account.authMode !== 'local' && !options.apiKey) {
    throw new Error(`Provider ${options.account.label} has no API key available for direct planning.`);
  }
  const base = baseUrlFor(options.account, protocol);
  const controller = new AbortController();
  const relayAbort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', relayAbort, { once: true });

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...safeProviderHeaders(options.account),
  };
  let url: string;
  let body: unknown;
  if (protocol === 'openai-completions' || protocol === 'ollama') {
    url = endpoint(base, '/chat/completions');
    if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;
    body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  } else if (protocol === 'openai-responses') {
    url = endpoint(base, '/responses');
    headers.authorization = `Bearer ${options.apiKey}`;
    body = { model, instructions: system, input: user };
  } else if (protocol === 'anthropic-messages') {
    url = endpoint(base, '/v1/messages');
    headers['x-api-key'] = options.apiKey ?? '';
    headers['anthropic-version'] = '2023-06-01';
    body = { model, max_tokens: 4_096, temperature: 0, system, messages: [{ role: 'user', content: user }] };
  } else {
    const modelPath = encodeURIComponent(model);
    const googleBase = new URL(base.toString());
    googleBase.pathname = `${googleBase.pathname.replace(/\/$/, '')}/models/${modelPath}:generateContent`;
    googleBase.searchParams.set('key', options.apiKey ?? '');
    url = googleBase.toString();
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    };
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, redirect: 'error',
    });
    if (!response.ok) throw new Error(`Planning provider returned HTTP ${response.status}.`);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new Error('Planning provider response exceeded the permitted size.');
    }
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { throw new Error('Planning provider returned invalid JSON transport data.'); }
    return extractText(protocol, payload);
  } finally {
    signal?.removeEventListener('abort', relayAbort);
  }
}

function requirePlatform(platform: string): MorpheusPlatform {
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') return platform;
  throw new MorpheusProviderPlanError('unsupported-platform', `Unsupported planning platform: ${platform}`);
}

export function createMorpheusProviderPlanner(options: MorpheusProviderPlannerOptions): MorpheusPlanner {
  const protocol = protocolFor(options.account);
  if (!protocol) throw new Error(`Provider protocol ${String(options.account.apiProtocol)} is not supported for planning.`);
  const model = modelFor(options.account, options.modelId);
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => randomUUID());

  return {
    plannerId: `provider:${options.account.id}`,
    plannedBy: 'provider',
    async plan(request) {
      const capabilities = request.capabilities ?? [];
      const text = await invokeProvider(
        options, protocol, model, systemPrompt(capabilities), userPlanPrompt(request, now()), request.signal,
      );
      return {
        ok: true,
        plan: createPlanFromProviderText(text, {
          planId: createId(),
          objective: request.objective,
          origin: request.origin,
          platform: requirePlatform(request.platform),
          createdAt: now().toISOString(),
          availableCapabilityIds: capabilities.map((capability) => capability.capabilityId),
        }),
      };
    },
    async review(request) {
      const text = await invokeProvider(
        options,
        protocol,
        model,
        systemPrompt(request.capabilities),
        reviewPrompt(request),
        request.signal,
      );
      return createReviewFromProviderText(text, {
        planId: createId(),
        objective: request.objective,
        origin: request.plan.origin,
        platform: requirePlatform(request.plan.steps[0]?.permission.platform ?? process.platform),
        createdAt: now().toISOString(),
        availableCapabilityIds: request.capabilities.map((capability) => capability.capabilityId),
      });
    },
  };
}
