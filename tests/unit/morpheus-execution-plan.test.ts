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

describe('filesystem intents', () => {
  const interpret = (objective: string) => interpretCommand({
    objective,
    origin: { type: 'command-bar', commandText: objective },
    platform: 'win32',
    filesRoot: 'C:\\Morpheus\\files',
  });

  function capabilityOf(objective: string): string | null {
    const result = interpret(objective);
    return result.ok ? result.plan.steps[0].capabilityId : null;
  }

  it('plans a delete, and does NOT misread it as a read', () => {
    // "delete the report file" matches the read patterns too. Resolving it as a
    // read would silently downgrade a critical intent into a medium one.
    expect(capabilityOf('delete the file report.txt')).toBe('file.delete');
    expect(capabilityOf('remove notes.txt')).toBe('file.delete');
  });

  it('marks a delete as mandatory confirmation in the plan itself', () => {
    const result = interpret('delete the file report.txt');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0].permission.riskTier).toBe('critical');
    expect(result.plan.steps[0].permission.mandatoryConfirmation).toBe(true);
  });

  it('plans folder creation', () => {
    expect(capabilityOf('create a folder named reports')).toBe('folder.create');
    expect(capabilityOf('make a directory called archive')).toBe('folder.create');
  });

  it('plans a search with the extracted term', () => {
    const result = interpret('find files named budget');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0].capabilityId).toBe('file.search');
    expect(result.plan.steps[0].params).toEqual({ query: 'budget' });
  });

  it('plans a read with the extracted path', () => {
    const result = interpret('read the file notes.txt');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0].capabilityId).toBe('file.readText');
    expect(result.plan.steps[0].params).toEqual({ path: 'notes.txt' });
  });

  it('plans a listing with no parameters', () => {
    const result = interpret('list the files in my workspace');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0].capabilityId).toBe('file.list');
    expect(result.plan.steps[0].params).toEqual({});
  });

  it('still refuses truthfully when it cannot extract a target', () => {
    // A pattern that matched without a usable path would produce a confident
    // wrong plan. Refusing is the honest outcome.
    const result = interpret('delete something');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unsupported.reason).toBe('not-understood');
  });

  it('does not mistake file creation for folder creation', () => {
    expect(capabilityOf('create a text file called notes.txt')).toBe('file.createText');
  });

  it('every planned capability is a real registry entry', () => {
    for (const objective of [
      'delete the file a.txt', 'create a folder named x', 'find files named y',
      'read the file z.txt', 'list files', 'open notepad', 'system information',
      'create a text file called n.txt',
    ]) {
      const capabilityId = capabilityOf(objective);
      expect(capabilityId, objective).not.toBeNull();
      expect(listMorpheusActionIds(), objective).toContain(capabilityId);
    }
  });
});
