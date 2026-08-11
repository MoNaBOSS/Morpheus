/** Strict conversion of untrusted provider JSON into a Main-authored plan. */
import type { MorpheusActionParams } from './action-types';
import {
  getMorpheusActionDescriptor,
  isMorpheusActionId,
  isMorpheusApplicationKey,
  isMorpheusDeveloperTemplateKey,
  requiresMandatoryConfirmation,
  type MorpheusActionId,
  type MorpheusPlatform,
} from './actions/registry';
import { validateParams } from './capabilities/params';
import type { ExecutionOrigin, ExecutionPlan, ExecutionStep } from './execution-types';
import type { MorpheusPlannerReviewResult } from './planner';
import { buildPlanGraph } from './plan/graph';

export const MORPHEUS_PROVIDER_PLAN_MAX_BYTES = 64 * 1024;
export const MORPHEUS_PROVIDER_PLAN_MAX_STEPS = 12;

export class MorpheusProviderPlanError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MorpheusProviderPlanError';
  }
}

type ProviderStep = {
  stepId: string;
  capabilityId: string;
  params: unknown;
  dependsOn: string[];
  summary: string;
};

type ProviderPlan = { steps: ProviderStep[] };

type ProviderPlanContext = {
  planId: string;
  objective: string;
  origin: ExecutionOrigin;
  platform: MorpheusPlatform;
  createdAt: string;
  availableCapabilityIds: readonly MorpheusActionId[];
};

export type ProviderReviewContext = ProviderPlanContext;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MorpheusProviderPlanError('invalid-shape', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const unknown = Object.keys(record).filter((key) => !keys.includes(key));
  if (unknown.length > 0) {
    throw new MorpheusProviderPlanError('unknown-field', `${label} contains unsupported field: ${unknown[0]}`);
  }
}

function requireBoundedString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new MorpheusProviderPlanError('invalid-shape', `${label} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}

function parseStep(value: unknown, index: number): ProviderStep {
  const record = requireRecord(value, `steps[${index}]`);
  rejectUnknownKeys(record, ['stepId', 'capabilityId', 'params', 'dependsOn', 'summary'], `steps[${index}]`);
  const stepId = requireBoundedString(record.stepId, `steps[${index}].stepId`, 64);
  if (!/^[a-z][a-z0-9-]*$/.test(stepId)) {
    throw new MorpheusProviderPlanError('invalid-step-id', `Invalid step id: ${stepId}`);
  }
  const capabilityId = requireBoundedString(record.capabilityId, `steps[${index}].capabilityId`, 80);
  const summary = requireBoundedString(record.summary, `steps[${index}].summary`, 180);
  if (!Array.isArray(record.dependsOn) || record.dependsOn.some((item) => typeof item !== 'string')) {
    throw new MorpheusProviderPlanError('invalid-dependency', `steps[${index}].dependsOn must be a string array`);
  }
  return {
    stepId,
    capabilityId,
    params: record.params ?? {},
    dependsOn: [...record.dependsOn] as string[],
    summary,
  };
}

/**
 * Model output is untrusted even after its primitive shapes are valid. Keep
 * logical-key membership checks at this conversion boundary so an unavailable
 * application or developer template never becomes a registered/displayed
 * plan. Capabilities repeat these checks in Main before execution as defence
 * in depth.
 */
function validateProviderSemanticParams(
  capabilityId: MorpheusActionId,
  params: Record<string, string | number | boolean>,
): void {
  if (capabilityId === 'app.launch' && !isMorpheusApplicationKey(params.applicationKey)) {
    throw new MorpheusProviderPlanError('invalid-params', 'app.launch: applicationKey is not an approved application');
  }
  if (capabilityId === 'dev.launchProject' && !isMorpheusDeveloperTemplateKey(params.templateKey)) {
    throw new MorpheusProviderPlanError('invalid-params', 'dev.launchProject: templateKey is not an approved developer template');
  }
}

export function parseProviderPlanText(text: string): ProviderPlan {
  if (typeof text !== 'string' || text.length === 0 || text.length > MORPHEUS_PROVIDER_PLAN_MAX_BYTES) {
    throw new MorpheusProviderPlanError('invalid-response-size', 'Planner response is empty or too large');
  }
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new MorpheusProviderPlanError('invalid-json', 'Planner response was not valid JSON');
  }
  const record = requireRecord(raw, 'plan');
  rejectUnknownKeys(record, ['steps'], 'plan');
  if (!Array.isArray(record.steps) || record.steps.length === 0) {
    throw new MorpheusProviderPlanError('empty-plan', 'Planner response must contain at least one step');
  }
  if (record.steps.length > MORPHEUS_PROVIDER_PLAN_MAX_STEPS) {
    throw new MorpheusProviderPlanError('plan-too-large', `Planner response exceeds ${MORPHEUS_PROVIDER_PLAN_MAX_STEPS} steps`);
  }
  return { steps: record.steps.map(parseStep) };
}

export function createPlanFromProviderText(text: string, context: ProviderPlanContext): ExecutionPlan {
  const proposal = parseProviderPlanText(text);
  const available = new Set(context.availableCapabilityIds);
  const steps: ExecutionStep[] = proposal.steps.map((proposed) => {
    if (!isMorpheusActionId(proposed.capabilityId) || !available.has(proposed.capabilityId)) {
      throw new MorpheusProviderPlanError('unknown-capability', `Planner proposed unavailable capability: ${proposed.capabilityId}`);
    }
    const descriptor = getMorpheusActionDescriptor(proposed.capabilityId);
    if (!descriptor.platforms.includes(context.platform)) {
      throw new MorpheusProviderPlanError('unsupported-platform', `${proposed.capabilityId} is unavailable on ${context.platform}`);
    }
    const validation = validateParams(descriptor.params, proposed.params);
    if (!validation.ok) {
      throw new MorpheusProviderPlanError(
        'invalid-params',
        `${proposed.capabilityId}: ${validation.errors.map((error) => `${error.key} ${error.reason}`).join('; ')}`,
      );
    }
    validateProviderSemanticParams(proposed.capabilityId, validation.params);
    return {
      stepId: proposed.stepId,
      capabilityId: proposed.capabilityId,
      params: validation.params as MorpheusActionParams,
      summaryKey: 'dashboard:morpheus.plan.providerStep',
      summaryValues: { summary: proposed.summary },
      permission: {
        capabilityId: proposed.capabilityId,
        platform: context.platform,
        riskTier: descriptor.riskTier,
        resourceScope: 'pending-main-resolution',
        mandatoryConfirmation: requiresMandatoryConfirmation(descriptor.riskTier),
      },
      dependsOn: proposed.dependsOn,
    };
  });

  const graph = buildPlanGraph(steps);
  if (!graph.ok) {
    throw new MorpheusProviderPlanError('invalid-graph', `Planner produced an invalid dependency graph: ${graph.errors.map((error) => error.code).join(', ')}`);
  }

  return {
    v: 1,
    planId: context.planId,
    createdAt: context.createdAt,
    origin: context.origin,
    objective: context.objective,
    status: 'draft',
    steps,
    plannedBy: 'provider',
  };
}

/** Strict conversion of provider review output into a bounded next decision. */
export function createReviewFromProviderText(
  text: string,
  context: ProviderReviewContext,
): MorpheusPlannerReviewResult {
  if (typeof text !== 'string' || text.length === 0 || text.length > MORPHEUS_PROVIDER_PLAN_MAX_BYTES) {
    throw new MorpheusProviderPlanError('invalid-response-size', 'Planner review is empty or too large');
  }
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  let raw: unknown;
  try { raw = JSON.parse(jsonText); } catch {
    throw new MorpheusProviderPlanError('invalid-json', 'Planner review was not valid JSON');
  }
  const record = requireRecord(raw, 'review');
  const outcome = requireBoundedString(record.outcome, 'review.outcome', 20);
  if (outcome === 'complete') {
    rejectUnknownKeys(record, ['outcome', 'summary'], 'review');
    return { outcome, summary: requireBoundedString(record.summary, 'review.summary', 1_000) };
  }
  if (outcome === 'clarify') {
    rejectUnknownKeys(record, ['outcome', 'question'], 'review');
    return { outcome, question: requireBoundedString(record.question, 'review.question', 1_000) };
  }
  if (outcome === 'continue') {
    rejectUnknownKeys(record, ['outcome', 'reason', 'steps'], 'review');
    const reason = requireBoundedString(record.reason, 'review.reason', 500);
    const plan = createPlanFromProviderText(JSON.stringify({ steps: record.steps }), context);
    return { outcome, reason, plan };
  }
  throw new MorpheusProviderPlanError('invalid-review-outcome', `Unsupported review outcome: ${outcome}`);
}
