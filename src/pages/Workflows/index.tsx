import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, GitBranch, Pencil, Play, Plus, Trash2 } from 'lucide-react';

import { EmptyState, Panel, StatusDot } from '@/components/morpheus/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { getMorpheusActionDescriptor, type MorpheusActionId } from '@shared/morpheus/actions/registry';
import type { MorpheusWorkflow, MorpheusWorkflowDraft } from '@shared/morpheus/workflow-types';

import { WorkflowEditor } from './WorkflowEditor';

function newWorkflowDraft(
  t: (key: string, options?: Record<string, unknown>) => string,
  profileId: string,
  capabilityIds: readonly MorpheusActionId[],
): MorpheusWorkflowDraft {
  const capabilityId = capabilityIds.find((id) => getMorpheusActionDescriptor(id).params.length === 0)
    ?? capabilityIds[0]
    ?? 'system.report';
  return {
    name: '',
    description: '',
    agentProfileId: profileId,
    steps: [{
      stepId: 'step-1',
      capabilityId,
      params: {},
      dependsOn: [],
      summary: t('morpheus.workflows.editor.defaultStep', { number: 1 }),
    }],
    allowedTriggers: ['manual'],
    outputs: { collectArtifacts: true, retainHistory: true },
    enabled: true,
  };
}

function workflowDraft(workflow: MorpheusWorkflow): MorpheusWorkflowDraft {
  const { builtIn: _builtIn, createdAt: _createdAt, updatedAt: _updatedAt, v: _v, ...draft } = workflow;
  return structuredClone(draft);
}

export function Workflows() {
  const { t } = useTranslation('dashboard');
  const workflows = useMorpheusFoundationStore((state) => state.workflows);
  const profiles = useMorpheusFoundationStore((state) => state.agentProfiles);
  const error = useMorpheusFoundationStore((state) => state.error);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const saveWorkflow = useMorpheusFoundationStore((state) => state.saveWorkflow);
  const removeWorkflow = useMorpheusFoundationStore((state) => state.removeWorkflow);
  const runWorkflow = useMorpheusFoundationStore((state) => state.runWorkflow);
  const [running, setRunning] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ draft: MorpheusWorkflowDraft; builtIn: boolean } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => { void loadModels(); }, [loadModels]);

  const createWorkflow = () => {
    const profile = profiles.find((candidate) => candidate.enabled) ?? profiles[0];
    if (!profile) return;
    setEditor({
      draft: newWorkflowDraft(t, profile.profileId, profile.permissionBoundary.capabilityIds),
      builtIn: false,
    });
  };

  return (
    <main data-morpheus data-testid="workflows-page" className="h-full overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] p-5">
      <header className="mb-4 flex items-end justify-between gap-4 border-b border-border/70 pb-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.foundation.systemBuilder')}</p>
          <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.workflows.title')}</h1>
          <p className="mt-1 max-w-2xl text-tiny text-muted-foreground">{t('morpheus.workflows.description')}</p>
        </div>
        <button
          type="button"
          data-testid="workflow-create"
          disabled={profiles.length === 0}
          onClick={createWorkflow}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-3 py-2 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/15 disabled:opacity-35"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('morpheus.workflows.create')}
        </button>
      </header>

      {error ? <p data-testid="workflows-error" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-tiny text-destructive">{error}</p> : null}
      {workflows.length === 0 ? <EmptyState message={t('morpheus.workflows.empty')} /> : (
        <div className="grid gap-3 xl:grid-cols-2">
          {workflows.map((workflow) => (
            <Panel
              key={workflow.workflowId}
              testId={`workflow-${workflow.workflowId}`}
              title={<span className="flex items-center gap-2"><GitBranch className="h-4 w-4" />{workflow.name}</span>}
              description={workflow.description}
              actions={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid={`workflow-edit-${workflow.workflowId}`}
                    onClick={() => setEditor({ draft: workflowDraft(workflow), builtIn: workflow.builtIn })}
                    className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--morpheus-accent))]"
                    aria-label={t('morpheus.common.edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!workflow.builtIn ? (
                    <button
                      type="button"
                      data-testid={`workflow-remove-${workflow.workflowId}`}
                      onClick={() => setRemovingId(workflow.workflowId)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-destructive"
                      aria-label={t('morpheus.common.remove')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid={`workflow-run-${workflow.workflowId}`}
                    disabled={running !== null || !workflow.enabled || !workflow.allowedTriggers.includes('manual')}
                    onClick={() => {
                      setRunning(workflow.workflowId);
                      void runWorkflow(workflow.workflowId).finally(() => setRunning(null));
                    }}
                    className="ml-1 inline-flex items-center gap-1.5 rounded border border-[hsl(var(--morpheus-accent-dim))] px-2 py-1 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10 disabled:opacity-40"
                  >
                    <Play className="h-3 w-3" />
                    {running === workflow.workflowId ? t('morpheus.workflows.running') : t('morpheus.workflows.run')}
                  </button>
                </div>
              }
            >
              <div className="mb-2 flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
                <StatusDot tone={workflow.enabled ? 'ok' : 'idle'} label={workflow.enabled ? t('morpheus.common.enabled') : t('morpheus.common.disabled')} />
                <span>{t('morpheus.workflows.agent')}: <b className="font-mono font-normal text-foreground">{profiles.find((profile) => profile.profileId === workflow.agentProfileId)?.name ?? workflow.agentProfileId}</b></span>
                <span>{workflow.steps.length} {t('morpheus.workflows.steps')}</span>
              </div>
              <ol className="space-y-1">
                {workflow.steps.map((step, index) => (
                  <li key={step.stepId} className="flex items-center gap-2 rounded bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2">
                    <StatusDot tone={index === 0 ? 'ok' : 'idle'} />
                    <span className="w-5 font-mono text-2xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate text-tiny">{step.summary}</span>
                    {step.dependsOn.length > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                    <code className="text-2xs text-muted-foreground">{step.capabilityId}</code>
                  </li>
                ))}
              </ol>
            </Panel>
          ))}
        </div>
      )}

      {editor ? (
        <WorkflowEditor
          key={editor.draft.workflowId ?? 'new'}
          initial={editor.draft}
          builtIn={editor.builtIn}
          profiles={profiles}
          onClose={() => setEditor(null)}
          onSave={async (draft) => Boolean(await saveWorkflow(draft))}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(removingId)}
        title={t('morpheus.workflows.removeTitle')}
        message={t('morpheus.workflows.removeDescription')}
        confirmLabel={t('morpheus.common.remove')}
        cancelLabel={t('morpheus.common.cancel')}
        variant="destructive"
        onCancel={() => setRemovingId(null)}
        onConfirm={async () => {
          if (!removingId) return;
          await removeWorkflow(removingId);
          setRemovingId(null);
        }}
      />
    </main>
  );
}
