import { describe, expect, it } from 'vitest';
import { composeMorpheusPersonaContext, MORPHEUS_PERSONA_CONTENT_META } from '@shared/morpheus/persona-context';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '@shared/morpheus/onboarding-types';
import { contentBlockToRenderPart } from '@/lib/acp/content-blocks';
import { openClawPromptTextBlocks } from '@/lib/acp/openclaw-prompt-compat';
import { applyAcpSessionUpdate, createEmptyAcpTimeline } from '@/lib/acp/reducer';
import { projectMorpheusConversation } from '@/lib/morpheus-conversation-projection';

const text = composeMorpheusPersonaContext(DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES).instructions;
const tagged = { type: 'text' as const, text, _meta: MORPHEUS_PERSONA_CONTENT_META };
const context = { role: 'user' as const, messageId: 'user', segmentIndex: 0, blockIndex: 0 };

describe('Main-generated persona display metadata', () => {
  it('hides only the display part, retaining the original flattened prompt for matching', () => {
    expect(contentBlockToRenderPart(tagged, context)).toEqual({ kind: 'markdown', text: '' });
    expect(openClawPromptTextBlocks([tagged])).toEqual([text]);
    expect(tagged.text).toBe(text);
  });

  it('does not hide user text that happens to quote the full persona', () => {
    expect(contentBlockToRenderPart({ type: 'text', text }, context)).toEqual({ kind: 'markdown', text });
  });

  it('does not hide assistant or tool presentation with the same annotation', () => {
    expect(contentBlockToRenderPart(tagged, { ...context, role: 'assistant' })).toEqual({ kind: 'markdown', text });
  });

  it.each([
    { ...tagged, text: 'Ordinary user text' },
    { ...tagged, text: text + 'x'.repeat(2400) },
    { ...tagged, _meta: { morpheus: { kind: 'presentation-context', version: 2 } } },
    { ...tagged, _meta: { morpheus: null } },
  ])('leaves unrecognized or unbounded text visible', (block) => {
    expect(contentBlockToRenderPart(block, context)).toEqual({ kind: 'markdown', text: block.text });
  });

  it('replays tagged context plus real user text without changing original history matching', () => {
    const sessionId = 'agent:main:main';
    let timeline = createEmptyAcpTimeline(sessionId, 1);
    for (const content of [tagged, { type: 'text' as const, text: 'How are you today?' }]) {
      timeline = applyAcpSessionUpdate(timeline, { sessionId,
        update: { sessionUpdate: 'user_message_chunk', messageId: 'user', content } } as never);
    }
    expect(projectMorpheusConversation(timeline, sessionId).messages).toMatchObject([{ role: 'user', text: 'How are you today?' }]);
    const segment = Object.values(timeline.itemsById).find((item) => item.kind === 'message-segment');
    expect(segment).toMatchObject({ userPromptTextBlocks: [text, 'How are you today?'] });
  });
});
