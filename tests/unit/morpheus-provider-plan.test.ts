import { describe, expect, it } from 'vitest';

import {
  createPlanFromProviderText,
  createReviewFromProviderText,
  MorpheusProviderPlanError,
  parseProviderPlanText,
} from '@shared/morpheus/provider-plan';
import type { MorpheusActionId } from '@shared/morpheus/actions/registry';

const AVAILABLE: MorpheusActionId[] = [
  'system.report',
  'file.createText',
  'file.create',
  'site.verify',
  'app.launch',
  'dev.launchProject',
];

const CONTEXT = {
  planId: 'plan-provider-1',
  objective: 'Inspect the system and create notes',
  origin: { type: 'command-bar' as const, commandText: 'Inspect the system and create notes' },
  platform: 'win32' as const,
  createdAt: '2026-08-11T00:00:00.000Z',
  availableCapabilityIds: AVAILABLE,
};

describe('provider plan validation', () => {
  it('converts strict provider JSON into a Main-authored typed plan', () => {
    const plan = createPlanFromProviderText(JSON.stringify({
      steps: [
        {
          stepId: 'inspect',
          capabilityId: 'system.report',
          params: {},
          dependsOn: [],
          summary: 'Inspect privacy-safe system information',
        },
        {
          stepId: 'notes',
          capabilityId: 'file.createText',
          params: { fileName: 'notes.txt', content: 'System checked.' },
          dependsOn: ['inspect'],
          summary: 'Create notes in the trusted workspace',
        },
      ],
    }), CONTEXT);

    expect(plan).toMatchObject({
      planId: 'plan-provider-1',
      plannedBy: 'provider',
      status: 'draft',
      steps: [
        { stepId: 'inspect', capabilityId: 'system.report', dependsOn: [] },
        { stepId: 'notes', capabilityId: 'file.createText', dependsOn: ['inspect'] },
      ],
    });
    expect(plan.steps[1]?.permission).toMatchObject({
      capabilityId: 'file.createText',
      platform: 'win32',
      riskTier: 'medium',
      resourceScope: 'pending-main-resolution',
    });
  });

  it('accepts one JSON code fence without accepting surrounding prose', () => {
    expect(parseProviderPlanText('```json\n{"steps":[{"stepId":"inspect","capabilityId":"system.report","params":{},"dependsOn":[],"summary":"Inspect"}]}\n```').steps)
      .toHaveLength(1);
    expect(() => parseProviderPlanText('Here is the plan: {"steps":[]}'))
      .toThrowError(MorpheusProviderPlanError);
  });

  it.each([
    ['unknown capability', { stepId: 'bad', capabilityId: 'shell.run', params: {}, dependsOn: [], summary: 'Bad' }, 'unknown-capability'],
    ['unavailable capability', { stepId: 'bad', capabilityId: 'screen.capture', params: {}, dependsOn: [], summary: 'Bad' }, 'unknown-capability'],
    ['smuggled parameter', { stepId: 'bad', capabilityId: 'app.launch', params: { applicationKey: 'notepad', command: 'calc' }, dependsOn: [], summary: 'Bad' }, 'invalid-params'],
    ['invalid app key', { stepId: 'bad', capabilityId: 'app.launch', params: { applicationKey: 'powershell' }, dependsOn: [], summary: 'Bad' }, 'invalid-params'],
    ['invalid developer template', { stepId: 'bad', capabilityId: 'dev.launchProject', params: { templateKey: 'powershell', path: '.' }, dependsOn: [], summary: 'Bad' }, 'invalid-params'],
  ])('rejects %s', (_label, step, code) => {
    expect(() => createPlanFromProviderText(JSON.stringify({ steps: [step] }), CONTEXT))
      .toThrowError(expect.objectContaining({ code }));
  });

  it('rejects cycles before a provider plan can be registered', () => {
    const text = JSON.stringify({ steps: [
      { stepId: 'a', capabilityId: 'system.report', params: {}, dependsOn: ['b'], summary: 'A' },
      { stepId: 'b', capabilityId: 'system.report', params: {}, dependsOn: ['a'], summary: 'B' },
    ] });
    expect(() => createPlanFromProviderText(text, CONTEXT))
      .toThrowError(expect.objectContaining({ code: 'invalid-graph' }));
  });

  it('accepts a real multi-file website plan and rejects executable file reconstruction', () => {
    const plan = createPlanFromProviderText(JSON.stringify({ steps: [
      {
        stepId: 'create-site', capabilityId: 'file.create',
        params: { path: 'projects/acme/index.html', content: '<!doctype html>' },
        dependsOn: [], summary: 'Create website entry',
      },
      {
        stepId: 'verify-site', capabilityId: 'site.verify',
        params: { path: 'projects/acme' }, dependsOn: ['create-site'], summary: 'Verify site',
      },
    ] }), CONTEXT);
    expect(plan.steps.map((step) => step.capabilityId)).toEqual(['file.create', 'site.verify']);

    expect(() => createPlanFromProviderText(JSON.stringify({ steps: [{
      stepId: 'write-script', capabilityId: 'file.create',
      params: { path: 'projects/acme/run.ps1', content: 'Write-Host unsafe' },
      dependsOn: [], summary: 'Write script',
    }] }), CONTEXT)).toThrowError(expect.objectContaining({ code: 'invalid-params' }));
  });

  it('rejects unknown response fields rather than ignoring them', () => {
    const text = JSON.stringify({
      steps: [{
        stepId: 'inspect', capabilityId: 'system.report', params: {}, dependsOn: [], summary: 'Inspect',
        executablePath: 'C:\\Windows\\System32\\cmd.exe',
      }],
    });
    expect(() => createPlanFromProviderText(text, CONTEXT))
      .toThrowError(expect.objectContaining({ code: 'unknown-field' }));
  });

  it('strictly validates review decisions and continuation plans', () => {
    expect(createReviewFromProviderText('{"outcome":"complete","summary":"Finished safely."}', CONTEXT))
      .toEqual({ outcome: 'complete', summary: 'Finished safely.' });
    const continuation = createReviewFromProviderText(JSON.stringify({
      outcome: 'continue',
      reason: 'One final report is needed',
      steps: [{
        stepId: 'report', capabilityId: 'system.report', params: {}, dependsOn: [], summary: 'Report',
      }],
    }), CONTEXT);
    expect(continuation.outcome).toBe('continue');
    if (continuation.outcome === 'continue') expect(continuation.plan.steps[0]?.capabilityId).toBe('system.report');
    expect(() => createReviewFromProviderText('{"outcome":"complete","summary":"ok","shell":"cmd"}', CONTEXT))
      .toThrowError(expect.objectContaining({ code: 'unknown-field' }));
  });
});
