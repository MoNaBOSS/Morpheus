import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AgentProfileSummary } from '@shared/morpheus/agent-profile-types';
import type { MorpheusActionParams } from '@shared/morpheus/action-types';
import {
  getMorpheusActionDescriptor,
  listMorpheusApplicationKeys,
  MORPHEUS_APPLICATIONS,
  MORPHEUS_DEVELOPER_TEMPLATES,
  type MorpheusActionId,
  type MorpheusParamDescriptor,
} from '@shared/morpheus/actions/registry';
import { validateParams } from '@shared/morpheus/capabilities/params';
import type {
  MorpheusWorkflowDraft,
  MorpheusWorkflowStep,
  WorkflowTriggerType,
} from '@shared/morpheus/workflow-types';

type WorkflowEditorProps = {
  initial: MorpheusWorkflowDraft;
  builtIn: boolean;
  profiles: readonly AgentProfileSummary[];
  onClose: () => void;
  onSave: (draft: MorpheusWorkflowDraft) => Promise<boolean>;
};

type EditableParams = Record<string, string | number | boolean>;

const fieldClass = 'mt-1 w-full rounded-md border border-border/80 bg-[hsl(var(--morpheus-surface-3))] px-3 py-2 text-tiny text-foreground outline-none transition-colors focus:border-[hsl(var(--morpheus-accent-dim))]';

function copyDraft(draft: MorpheusWorkflowDraft): MorpheusWorkflowDraft {
  return structuredClone(draft);
}

function defaultParam(descriptor: MorpheusParamDescriptor): string | number | boolean {
  switch (descriptor.kind) {
    case 'applicationKey': return listMorpheusApplicationKeys()[0] ?? 'notepad';
    case 'devTemplateKey': return Object.keys(MORPHEUS_DEVELOPER_TEMPLATES)[0] ?? 'vscode';
    case 'textFileName': return 'notes.txt';
    case 'httpUrl': return 'https://';
    case 'count': return 20;
    case 'flag': return false;
    default: return '';
  }
}

function defaultParams(capabilityId: MorpheusActionId): MorpheusActionParams {
  const params: EditableParams = {};
  for (const descriptor of getMorpheusActionDescriptor(capabilityId).params) {
    if (descriptor.required) params[descriptor.key] = defaultParam(descriptor);
  }
  return params as MorpheusActionParams;
}

function nextStepId(steps: readonly MorpheusWorkflowStep[]): string {
  let number = steps.length + 1;
  while (steps.some((step) => step.stepId === `step-${number}`)) number += 1;
  return `step-${number}`;
}

function profileCapabilities(profile: AgentProfileSummary | undefined): readonly MorpheusActionId[] {
  return profile?.permissionBoundary.capabilityIds ?? [];
}

export function WorkflowEditor({ initial, builtIn, profiles, onClose, onSave }: WorkflowEditorProps) {
  const { t } = useTranslation('dashboard');
  const [draft, setDraft] = useState(() => copyDraft(initial));
  const [saving, setSaving] = useState(false);
  const selectedProfile = profiles.find((profile) => profile.profileId === draft.agentProfileId)
    ?? profiles[0];
  const allowedCapabilities = profileCapabilities(selectedProfile);

  const validation = useMemo(() => {
    if (!draft.name.trim() || !draft.agentProfileId || draft.steps.length < 1 || draft.steps.length > 32) return false;
    const ids = new Set(draft.steps.map((step) => step.stepId));
    if (ids.size !== draft.steps.length) return false;
    return draft.steps.every((step) => {
      if (!step.summary.trim() || !allowedCapabilities.includes(step.capabilityId)) return false;
      if (step.dependsOn.some((id) => !ids.has(id) || id === step.stepId)) return false;
      return validateParams(getMorpheusActionDescriptor(step.capabilityId).params, step.params).ok;
    });
  }, [allowedCapabilities, draft]);

  const updateStep = (stepId: string, update: (step: MorpheusWorkflowStep) => MorpheusWorkflowStep) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => step.stepId === stepId ? update(step) : step),
    }));
  };

  const addStep = () => {
    const capabilityId = allowedCapabilities[0];
    if (!capabilityId) return;
    setDraft((current) => {
      const stepId = nextStepId(current.steps);
      const previous = current.steps.at(-1);
      return {
        ...current,
        steps: [...current.steps, {
          stepId,
          capabilityId,
          params: defaultParams(capabilityId),
          dependsOn: previous ? [previous.stepId] : [],
          summary: t('morpheus.workflows.editor.defaultStep', { number: current.steps.length + 1 }),
        }],
      };
    });
  };

  const removeStep = (stepId: string) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps
        .filter((step) => step.stepId !== stepId)
        .map((step) => ({
          ...step,
          dependsOn: step.dependsOn.filter((dependency) => dependency !== stepId),
          condition: step.condition?.type === 'step-succeeded' && step.condition.stepId === stepId
            ? undefined
            : step.condition,
        })),
    }));
  };

  const toggleTrigger = (trigger: WorkflowTriggerType) => {
    setDraft((current) => {
      const selected = new Set(current.allowedTriggers);
      if (selected.has(trigger)) selected.delete(trigger);
      else selected.add(trigger);
      return {
        ...current,
        allowedTriggers: (['manual', 'schedule', 'app-startup'] as const).filter((item) => selected.has(item)),
      };
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent
        data-morpheus
        data-testid="workflow-editor"
        className="flex max-h-[94vh] w-[min(1040px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-xl border border-border/80 bg-[hsl(var(--morpheus-surface-1))] p-0 shadow-2xl"
      >
        <header className="shrink-0 border-b border-border/70 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-2xs uppercase tracking-[0.2em] text-[hsl(var(--morpheus-accent))]">
                {builtIn ? t('morpheus.workflows.editor.builtIn') : t('morpheus.workflows.editor.custom')}
              </p>
              <DialogTitle className="mt-1 font-serif text-xl font-normal tracking-tight">
                {draft.workflowId ? t('morpheus.workflows.editor.editTitle') : t('morpheus.workflows.editor.createTitle')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-tiny text-muted-foreground">
                {t('morpheus.workflows.editor.description')}
              </DialogDescription>
            </div>
            <label className="flex items-center gap-2 text-tiny text-muted-foreground">
              {t('morpheus.common.enabled')}
              <Switch
                data-testid="workflow-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
              />
            </label>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section className="grid gap-3 border-b border-border/60 pb-4 md:grid-cols-2">
            <label className="block text-2xs text-muted-foreground">
              {t('morpheus.workflows.editor.name')}
              <input
                data-testid="workflow-name"
                value={draft.name}
                maxLength={100}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="block text-2xs text-muted-foreground">
              {t('morpheus.workflows.agent')}
              <select
                data-testid="workflow-agent-profile"
                value={draft.agentProfileId}
                onChange={(event) => {
                  const nextProfile = profiles.find((profile) => profile.profileId === event.target.value);
                  const nextAllowed = profileCapabilities(nextProfile);
                  setDraft((current) => ({
                    ...current,
                    agentProfileId: event.target.value,
                    steps: current.steps.map((step) => nextAllowed.includes(step.capabilityId)
                      ? step
                      : {
                          ...step,
                          capabilityId: nextAllowed[0] ?? step.capabilityId,
                          params: nextAllowed[0] ? defaultParams(nextAllowed[0]) : step.params,
                        }),
                  }));
                }}
                className={fieldClass}
              >
                {profiles.filter((profile) => profile.enabled).map((profile) => (
                  <option key={profile.profileId} value={profile.profileId}>{profile.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-2xs text-muted-foreground md:col-span-2">
              {t('morpheus.workflows.editor.workflowDescription')}
              <input
                data-testid="workflow-description"
                value={draft.description}
                maxLength={400}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                className={fieldClass}
              />
            </label>
          </section>

          <section className="border-b border-border/60 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('morpheus.workflows.editor.triggers')}
                </h3>
                <p className="mt-1 text-2xs text-muted-foreground">{t('morpheus.workflows.editor.triggersDescription')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['manual', 'schedule', 'app-startup'] as const).map((trigger) => (
                  <label key={trigger} className="flex items-center gap-2 rounded-md border border-border/70 bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2 text-tiny">
                    <input
                      type="checkbox"
                      data-testid={`workflow-trigger-${trigger}`}
                      checked={draft.allowedTriggers.includes(trigger)}
                      onChange={() => toggleTrigger(trigger)}
                      className="accent-[hsl(var(--morpheus-accent))]"
                    />
                    {t(`morpheus.workflows.editor.trigger.${trigger}`)}
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('morpheus.workflows.editor.planSteps')}
                </h3>
                <p className="mt-1 text-2xs text-muted-foreground">{t('morpheus.workflows.editor.sequentialNote')}</p>
              </div>
              <button
                type="button"
                data-testid="workflow-add-step"
                onClick={addStep}
                disabled={draft.steps.length >= 32 || allowedCapabilities.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--morpheus-accent-dim))] px-3 py-2 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10 disabled:opacity-35"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('morpheus.workflows.editor.addStep')}
              </button>
            </div>

            <ol className="space-y-2" data-testid="workflow-steps">
              {draft.steps.map((step, index) => {
                const descriptor = getMorpheusActionDescriptor(step.capabilityId);
                const earlierSteps = draft.steps.slice(0, index);
                return (
                  <li key={step.stepId} data-testid={`workflow-step-${step.stepId}`} className="rounded-lg border border-border/70 bg-[hsl(var(--morpheus-surface-2))] p-3">
                    <div className="grid items-end gap-3 lg:grid-cols-[24px_120px_minmax(180px,0.85fr)_minmax(220px,1fr)_32px]">
                      <GripVertical className="mb-2 h-4 w-4 text-muted-foreground/60" aria-hidden />
                      <label className="block text-2xs text-muted-foreground">
                        {t('morpheus.workflows.editor.stepId')}
                        <input
                          value={step.stepId}
                          maxLength={64}
                          onChange={(event) => {
                            const previousId = step.stepId;
                            const nextId = event.target.value;
                            setDraft((current) => ({
                              ...current,
                              steps: current.steps.map((candidate) => {
                                if (candidate.stepId === previousId) return { ...candidate, stepId: nextId };
                                return {
                                  ...candidate,
                                  dependsOn: candidate.dependsOn.map((dependency) => dependency === previousId ? nextId : dependency),
                                  condition: candidate.condition?.type === 'step-succeeded' && candidate.condition.stepId === previousId
                                    ? { ...candidate.condition, stepId: nextId }
                                    : candidate.condition,
                                };
                              }),
                            }));
                          }}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-2xs text-muted-foreground">
                        {t('morpheus.workflows.editor.capability')}
                        <select
                          data-testid={`workflow-step-capability-${index}`}
                          value={step.capabilityId}
                          onChange={(event) => {
                            const capabilityId = event.target.value as MorpheusActionId;
                            updateStep(step.stepId, (current) => ({
                              ...current,
                              capabilityId,
                              params: defaultParams(capabilityId),
                            }));
                          }}
                          className={fieldClass}
                        >
                          {allowedCapabilities.map((capabilityId) => (
                            <option key={capabilityId} value={capabilityId}>
                              {t(getMorpheusActionDescriptor(capabilityId).labelKey)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-2xs text-muted-foreground">
                        {t('morpheus.workflows.editor.summary')}
                        <input
                          data-testid={`workflow-step-summary-${index}`}
                          value={step.summary}
                          maxLength={160}
                          onChange={(event) => updateStep(step.stepId, (current) => ({ ...current, summary: event.target.value }))}
                          className={fieldClass}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeStep(step.stepId)}
                        disabled={draft.steps.length <= 1}
                        className="mb-0.5 rounded p-2 text-muted-foreground hover:bg-white/5 hover:text-destructive disabled:opacity-25"
                        aria-label={t('morpheus.workflows.editor.removeStep')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {descriptor.params.length > 0 ? (
                      <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                        {descriptor.params.map((param) => {
                          const values = step.params as EditableParams;
                          const rawValue = values[param.key];
                          const label = t(`morpheus.workflows.editor.params.${param.key}`);
                          const setParam = (value: string | number | boolean | undefined) => {
                            updateStep(step.stepId, (current) => {
                              const next = { ...(current.params as EditableParams) };
                              if (value === undefined) delete next[param.key];
                              else next[param.key] = value;
                              return { ...current, params: next as MorpheusActionParams };
                            });
                          };

                          if (param.kind === 'applicationKey') {
                            return (
                              <label key={param.key} className="block text-2xs text-muted-foreground">
                                {label}
                                <select value={String(rawValue ?? '')} onChange={(event) => setParam(event.target.value)} className={fieldClass}>
                                  {listMorpheusApplicationKeys().map((key) => (
                                    <option key={key} value={key}>{t(MORPHEUS_APPLICATIONS[key].labelKey)}</option>
                                  ))}
                                </select>
                              </label>
                            );
                          }
                          if (param.kind === 'devTemplateKey') {
                            return (
                              <label key={param.key} className="block text-2xs text-muted-foreground">
                                {label}
                                <select value={String(rawValue ?? '')} onChange={(event) => setParam(event.target.value)} className={fieldClass}>
                                  {Object.values(MORPHEUS_DEVELOPER_TEMPLATES).map((template) => (
                                    <option key={template.key} value={template.key}>{t(template.labelKey)}</option>
                                  ))}
                                </select>
                              </label>
                            );
                          }
                          if (param.kind === 'flag') {
                            return (
                              <label key={param.key} className="flex items-center justify-between rounded-md border border-border/70 bg-[hsl(var(--morpheus-surface-3))] px-3 py-2 text-2xs text-muted-foreground">
                                {label}
                                <Switch checked={Boolean(rawValue)} onCheckedChange={setParam} />
                              </label>
                            );
                          }
                          if (param.kind === 'textContent') {
                            return (
                              <label key={param.key} className="block text-2xs text-muted-foreground sm:col-span-2 lg:col-span-3">
                                {label}
                                <Textarea
                                  value={String(rawValue ?? '')}
                                  onChange={(event) => setParam(event.target.value)}
                                  className="mt-1 min-h-20 resize-y border-border/80 bg-[hsl(var(--morpheus-surface-3))] text-tiny"
                                />
                              </label>
                            );
                          }
                          return (
                            <label key={param.key} className="block text-2xs text-muted-foreground">
                              {label}{param.required ? '' : ` · ${t('morpheus.workflows.editor.optional')}`}
                              <input
                                type={param.kind === 'count' ? 'number' : 'text'}
                                value={rawValue === undefined ? '' : String(rawValue)}
                                onChange={(event) => {
                                  if (!param.required && event.target.value === '') setParam(undefined);
                                  else setParam(param.kind === 'count' ? Number(event.target.value) : event.target.value);
                                }}
                                className={fieldClass}
                              />
                            </label>
                          );
                        })}
                      </div>
                    ) : null}

                    {earlierSteps.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                        <span className="text-2xs text-muted-foreground">{t('morpheus.workflows.editor.dependsOn')}</span>
                        {earlierSteps.map((dependency) => (
                          <label key={dependency.stepId} className="flex items-center gap-1.5 rounded border border-border/70 px-2 py-1 text-2xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={step.dependsOn.includes(dependency.stepId)}
                              onChange={() => updateStep(step.stepId, (current) => {
                                const selected = new Set(current.dependsOn);
                                if (selected.has(dependency.stepId)) selected.delete(dependency.stepId);
                                else selected.add(dependency.stepId);
                                const dependsOn = earlierSteps.map((candidate) => candidate.stepId).filter((id) => selected.has(id));
                                return {
                                  ...current,
                                  dependsOn,
                                  condition: current.condition?.type === 'step-succeeded'
                                    && !dependsOn.includes(current.condition.stepId)
                                    ? undefined
                                    : current.condition,
                                };
                              })}
                              className="accent-[hsl(var(--morpheus-accent))]"
                            />
                            {dependency.stepId}
                          </label>
                        ))}
                        {step.dependsOn.length > 0 ? (
                          <label className="ml-auto text-2xs text-muted-foreground">
                            {t('morpheus.workflows.editor.condition')}
                            <select
                              value={step.condition?.type === 'step-succeeded' ? step.condition.stepId : ''}
                              onChange={(event) => updateStep(step.stepId, (current) => ({
                                ...current,
                                condition: event.target.value
                                  ? { type: 'step-succeeded', stepId: event.target.value }
                                  : undefined,
                              }))}
                              className="ml-2 rounded border border-border/70 bg-[hsl(var(--morpheus-surface-3))] px-2 py-1 text-2xs"
                            >
                              <option value="">{t('morpheus.workflows.editor.conditions.always')}</option>
                              {step.dependsOn.map((id) => (
                                <option key={id} value={id}>{t('morpheus.workflows.editor.conditions.succeeded', { id })}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="flex flex-wrap items-center gap-5 border-t border-border/60 pt-4">
            <h3 className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('morpheus.workflows.editor.outputs')}
            </h3>
            <label className="flex items-center gap-2 text-tiny text-muted-foreground">
              <Switch
                checked={draft.outputs.collectArtifacts}
                onCheckedChange={(collectArtifacts) => setDraft((current) => ({
                  ...current,
                  outputs: { ...current.outputs, collectArtifacts },
                }))}
              />
              {t('morpheus.workflows.editor.collectArtifacts')}
            </label>
            <label className="flex items-center gap-2 text-tiny text-muted-foreground">
              <Switch
                checked={draft.outputs.retainHistory}
                onCheckedChange={(retainHistory) => setDraft((current) => ({
                  ...current,
                  outputs: { ...current.outputs, retainHistory },
                }))}
              />
              {t('morpheus.workflows.editor.retainHistory')}
            </label>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-[hsl(var(--morpheus-surface-2))] px-5 py-3">
          <p className="text-2xs text-muted-foreground">
            {t('morpheus.workflows.editor.stepCount', { count: draft.steps.length })}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-border/80 px-4 py-2 text-tiny text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40">
              {t('morpheus.common.cancel')}
            </button>
            <button
              type="button"
              data-testid="workflow-save"
              disabled={!validation || saving || draft.allowedTriggers.length === 0}
              onClick={() => {
                setSaving(true);
                void onSave(draft).then((saved) => { if (saved) onClose(); }).finally(() => setSaving(false));
              }}
              className="inline-flex min-w-28 items-center justify-center gap-1.5 rounded-md border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-4 py-2 text-tiny text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/15 disabled:opacity-35"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t('morpheus.common.save')}
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
