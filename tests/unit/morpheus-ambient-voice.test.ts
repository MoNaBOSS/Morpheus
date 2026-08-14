import { describe, expect, it } from 'vitest';

import { extractMorpheusWakeObjective } from '@/lib/morpheus-ambient-voice';

describe('ambient Morpheus wake phrase', () => {
  it('extracts an objective only after the exact normalized token sequence', () => {
    expect(extractMorpheusWakeObjective('Hey, MORPHEUS — open Notepad.', 'hey morpheus'))
      .toBe('open Notepad.');
    expect(extractMorpheusWakeObjective('Morpheus create notes.txt', 'Morpheus'))
      .toBe('create notes.txt');
  });

  it('does not create work for ordinary speech, partial matches, or an empty objective', () => {
    expect(extractMorpheusWakeObjective('Open Notepad please', 'Morpheus')).toBeNull();
    expect(extractMorpheusWakeObjective('Morph us open Notepad', 'Morpheus')).toBeNull();
    expect(extractMorpheusWakeObjective('Morpheus!', 'Morpheus')).toBeNull();
  });
});
