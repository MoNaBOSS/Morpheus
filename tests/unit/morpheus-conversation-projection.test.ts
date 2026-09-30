import { describe, expect, it } from 'vitest';
import { projectMorpheusConversation } from '@/lib/morpheus-conversation-projection';
import type { AcpTimelineSnapshot, TimelineItem } from '@/lib/acp/timeline-types';

function timeline(sessionId: string, items: TimelineItem[]): AcpTimelineSnapshot {
  return {
    sessionId,
    loadGeneration: 2,
    itemOrder: items.map((item) => item.id),
    itemsById: Object.fromEntries(items.map((item) => [item.id, item])),
    metadata: {},
    openMessageSegments: {},
    segmentCounts: {},
  };
}

describe('compact conversation projection', () => {
  it('shows the current ACP conversation and never mixes another selected session', () => {
    const history = timeline('agent:main:one', [
      { kind: 'message-segment', id: 'u:0', role: 'user', messageId: 'u', segmentIndex: 0, parts: [{ kind: 'markdown', text: 'What changed?' }] },
      { kind: 'tool-call', id: 'tool', toolCallId: 'tool', title: 'Internal tool', status: 'completed', outputParts: [{ kind: 'markdown', text: 'private output' }], locations: [] },
      { kind: 'message-segment', id: 'a:0', role: 'assistant', messageId: 'a', segmentIndex: 0, parts: [{ kind: 'markdown', text: 'The report is ready.' }] },
      { kind: 'message-segment', id: 'a:1', role: 'assistant', messageId: 'a', segmentIndex: 1, parts: [{ kind: 'markdown', text: ' You can review it.' }] },
    ]);

    expect(projectMorpheusConversation(history, 'agent:main:other')).toEqual({ messages: [], permissions: [] });
    expect(projectMorpheusConversation(history, 'agent:main:one').messages).toMatchObject([
      { role: 'user', text: 'What changed?' },
      { role: 'assistant', text: 'The report is ready. You can review it.' },
    ]);
    expect(JSON.stringify(projectMorpheusConversation(history, 'agent:main:one'))).not.toContain('private output');
  });

  it('keeps pending permission visible when older messages are bounded', () => {
    const history = timeline('agent:main:main', [
      ...Array.from({ length: 8 }, (_, index) => ({
        kind: 'message-segment' as const,
        id: `user-${index}`,
        role: 'user' as const,
        messageId: `user-${index}`,
        segmentIndex: 0,
        parts: [{ kind: 'markdown' as const, text: `Message ${index}` }],
      })),
      { kind: 'permission', id: 'permission-1', requestId: 'permission-1', title: 'Read a file', options: [{ optionId: 'deny', name: 'Deny', kind: 'reject' }], status: 'pending' },
    ]);

    const projection = projectMorpheusConversation(history, 'agent:main:main', { messageLimit: 2 });
    expect(projection.messages.map((message) => message.text)).toEqual(['Message 6', 'Message 7']);
    expect(projection.permissions).toMatchObject([{ requestId: 'permission-1' }]);
  });

  it('bounds streaming text and accounts for rich media without exposing raw parts', () => {
    const history = timeline('agent:main:main', [
      { kind: 'message-segment', id: 'reply', role: 'assistant', messageId: 'reply', segmentIndex: 0,
        parts: [{ kind: 'markdown', text: 'A'.repeat(120) }, { kind: 'image', source: 'data:image/png;base64,private' }] },
    ]);
    expect(projectMorpheusConversation(history, 'agent:main:main', { textLimit: 100 }).messages).toMatchObject([
      { text: 'A'.repeat(100), mediaCount: 1, truncated: true },
    ]);
  });
});
