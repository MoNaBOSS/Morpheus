/** Main-authored worker authority. No process, credential or executable input. */
import type { MorpheusBrowserCommand, MorpheusBrowserSnapshot } from './browser-types';
export type MorpheusWorkerOperation = { kind: 'web.readPage'; url: string }
  | { kind: 'browser.inspect'; url: string }
  | { kind: 'browser.interact'; url: string; sessionId: string; command: MorpheusBrowserCommand };

export function isMorpheusWorkerAction(value: string): value is MorpheusWorkerOperation['kind'] {
  return ['web.readPage', 'browser.inspect', 'browser.interact'].includes(value);
}

export function workerOperationFromParams(kind: MorpheusWorkerOperation['kind'], params: Record<string, unknown>): MorpheusWorkerOperation {
  return kind === 'browser.interact'
    ? { kind, url: String(params.url), sessionId: String(params.sessionId), command: JSON.parse(String(params.command)) }
    : { kind, url: String(params.url) };
}

export type MorpheusWorkerOwner = {
  objectiveRunId: string;
  attemptId: string;
  planId: string;
  stepId: string;
  cancellationGeneration: number;
  workspaceId?: string;
};

export type MorpheusWorkerLimits = {
  deadlineAt: string;
  maxSteps: number;
  maxOutputBytes: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
};

export type MorpheusWorkerRequest = MorpheusWorkerOwner & {
  v: 1;
  workerRunId: string;
  operation: MorpheusWorkerOperation;
  authority: {
    capabilityId: MorpheusWorkerOperation['kind'];
    service: 'public-https' | 'public-browser';
    origins: readonly string[];
    tools: readonly ['https.get'] | readonly ['browser.inspect', 'browser.interact'];
    providerRouteRef: 'local-public-http' | 'local-public-browser';
  };
  limits: MorpheusWorkerLimits;
};

export type MorpheusWorkerUsage =
  | { status: 'known'; inputTokens: number; outputTokens: number; costUsd: number }
  | { status: 'unknown' };

export type MorpheusSourceObservation = {
  originalUrl: string;
  finalUrl: string;
  title: string;
  retrievedAt: string;
  excerpt: string;
  location: 'body-text';
  contentSha256: string;
  bytes: number;
  truncated: boolean;
};

export type MorpheusWorkerOutcome = {
  workerRunId: string;
  usage: MorpheusWorkerUsage;
  effect: 'none' | 'verified' | 'unknown';
} & ({ source: MorpheusSourceObservation; browser?: never } | { browser: MorpheusBrowserSnapshot; source?: never });

export type MorpheusWorkerProgress = {
  workerRunId: string;
  cancellationGeneration: number;
  sequence: number;
  phase: 'retrieving' | 'verified';
};
