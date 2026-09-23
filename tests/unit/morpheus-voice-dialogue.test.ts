import { describe, expect, it } from 'vitest';
import { matchMorpheusAddress, MorpheusVoiceDialogue } from '@/lib/morpheus-voice-dialogue';

describe('bounded companion addressing', () => {
  it('distinguishes a name-only call from unrelated speech', () => {
    expect(matchMorpheusAddress('Hey, Morpheus!', 'Morpheus')).toEqual({ kind: 'wake' });
    expect(matchMorpheusAddress('morpheusing', 'Morpheus')).toEqual({ kind: 'ignore' });
  });
  it('keeps offsets correct when normalization changes character count', () => {
    expect(matchMorpheusAddress('ﬃ Morpheus, open Notepad', 'Morpheus'))
      .toEqual({ kind: 'command', text: 'open Notepad' });
  });
  it('accepts exactly one unprefixed follow-up within the shared fifteen-second window', () => {
    const session = new MorpheusVoiceDialogue();
    expect(session.accept('Morpheus', 'Morpheus', 0)).toEqual({ kind: 'wake' });
    expect(session.accept('Open Notepad', 'Morpheus', 14_999)).toEqual({ kind: 'command', text: 'Open Notepad' });
    expect(session.accept('Open Calculator', 'Morpheus', 15_000)).toEqual({ kind: 'ignore' });
  });
  it('expires and resets without preserving an implicit grant', () => {
    const session = new MorpheusVoiceDialogue();
    session.open(0);
    expect(session.accept('Open Notepad', 'Morpheus', 15_000)).toEqual({ kind: 'ignore' });
    session.open(16_000);
    session.reset();
    expect(session.accept('Open Notepad', 'Morpheus', 16_001)).toEqual({ kind: 'ignore' });
  });
});
