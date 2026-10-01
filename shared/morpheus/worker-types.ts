/** Main-authored worker authority. No process, credential or executable input. */
export type MorpheusWorkerOperation = { kind: 'web.readPage'; url: string };

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
    capabilityId: 'web.readPage';
    service: 'public-https';
    origins: readonly string[];
    tools: readonly ['https.get'];
    providerRouteRef: 'local-public-http';
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
  source: MorpheusSourceObservation;
  usage: MorpheusWorkerUsage;
  effect: 'none' | 'verified' | 'unknown';
};

export type MorpheusWorkerProgress = {
  workerRunId: string;
  cancellationGeneration: number;
  sequence: number;
  phase: 'retrieving' | 'verified';
};
