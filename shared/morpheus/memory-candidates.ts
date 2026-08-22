import type { MorpheusMemoryDraft, MorpheusMemoryKind } from './memory-types';

export type MorpheusMemoryCandidate = Omit<MorpheusMemoryDraft, 'memoryId' | 'projectId'>;

export type MorpheusMemoryCandidateResult =
  | { kind: 'none' }
  | { kind: 'rejected'; reason: 'sensitive-content' }
  | { kind: 'candidate'; candidate: MorpheusMemoryCandidate };

const SECRET_LANGUAGE = /\b(?:api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|password|passcode|secret|private[\s_-]?key|seed[\s_-]?phrase|recovery[\s_-]?phrase|credit[\s_-]?card|debit[\s_-]?card|cvv|wallet[\s_-]?(?:key|phrase))\b/i;
const SECRET_SHAPE = /(?:\bsk-[A-Za-z0-9_-]{12,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:\d[ -]*?){13,19}\b)/;

function memoryTextFromObjective(objective: string): { text: string; kind: MorpheusMemoryKind; title: string } | null {
  const text = objective.trim();
  let match = /\bcall me\s+([^\n.!?]{1,60})[.!?]?$/i.exec(text);
  if (match) return { text: `Call the user ${match[1].trim()}.`, kind: 'preference', title: 'Preferred name' };

  match = /\bi prefer\s+(.{1,500})$/i.exec(text);
  if (match) return { text: `The user prefers ${match[1].trim().replace(/[.!?]+$/, '')}.`, kind: 'preference', title: 'User preference' };

  match = /\bremember(?:\s+that)?\s+(.{1,750})$/i.exec(text);
  if (!match) return null;
  const remembered = match[1].trim().replace(/[.!?]+$/, '');
  const kind: MorpheusMemoryKind = /\b(?:every day|daily|weekly|monthly|routine|usually)\b/i.test(remembered)
    ? 'routine'
    : /\b(?:decided|decision|we will|we chose)\b/i.test(remembered)
      ? 'decision'
      : 'project-context';
  return {
    text: remembered,
    kind,
    title: kind === 'routine' ? 'Routine' : kind === 'decision' ? 'Decision' : 'Remembered context',
  };
}

/**
 * Extract only explicit user-directed durable memory. This is intentionally
 * deterministic and narrow: ordinary transcripts and model output never pass
 * through it.
 */
export function extractMorpheusMemoryCandidate(objective: string): MorpheusMemoryCandidateResult {
  const extracted = memoryTextFromObjective(objective);
  if (!extracted) return { kind: 'none' };
  if (SECRET_LANGUAGE.test(extracted.text) || SECRET_SHAPE.test(extracted.text)) {
    return { kind: 'rejected', reason: 'sensitive-content' };
  }
  return {
    kind: 'candidate',
    candidate: {
      title: extracted.title,
      text: extracted.text,
      kind: extracted.kind,
      sensitivity: 'normal',
      providerUse: 'allowed',
      enabled: true,
    },
  };
}
