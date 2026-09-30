import type { AcpTimelineSnapshot, MessageSegmentItem, PermissionItem } from '@/lib/acp/timeline-types';

export type MorpheusConversationMessage = {
  id: string;
  messageId: string;
  role: MessageSegmentItem['role'];
  text: string;
  mediaCount: number;
  truncated: boolean;
};

export type MorpheusConversationProjection = {
  messages: MorpheusConversationMessage[];
  permissions: PermissionItem[];
};

const DEFAULT_MESSAGE_LIMIT = 12;
const DEFAULT_TEXT_LIMIT = 4_000;

/** A bounded display projection of the existing ACP timeline, never a second chat history. */
export function projectMorpheusConversation(
  timeline: AcpTimelineSnapshot,
  sessionKey: string | null,
  options: { messageLimit?: number; textLimit?: number } = {},
): MorpheusConversationProjection {
  if (!sessionKey || timeline.sessionId !== sessionKey) {
    return { messages: [], permissions: [] };
  }

  const messageLimit = Math.max(1, Math.min(50, options.messageLimit ?? DEFAULT_MESSAGE_LIMIT));
  const textLimit = Math.max(100, Math.min(50_000, options.textLimit ?? DEFAULT_TEXT_LIMIT));
  const messages: MorpheusConversationMessage[] = [];
  const messagesByKey = new Map<string, MorpheusConversationMessage>();
  const permissions: PermissionItem[] = [];

  for (const itemId of timeline.itemOrder) {
    const item = timeline.itemsById[itemId];
    if (item?.kind === 'permission' && item.status === 'pending') {
      permissions.push(item);
      continue;
    }
    if (item?.kind !== 'message-segment') continue;

    const key = `${item.role}\0${item.messageId}`;
    let message = messagesByKey.get(key);
    if (!message) {
      message = { id: item.id, messageId: item.messageId, role: item.role, text: '', mediaCount: 0, truncated: false };
      messagesByKey.set(key, message);
      messages.push(message);
    }
    for (const part of item.parts) {
      if (part.kind === 'image' || part.kind === 'attachment') {
        message.mediaCount += 1;
        continue;
      }
      if (part.kind !== 'markdown' && part.kind !== 'error') continue;
      const partText = part.kind === 'markdown' ? part.text : part.message;
      if (!partText) continue;
      const remaining = textLimit - message.text.length;
      if (remaining <= 0) {
        message.truncated = true;
        continue;
      }
      message.text += partText.slice(0, remaining);
      if (partText.length > remaining) message.truncated = true;
    }
  }

  // Keep non-text media visible, but do not render tool/debug material as a reply.
  const visibleMessages = messages.filter((message) => message.text.trim() || message.mediaCount > 0);
  return {
    messages: visibleMessages.slice(-messageLimit),
    permissions: permissions.slice(-3),
  };
}
