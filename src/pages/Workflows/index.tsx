import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, GitBranch, Play } from 'lucide-react';

import { EmptyState, Panel, StatusDot } from '@/components/morpheus/ui';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';

export function Workflows() {
  const { t } = useTranslation('dashboard');
  const workflows = useMorpheusFoundationStore((state) => state.workflows);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const runWorkflow = useMorpheusFoundationStore((state) => state.runWorkflow);
  const [running, setRunning] = useState<string | null>(null);
  useEffect(() => { void loadModels(); }, [loadModels]);

  return (
    <main data-morpheus data-testid="workflows-page" className="h-full overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] p-5">
      <header className="mb-4 border-b border-border/70 pb-3">
        <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.foundation.systemBuilder')}</p>
        <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.workflows.title')}</h1>
        <p className="mt-1 max-w-2xl text-tiny text-muted-foreground">{t('morpheus.workflows.description')}</p>
      </header>

      {workflows.length === 0 ? <EmptyState message={t('morpheus.workflows.empty')} /> : (
        <div className="grid gap-3 xl:grid-cols-2">
          {workflows.map((workflow) => (
            <Panel
              key={workflow.workflowId}
              testId={`workflow-${workflow.workflowId}`}
              title={<span className="flex items-center gap-2"><GitBranch className="h-4 w-4" />{workflow.name}</span>}
              description={workflow.description}
              actions={
                <button
                  type="button"
                  data-testid={`workflow-run-${workflow.workflowId}`}
                  disabled={running !== null}
                  onClick={() => {
                    setRunning(workflow.workflowId);
                    void runWorkflow(workflow.workflowId).finally(() => setRunning(null));
                  }}
                  className="inline-flex items-center gap-1.5 rounded border border-[hsl(var(--morpheus-accent-dim))] px-2 py-1 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10 disabled:opacity-40"
                >
                  <Play className="h-3 w-3" />
                  {running === workflow.workflowId ? t('morpheus.workflows.running') : t('morpheus.workflows.run')}
                </button>
              }
            >
              <div className="mb-2 flex items-center gap-3 text-2xs text-muted-foreground">
                <span>{t('morpheus.workflows.agent')}: <b className="font-mono font-normal text-foreground">{workflow.agentProfileId}</b></span>
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
    </main>
  );
}
