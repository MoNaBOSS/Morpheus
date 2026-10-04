import { addressedLocalWakeTranscript } from '../../electron/services/morpheus/voice/wake-audio-buffer';
import { handleMorpheusTaskControl } from '../../electron/services/morpheus/core/task-controls';
import { interpretCommand } from '../../shared/morpheus/interpreter/deterministic';
import { routeMorpheusInteraction } from '../../shared/morpheus/operator-types';

export type CorpusExpectation = {
  kind: 'action' | 'unsupported' | 'control' | 'conversation' | 'clarification' | 'ignored' | 'wake-only';
  capabilityId?: string;
  params?: Record<string, unknown>;
  /** Declared corpus-only spelling equivalence; never rewrites production input. */
  queryAliases?: string[];
  control?: string;
  speechStops?: number;
  cancelled?: string[];
};
export type VoiceCommandCorpusCase = {
  id: string;
  category: string;
  spokenText: string;
  tasks?: { id: string; objective: string }[];
  expected: CorpusExpectation;
};
export type CorpusObservation = {
  kind: CorpusExpectation['kind'];
  command: string | null;
  route?: string;
  steps?: { capabilityId: string; params: Record<string, unknown> }[];
  unsupportedReason?: string;
  control?: string;
  speechStops?: number;
  cancelled?: string[];
};

/** Calls real source interpreters with isolated control adapters; executes no capability. */
export async function observeVoiceCommand(
  transcript: string, wakePhrase: string, tasks: VoiceCommandCorpusCase['tasks'] = [],
): Promise<CorpusObservation> {
  const command = addressedLocalWakeTranscript(transcript, wakePhrase);
  if (command === null) return { kind: 'ignored', command };
  if (!command) return { kind: 'wake-only', command };
  let speechStops = 0;
  const cancelled: string[] = [];
  const controls: Parameters<typeof handleMorpheusTaskControl>[1] = {
    // These explicit synthetic adapters only record control selection. They are
    // not a live Core, permission ledger, task execution or cancellation claim.
    objectives: {
      snapshot: () => ({ runOrder: tasks.map((task) => task.id), runsById: Object.fromEntries(
        tasks.map((task) => [task.id, { objectiveRunId: task.id, objective: task.objective, state: 'running' }]),
      ) }),
      cancel: async ({ objectiveRunId }: { objectiveRunId: string }) => { cancelled.push(objectiveRunId); return { accepted: true }; },
    } as unknown as Parameters<typeof handleMorpheusTaskControl>[1]['objectives'],
    runtime: { pendingPlanConsents: () => [] } as unknown as Parameters<typeof handleMorpheusTaskControl>[1]['runtime'],
    stopSpeech: () => { speechStops++; },
  };
  const control = await handleMorpheusTaskControl(command, controls);
  if (control) return { kind: 'control', command, route: control.route, control: control.control, speechStops, cancelled };
  const decision = routeMorpheusInteraction({ text: command, mode: 'auto', surface: 'voice' });
  if (decision.route !== 'objective') return { kind: decision.route as 'conversation' | 'clarification', command, route: decision.route };
  const result = interpretCommand({ objective: command, origin: { type: 'quick-command', commandText: command },
    platform: 'win32', filesRoot: 'C:\\Morpheus\\files', createId: () => 'corpus-plan', now: () => new Date('2026-10-05T00:00:00.000Z') });
  if (!result.ok) return { kind: 'unsupported', command, route: decision.route, unsupportedReason: result.unsupported.reason };
  return { kind: 'action', command, route: decision.route,
    steps: result.plan.steps.map((step) => ({ capabilityId: step.capabilityId, params: step.params as Record<string, unknown> })) };
}

function exactValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && expected.every((value, index) => exactValue(actual[index], value));
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    const values = expected as Record<string, unknown>, observed = actual as Record<string, unknown>;
    return Object.keys(values).length === Object.keys(observed).length
      && Object.entries(values).every(([key, value]) => exactValue(observed[key], value));
  }
  return actual === expected;
}

function declaredQueryAlias(actual: Record<string, unknown>, expected: CorpusExpectation): boolean {
  if (!expected.queryAliases?.length || typeof actual.url !== 'string' || typeof expected.params?.url !== 'string'
    || Object.keys(actual).length !== 1 || Object.keys(expected.params).length !== 1) return false;
  try {
    const observed = new URL(actual.url), wanted = new URL(expected.params.url);
    const entries = [...wanted.searchParams];
    if (entries.length !== 1 || [...observed.searchParams].length !== 1) return false;
    const [key] = entries[0], value = observed.searchParams.get(key);
    observed.search = ''; wanted.search = '';
    return observed.href === wanted.href && value !== null
      && expected.queryAliases.some((alias) => alias.toLowerCase() === value.toLowerCase());
  } catch { return false; }
}

export async function evaluateVoiceCommand(caseEntry: VoiceCommandCorpusCase, transcript: string, wakePhrase = 'Morpheus') {
  const observed = await observeVoiceCommand(transcript, wakePhrase, caseEntry.tasks);
  const expected = caseEntry.expected;
  const failures: string[] = [];
  let acceptedDeclaredAlias = false;
  if (observed.kind !== expected.kind) failures.push(expected.kind === 'unsupported' && observed.kind === 'action'
    ? 'unsafe-partial-plan' : `outcome:${observed.kind}`);
  if (expected.kind === 'action' && observed.kind === 'action') {
    if (observed.steps?.length !== 1) failures.push('step-count');
    else {
      const step = observed.steps[0];
      if (step.capabilityId !== expected.capabilityId) failures.push('capability');
      if (!exactValue(step.params, expected.params)) {
        acceptedDeclaredAlias = declaredQueryAlias(step.params, expected);
        if (!acceptedDeclaredAlias) failures.push('slots');
      }
    }
  }
  if (expected.kind === 'control' && observed.kind === 'control') {
    if (observed.control !== expected.control) failures.push('control');
    if (observed.speechStops !== expected.speechStops) failures.push('speech-stop-count');
    if (!exactValue(observed.cancelled, expected.cancelled)) failures.push('cancel-targets');
  }
  return { id: caseEntry.id, category: caseEntry.category, transcript, expected, observed,
    passed: failures.length === 0, acceptedDeclaredAlias, failures };
}
