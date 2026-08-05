import { describe, expect, it } from 'vitest';

import {
  extractFileContent,
  extractFileName,
  interpretCommand,
} from '@shared/morpheus/interpreter/deterministic';
import {
  MORPHEUS_PLAN_VERSION,
  isExecutionPlanTerminal,
  type ExecutionOrigin,
} from '@shared/morpheus/execution-types';
import { listMorpheusActionIds } from '@shared/morpheus/actions/registry';

const ORIGIN: ExecutionOrigin = { type: 'command-bar', commandText: 'test' };
const FILES_ROOT = 'C:\\Users\\test\\AppData\\Roaming\\Morpheus\\morpheus\\files';

function interpret(objective: string) {
  return interpretCommand({ objective, origin: ORIGIN, platform: 'win32', filesRoot: FILES_ROOT });
}

describe('supported command interpretation', () => {
  it('maps system-information phrasings to system.report', () => {
    for (const command of [
      'Show system information',
      'system info',
      'report system status',
      'what are my specs',
      'display machine information',
    ]) {
      const result = interpret(command);
      expect(result.ok, command).toBe(true);
      if (!result.ok) return;
      expect(result.plan.steps[0].capabilityId).toBe('system.report');
    }
  });

  it('maps launch phrasings to app.launch with the approved key', () => {
    for (const command of ['Open Notepad', 'launch notepad', 'start Notepad please', 'run notepad']) {
      const result = interpret(command);
      expect(result.ok, command).toBe(true);
      if (!result.ok) return;
      expect(result.plan.steps[0].capabilityId).toBe('app.launch');
      // The renderer never names an executable; only a registry key.
      expect(result.plan.steps[0].params.applicationKey).toBe('notepad');
    }
  });

  it('maps file phrasings to file.createText', () => {
    for (const command of [
      'Create a text file named notes.txt',
      'make a new file',
      'write a file called report',
      'save notes.txt',
    ]) {
      const result = interpret(command);
      expect(result.ok, command).toBe(true);
      if (!result.ok) return;
      expect(result.plan.steps[0].capabilityId).toBe('file.createText');
    }
  });

  it('prefers file creation over app launch when both could match', () => {
    // "create a file called notepad.txt" must not be read as "open Notepad".
    const result = interpret('create a file called notepad.txt');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0].capabilityId).toBe('file.createText');
    expect(result.plan.steps[0].params.fileName).toBe('notepad.txt');
  });
});

describe('typed plan structure', () => {
  it('produces a versioned single-step plan with a permission requirement', () => {
    const result = interpret('Show system information');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { plan } = result;
    expect(plan.v).toBe(MORPHEUS_PLAN_VERSION);
    expect(plan.planId).toBeTruthy();
    expect(plan.status).toBe('draft');
    expect(plan.origin).toEqual(ORIGIN);
    expect(plan.steps).toHaveLength(1);

    const step = plan.steps[0];
    expect(step.dependsOn).toEqual([]);
    expect(step.permission).toEqual({
      capabilityId: 'system.report',
      platform: 'win32',
      riskTier: 'low',
      resourceScope: 'runtime',
      mandatoryConfirmation: false,
    });
  });

  it('records who planned it, so a future planner is distinguishable', () => {
    const result = interpret('Open Notepad');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The contract is planner-agnostic; only this field changes when an AI
    // planner replaces the deterministic one.
    expect(result.plan.plannedBy).toBe('deterministic');
  });

  it('scopes a file write to the canonical approved root, not a user path', () => {
    const result = interpret('create notes.txt');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0].permission.resourceScope).toBe(FILES_ROOT);
  });

  it('scopes a launch to the application key', () => {
    const result = interpret('open notepad');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0].permission.resourceScope).toBe('notepad');
  });

  it('marks medium-risk steps as not mandatory-confirmation', () => {
    const result = interpret('open notepad');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0].permission.riskTier).toBe('medium');
    expect(result.plan.steps[0].permission.mandatoryConfirmation).toBe(false);
  });
});

describe('unsupported commands are answered truthfully', () => {
  it('refuses rather than inventing a capability', () => {
    for (const command of [
      'delete all my files',
      'transfer 3 bitcoin to my wallet',
      'run powershell as administrator',
      'install visual studio',
      'post this to twitter',
      'asdfghjkl',
    ]) {
      const result = interpret(command);
      expect(result.ok, command).toBe(false);
      if (result.ok) return;
      expect(result.unsupported.reason).toBe('not-understood');
    }
  });

  it('lists what Morpheus genuinely supports', () => {
    const result = interpret('mine cryptocurrency');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unsupported.supportedCapabilities).toEqual(listMorpheusActionIds());
  });

  it('treats an empty command as not understood', () => {
    const result = interpret('   ');
    expect(result.ok).toBe(false);
  });
});

describe('parameter extraction', () => {
  it('takes an explicit .txt name', () => {
    expect(extractFileName('create notes.txt')).toBe('notes.txt');
    expect(extractFileName('make a file named report-2026.txt')).toBe('report-2026.txt');
  });

  it('derives a name from "named"/"called"', () => {
    expect(extractFileName('create a file named summary')).toBe('summary.txt');
    expect(extractFileName('make a file called meeting')).toBe('meeting.txt');
  });

  it('falls back to a safe default', () => {
    expect(extractFileName('create a text file')).toBe('note.txt');
  });

  it('extracts quoted content but never mistakes a filename for content', () => {
    expect(extractFileContent('create a file saying "hello world"')).toBe('hello world');
    expect(extractFileContent('create "notes.txt"')).toBe('Created by Morpheus.');
  });

  it('extracts trailing content phrasing', () => {
    expect(extractFileContent('create notes.txt containing my meeting agenda'))
      .toBe('my meeting agenda');
  });
});

describe('plan status', () => {
  it('identifies terminal statuses', () => {
    for (const status of ['completed', 'partially-completed', 'failed', 'rejected', 'cancelled'] as const) {
      expect(isExecutionPlanTerminal(status)).toBe(true);
    }
    for (const status of ['draft', 'awaiting-permission', 'executing'] as const) {
      expect(isExecutionPlanTerminal(status)).toBe(false);
    }
  });
});
