import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import type { MorpheusInteractionDecision } from '@shared/morpheus/operator-types';
import type { MorpheusObjectiveOrchestrator } from './objective-orchestrator';
import type { MorpheusRuntime } from '../runtime';

export async function handleMorpheusTaskControl(text: string, options: {
  objectives: MorpheusObjectiveOrchestrator;
  runtime: MorpheusRuntime;
  stopSpeech: () => void;
}): Promise<MorpheusInteractionDecision | null> {
  const normalized = text.trim().replace(/[.!?]+$/, '').toLowerCase();
  const result = (control: NonNullable<MorpheusInteractionDecision['control']>): MorpheusInteractionDecision => ({
    route: 'control', reason: 'task-control', confidence: 'explicit', text, control,
  });
  if (/^(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:stop talking|stop speaking|be quiet|silence)(?:\s*,?\s*please)?$/.test(normalized)) {
    options.stopSpeech();
    return result('speech-stopped');
  }
  if (/^(?:please )?(?:always do this without asking|always allow this|remember this permission)$/.test(normalized)) {
    const pending = options.runtime.pendingPlanConsents();
    if (!pending.length) return result('no-permission');
    if (pending.length !== 1 || pending[0].boundaries.some((item) => item.mandatoryConfirmation)) return result('choose-permission');
    const request = pending[0];
    const answered = await options.runtime.respondPlanPermission({
      planId: request.planId,
      decisions: Object.fromEntries(request.boundaries.map((item) => [item.boundaryId, 'allow-always'])),
    });
    return result(answered.accepted ? 'permission-saved' : 'no-permission');
  }
  const cancellation = normalized.match(/^(?:please )?(?:cancel|stop)\s+(?:the\s+)?(.+)$/);
  if (!cancellation) return null;
  const target = cancellation[1].replace(/^(?:task|mission)\s+/, '');
  const snapshot = options.objectives.snapshot();
  const candidates = snapshot.runOrder.map((id) => snapshot.runsById[id]).filter((run) => !isObjectiveTerminalState(run.state));
  const generic = /^(?:this|that|it|task|mission|current task)$/.test(target);
  const matches = generic ? candidates : candidates.filter((run) => {
    const words = target.split(/\s+/).filter((word) => word !== 'task' && word !== 'mission');
    return run.objectiveRunId.toLowerCase() === target || (words.length > 0
      && words.every((word) => run.objective.toLowerCase().split(/[^a-z0-9]+/).includes(word)));
  });
  if (!matches.length) return result('no-task');
  if (matches.length !== 1) return result('choose-task');
  const cancelled = await options.objectives.cancel({ objectiveRunId: matches[0].objectiveRunId });
  return result(cancelled.accepted ? 'task-cancelled' : 'no-task');
}
