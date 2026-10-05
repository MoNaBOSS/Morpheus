/** Platform-neutral interaction routing for every Morpheus surface. */
import { parseBrowserSearch } from './interpreter/browser-search';

export const MORPHEUS_INTERACTION_MODES = Object.freeze(['ask', 'auto', 'act'] as const);
export type MorpheusInteractionMode = typeof MORPHEUS_INTERACTION_MODES[number];

export const MORPHEUS_INTERACTION_SURFACES = Object.freeze([
  'command-center',
  'presence',
  'quick-command',
  'voice',
  'chat',
] as const);
export type MorpheusInteractionSurface = typeof MORPHEUS_INTERACTION_SURFACES[number];

export type MorpheusInteractionRoute = 'conversation' | 'objective' | 'clarification' | 'control';

export type RouteMorpheusInteractionPayload = {
  text: string;
  mode: MorpheusInteractionMode;
  surface: MorpheusInteractionSurface;
};

export type MorpheusInteractionDecision = {
  route: MorpheusInteractionRoute;
  /** Stable machine-readable reason. User-facing copy remains translated in Renderer. */
  reason:
    | 'ask-selected'
    | 'act-selected'
    | 'actionable-intent'
    | 'conversational-intent'
    | 'ambiguous-chat'
    | 'ambiguous-command'
    | 'task-control';
  control?: 'speech-stopped' | 'task-cancelled' | 'permission-saved' | 'choose-task' | 'choose-permission' | 'no-task' | 'no-permission';
  confidence: 'explicit' | 'high' | 'low';
  /** Normalized text accepted by the route. Never provider-authored. */
  text: string;
};

const ACTION_VERBS = [
  'add', 'append', 'build', 'capture', 'close', 'copy', 'create', 'delete', 'deploy',
  'edit', 'find', 'focus', 'generate', 'launch', 'list', 'make', 'move', 'notify',
  'open', 'organize', 'prepare', 'read', 'remind', 'rename', 'research', 'run',
  'save', 'schedule', 'search', 'send', 'show', 'start', 'take', 'update', 'verify',
  'write',
] as const;

const ACTION_VERB_PATTERN = ACTION_VERBS.join('|');
const IMPERATIVE_ACTION = new RegExp(
  `^(?:(?:please|kindly)\\s+)?(?:${ACTION_VERB_PATTERN})\\b`,
  'i',
);
const REQUEST_ACTION = new RegExp(
  `^(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?(?:${ACTION_VERB_PATTERN})\\b`,
  'i',
);
const DESIRE_ACTION = new RegExp(
  `^(?:i\\s+(?:want|need)\\s+you\\s+to|help\\s+me)\\s+(?:${ACTION_VERB_PATTERN})\\b`,
  'i',
);
const ACTION_NOUN_REQUEST = /^(?:set|create)\s+(?:up\s+)?(?:a\s+)?(?:reminder|schedule|workflow|project|website|site)\b/i;
const CONVERSATIONAL_QUESTION = /^(?:what|why|who|where|when|how|which|is|are|am|do|does|did|can|could|would|should)\b/i;
const COMPANION_CONVERSATION = /^(?:(?:hi|hello|hey|good morning|good evening|thanks|thank you)(?:[\s,!].*)?|(?:i prefer|remember(?: that)?|call me)\s+.+|(?:please\s+)?(?:don't|do not)\s+(?:roast|mock|joke|make jokes|use jokes|make fun|tease)\b.*)[.!?]?$/i;
const NAVIGATION_REQUEST = /^(?:(?:(?:can|could|would|will)\s+you|i\s+(?:want|need)\s+you\s+to|help\s+me)\s+)?(?:(?:please|kindly)\s+)?(?:go\s+to|navigate\s+to|take\s+me\s+to|visit|browse|look\s+up)\s+\S/i;

/** Narrow speech inflections for routine navigation/read-only commands.
 * Never changes query words, accepts narration, or repairs consequential verbs.
 */
export function normalizeSpokenRoutineCommand(text: string): string | null {
  const report = /^shows\s+((?:the\s+)?system\s+(?:information|info|report|status|details))[.!]?$/i.exec(text);
  if (report) return `show ${report[1]}`;
  const opening = /^(?:opened|opens)\s+(.+)$/i.exec(text);
  if (!opening) return null;
  const candidate = `open ${opening[1]}`;
  // Site-search parsing validates the whole request and preserves the literal query.
  if (parseBrowserSearch(candidate)?.kind === 'search') return candidate;
  if (/^(?:the\s+)?(?:youtube|you tube|u tube|instagram|github|gmail|google|pornhub|notepad|calculator|paint|spotify)(?:\s+(?:website|site|app))?[.!]?$/i.test(opening[1])) return candidate;
  if (/^https?:\/\/[^\s<>"']+[.!]?$/i.test(opening[1])
    || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}[.!]?$/i.test(opening[1])) return candidate;
  return null;
}

/**
 * Bounded deterministic routing for Auto mode.
 *
 * This function decides only whether text is conversation or an objective. It
 * never invents a plan, capability, path, grant, or executable authority.
 */
export function routeMorpheusInteraction(
  payload: RouteMorpheusInteractionPayload,
): MorpheusInteractionDecision {
  const text = payload.text.trim();

  if (payload.mode === 'ask') {
    return { route: 'conversation', reason: 'ask-selected', confidence: 'explicit', text };
  }
  if (payload.mode === 'act') {
    return { route: 'objective', reason: 'act-selected', confidence: 'explicit', text };
  }

  const spokenRoutine = payload.surface === 'voice' ? normalizeSpokenRoutineCommand(text) : null;
  if (spokenRoutine) return { route: 'objective', reason: 'actionable-intent', confidence: 'high', text: spokenRoutine };

  if (IMPERATIVE_ACTION.test(text) || REQUEST_ACTION.test(text)
    || DESIRE_ACTION.test(text) || ACTION_NOUN_REQUEST.test(text)
    || NAVIGATION_REQUEST.test(text) || parseBrowserSearch(text)?.kind === 'search') {
    return { route: 'objective', reason: 'actionable-intent', confidence: 'high', text };
  }

  if (CONVERSATIONAL_QUESTION.test(text) || COMPANION_CONVERSATION.test(text) || text.endsWith('?')) {
    return { route: 'conversation', reason: 'conversational-intent', confidence: 'high', text };
  }

  if (payload.surface === 'chat') {
    return { route: 'conversation', reason: 'ambiguous-chat', confidence: 'low', text };
  }

  return { route: 'clarification', reason: 'ambiguous-command', confidence: 'low', text };
}
