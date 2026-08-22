import { describe, expect, it } from 'vitest';

import { EXAMPLE_COMMAND } from '@/pages/CommandCenter/SupportedActions';
import { morpheusActionLabelKey } from '@/components/morpheus/morpheus-phase';
import { interpretCommand } from '@shared/morpheus/interpreter/deterministic';
import {
  getMorpheusActionDescriptor,
  listMorpheusActionIds,
} from '@shared/morpheus/actions/registry';
import enDashboard from '@shared/i18n/locales/en/dashboard.json';

function lookup(key: string): string | undefined {
  // Keys carry a `dashboard:` namespace prefix; the page resolves it via
  // useTranslation('dashboard').
  const path = key.replace(/^dashboard:/, '').split('.');
  let node: unknown = enDashboard;
  for (const segment of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

describe('capability labels', () => {
  it('every capability resolves its OWN label, not a fallback', () => {
    // The previous implementation was a hardcoded ternary that fell through to
    // `systemReport`, so every capability added after the first three rendered
    // as "Report system information".
    const labels = listMorpheusActionIds().map((actionId) => lookup(morpheusActionLabelKey(actionId)));

    for (const [index, label] of labels.entries()) {
      expect(label, listMorpheusActionIds()[index]).toBeTruthy();
    }
    expect(new Set(labels).size, 'labels must be distinct').toBe(labels.length);
  });

  it('takes the key from the descriptor', () => {
    for (const actionId of listMorpheusActionIds()) {
      expect(morpheusActionLabelKey(actionId)).toBe(getMorpheusActionDescriptor(actionId).labelKey);
    }
  });

  it('every capability has a description too', () => {
    for (const actionId of listMorpheusActionIds()) {
      expect(lookup(getMorpheusActionDescriptor(actionId).descriptionKey), actionId).toBeTruthy();
    }
  });
});

describe('launcher example commands', () => {
  it('covers every capability', () => {
    for (const actionId of listMorpheusActionIds()) {
      expect(EXAMPLE_COMMAND[actionId], actionId).toBeTruthy();
    }
  });

  it('each example actually interprets to a real plan', () => {
    // A phrase the interpreter does not recognise would make a listed
    // capability look broken the moment someone clicked Run.
    for (const [actionId, objective] of Object.entries(EXAMPLE_COMMAND)) {
      const result = interpretCommand({
        objective,
        origin: { type: 'action-launcher' },
        platform: 'win32',
        filesRoot: 'C:\\Morpheus\\files',
      });
      expect(result.ok, `${actionId}: ${objective}`).toBe(true);
    }
  });

  it('the example for a capability plans THAT capability', () => {
    for (const actionId of listMorpheusActionIds()) {
      const result = interpretCommand({
        objective: EXAMPLE_COMMAND[actionId],
        origin: { type: 'action-launcher' },
        platform: 'win32',
        filesRoot: 'C:\\Morpheus\\files',
      });
      expect(result.ok, actionId).toBe(true);
      if (!result.ok) continue;
      expect(result.plan.steps[0].capabilityId, actionId).toBe(actionId);
    }
  });
});
