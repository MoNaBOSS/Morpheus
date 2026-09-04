import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

export function morpheusVoiceSpeechFor(run: MorpheusObjectiveRun | null): string | null {
  if (run?.state === 'complete') {
    const summary = run.summary?.trim();
    if (!summary) return null;
    // Speak an outcome, not an entire report. Full results remain in the Mission.
    if (summary.length <= 420) return summary;
    const prefix = summary.slice(0, 417);
    const sentenceEnd = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('。'));
    return sentenceEnd >= 180 ? prefix.slice(0, sentenceEnd + 1) : `${prefix.trimEnd()}…`;
  }
  if (run?.state === 'needs-clarification') return run.clarification?.trim() || null;
  return null;
}
