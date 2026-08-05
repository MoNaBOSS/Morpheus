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

const APP_LAUNCH_PATTERNS = [
  /\b(open|launch|start|run)\b[^.]*\bnotepad\b/i,
  /\bnotepad\b/i,
];

const FILE_CREATE_PATTERNS = [
  /\b(create|make|write|new)\b[^.]*\b(text\s+)?file\b/i,
  /\b(create|make|write|save)\b[^.]*\.txt\b/i,
];

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

  if (APP_LAUNCH_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: true,
      plan: basePlan([
        makeStep(
          'step-1',
          'app.launch',
          { applicationKey: 'notepad' },
          buildPermission('app.launch', platform, 'notepad'),
          'morpheus.plan.steps.appLaunch',
          { application: 'Notepad' },
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

  // Truthful refusal. Morpheus never invents a capability to look capable.
  return { ok: false, unsupported: { objective: text, reason: 'not-understood', supportedCapabilities } };
}
