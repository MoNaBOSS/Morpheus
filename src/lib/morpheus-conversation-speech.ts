import type { AcpTimelineSnapshot } from './acp/timeline-types';
import type { AcpTurnTiming } from './acp/turn-timings';
import type { MorpheusAssistantSnapshot, MorpheusAssistantTurn } from '@shared/morpheus/assistant-session-types';

/** Ephemeral live presentation reference. Never restored from saved history. */
export type MorpheusVoiceReplyTurn = { turn: MorpheusAssistantTurn; voiceGeneration: number; speechClaimed?: boolean };
export type MorpheusConversationSpeechInput = {
  reply: MorpheusVoiceReplyTurn | null;
  snapshot: MorpheusAssistantSnapshot | null;
  activeSessionKey: string | null;
  generation: number;
  loading: boolean;
  sending: boolean;
  cancelling: boolean;
  error: string | null;
  timeline: AcpTimelineSnapshot;
  timings: Readonly<Record<string, AcpTurnTiming>>;
  enabled: boolean;
  speakResponses: boolean;
};
type ReplySelection = { kind: 'wait' | 'invalid' } | { kind: 'ready'; text: string; generation: number };

/** Read only answer Markdown belonging to the exact original user anchor.
 * Thoughts, tool output, errors and compatibility captions are never speech. */
export function selectMorpheusConversationSpeech(input: MorpheusConversationSpeechInput, boundGeneration?: number): ReplySelection {
  const target = input.reply?.turn;
  if (!target || target.source !== 'voice' || !input.enabled) return { kind: 'invalid' };
  const snapshot = input.snapshot;
  if (!snapshot) return { kind: 'wait' };
  if (snapshot.selectedConversationId !== target.conversationId) return { kind: 'invalid' };
  const index = snapshot.turns.findIndex((turn) => turn.turnId === target.turnId && turn.conversationId === target.conversationId);
  const admission = snapshot.turns[index];
  if (!admission) return { kind: 'wait' };
  if (admission.generation !== target.generation || admission.source !== 'voice'
    || admission.status === 'cancelled' || admission.status === 'failed'
    || snapshot.turns.slice(index + 1).some((turn) => turn.conversationId === target.conversationId)) return { kind: 'invalid' };
  if (input.activeSessionKey !== target.conversationId || input.timeline.sessionId !== target.conversationId) return { kind: boundGeneration === undefined ? 'wait' : 'invalid' };
  if (boundGeneration !== undefined && input.generation !== boundGeneration || input.cancelling || input.error) return { kind: 'invalid' };
  const timing = input.timings[target.turnId];
  if (!timing || timing.source !== 'live') return { kind: boundGeneration === undefined ? 'wait' : 'invalid' };
  let anchored = false;
  const text = new Map<string, string>();
  for (const id of input.timeline.itemOrder) {
    const item = input.timeline.itemsById[id];
    if (item?.kind !== 'message-segment') continue;
    if (item.role === 'user') {
      if (anchored && item.messageId !== target.turnId) return { kind: 'invalid' };
      if (item.messageId === target.turnId) anchored = true;
      continue;
    }
    if (anchored && !item.compat) for (const part of item.parts) if (part.kind === 'markdown') text.set(item.messageId, (text.get(item.messageId) ?? '') + part.text);
  }
  // Live completion is written only after Main's successful prompt result;
  // the separate content-free admission invalidation may still be in flight.
  if (!anchored || input.loading || input.sending || timing.status !== 'complete') return { kind: 'wait' };
  // The visible full answer remains unchanged. Spoken output stays bounded and
  // omits fenced source code, Markdown markers and naked URLs.
  const plain = [...text.values()].join(' ').replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ')
    .replace(/^[\s#>*-]+/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  // Successful invocation settlement can beat a queued presentation IPC update.
  // Keep the same exact live target until its actual answer arrives.
  if (!plain) return { kind: 'wait' };
  const prefix = plain.slice(0, 900);
  const sentenceEnd = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('? '), prefix.lastIndexOf('! '));
  return { kind: 'ready', generation: input.generation, text: plain.length <= 900 ? plain
    : sentenceEnd >= 300 ? prefix.slice(0, sentenceEnd + 1) : `${prefix.trimEnd()}…` };
}

/** One presentation owner around the existing single playback queue. A live
 * reply is claimed once; a reload starts without a target and stays silent. */
export function createMorpheusConversationSpeechOwner(options: {
  read: () => MorpheusConversationSpeechInput;
  play: (text: string, signal: AbortSignal) => Promise<'neural' | 'windows' | 'cancelled'>;
  claim: (turnId: string) => boolean;
  clear: (turnId: string) => void;
  continueAfterResponse: () => Promise<void>;
  onFailure: () => void;
}) {
  let current: MorpheusVoiceReplyTurn | null = null;
  let boundGeneration: number | undefined;
  let claimed = false;
  let controller: AbortController | null = null;
  let disposed = false;
  let liveTiming: AcpTurnTiming | undefined;
  const reset = () => { controller?.abort(); controller = null; boundGeneration = undefined; liveTiming = undefined; claimed = false; };
  const read = () => {
    const input = options.read();
    // A background canonical supplement may replace live timing metadata after
    // completion. Retain this one witnessed live receipt, never replay history.
    return current && input.reply?.turn.turnId === current.turn.turnId && input.generation === boundGeneration && liveTiming
      ? { ...input, timings: { ...input.timings, [current.turn.turnId]: liveTiming } } : input;
  };
  const sync = () => {
    if (disposed) return;
    const raw = options.read();
    if (current?.turn.turnId !== raw.reply?.turn.turnId || current?.voiceGeneration !== raw.reply?.voiceGeneration) {
      reset(); current = raw.reply; claimed = raw.reply?.speechClaimed === true;
    }
    if (!current) return;
    const timing = raw.timings[current.turn.turnId];
    if (raw.activeSessionKey === current.turn.conversationId && timing?.source === 'live') {
      if (boundGeneration === undefined) boundGeneration = raw.generation;
      if (boundGeneration === raw.generation) liveTiming = timing;
    }
    const input = read();
    const selection = selectMorpheusConversationSpeech(input, boundGeneration);
    if (selection.kind === 'invalid' || !input.speakResponses && controller) {
      const id = current.turn.turnId; reset(); current = null; options.clear(id); return;
    }
    if (selection.kind !== 'ready' || claimed) return;
    claimed = true;
    const reply = current;
    const isCurrent = () => !disposed && current === reply && options.read().reply?.turn.turnId === reply.turn.turnId
      && options.read().reply?.voiceGeneration === reply.voiceGeneration
      && selectMorpheusConversationSpeech(read(), boundGeneration).kind === 'ready';
    // Defer the claim one microtask so StrictMode's discarded effect cannot
    // consume a real reply. A subsequent real remount cannot speak it twice.
    queueMicrotask(() => {
      if (!isCurrent() || !options.claim(reply.turn.turnId)) return;
      if (!read().speakResponses) { void options.continueAfterResponse(); return; }
      controller = new AbortController();
      void options.play(selection.text, controller.signal).then((result) => {
        if (result !== 'cancelled' && isCurrent()) void options.continueAfterResponse();
      }).catch(() => { if (isCurrent()) options.onFailure(); });
    });
  };
  return { sync, dispose() { disposed = true; reset(); current = null; } };
}
