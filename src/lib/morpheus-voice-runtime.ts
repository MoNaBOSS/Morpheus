import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

export function morpheusVoiceSpeechFor(run: MorpheusObjectiveRun | null): string | null {
  if (run?.state === 'complete') return run.summary?.trim() || null;
  if (run?.state === 'needs-clarification') return run.clarification?.trim() || null;
  return null;
}
