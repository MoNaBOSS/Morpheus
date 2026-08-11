/** Morpheus Command Center — command, plan, trust, execution, result. */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Boxes, ShieldCheck } from 'lucide-react';

import morpheusLogo from '@/assets/morpheus-logo.svg';
import { MorpheusActionTimeline } from '@/components/morpheus/MorpheusActionTimeline';
import { PermissionCenter } from '@/components/morpheus/PermissionCenter';
import { MorpheusObjectiveContextPicker } from '@/components/morpheus/MorpheusObjectiveContextPicker';
import { Panel } from '@/components/morpheus/ui';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';

import { ArtifactsPanel } from './ArtifactsPanel';
import { CommandBar } from './CommandBar';
import { FoundationSummary } from './FoundationSummary';
import { PlanPanel } from './PlanPanel';
import { RecentActivity } from './RecentActivity';
import { RuntimeStatusBar } from './RuntimeStatusBar';
import { SupportedActions } from './SupportedActions';
import { ExecutionReadiness } from './ExecutionReadiness';

export function CommandCenter() {
  const { t } = useTranslation('dashboard');
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const loadActivity = useMorpheusFoundationStore((state) => state.loadActivity);
  const hasExecutionRuns = useMorpheusActionsStore((state) => state.runOrder.length > 0);

  useEffect(() => {
    void Promise.all([loadModels(), loadActivity({ limit: 20 })]);
  }, [loadModels, loadActivity]);

  return (
    <div
      data-morpheus
      data-testid="command-center-page"
      className="morpheus-command-center flex h-full min-h-0 flex-col overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] lg:overflow-hidden"
    >
      <header className="relative z-10 grid shrink-0 grid-cols-[170px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <div className="morpheus-mark-frame flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-[hsl(var(--morpheus-surface-2))]">
            <img src={morpheusLogo} alt="" aria-hidden className="h-6 w-6" />
          </div>
          <div>
            <h1 data-testid="command-center-title" className="font-serif text-base font-normal tracking-[0.1em]">
              {t('morpheus.title')}
            </h1>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              {t('morpheus.commandCenter')}
            </p>
          </div>
        </div>
        <RuntimeStatusBar />
        <MorpheusObjectiveContextPicker className="max-w-[330px]" />
      </header>

      <div className="relative z-10 shrink-0 px-4 pb-3 pt-3">
        <CommandBar />
      </div>

      <div className="relative z-10 grid min-h-[560px] flex-1 gap-3 px-4 pb-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_258px]">
        <section className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_146px]">
          <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(245px,0.7fr)]">
            <PlanPanel className="min-h-[260px] lg:min-h-0" />
            <Panel
              testId="command-center-execution"
              title={<span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" />{t('morpheus.timeline.current')}</span>}
              description={t('morpheus.timeline.description')}
              className="min-h-[260px] overflow-hidden lg:min-h-0"
            >
              <div className="max-h-[310px] overflow-y-auto pr-1 lg:h-[calc(100%-1.75rem)]">
                {hasExecutionRuns ? <MorpheusActionTimeline limit={5} /> : <ExecutionReadiness />}
              </div>
            </Panel>
          </div>

          <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
            <Panel testId="command-center-artifacts" title={t('morpheus.artifacts.latest')} className="min-h-0 overflow-hidden">
              <ArtifactsPanel limit={1} />
            </Panel>
            <Panel testId="command-center-activity" title={t('morpheus.activity.recent')} className="min-h-0 overflow-hidden">
              <RecentActivity />
            </Panel>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-0.5">
          <Panel
            testId="command-center-permission"
            title={<span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" />{t('morpheus.permission.centerTitle')}</span>}
            description={t('morpheus.permission.planFirst')}
          >
            <PermissionCenter compact />
          </Panel>

          <Panel testId="command-center-actions" title={t('morpheus.launcher.title')} description={t('morpheus.launcher.safeDescription')}>
            <SupportedActions limit={6} />
          </Panel>

          <Panel
            testId="command-center-builder"
            title={<span className="flex items-center gap-2"><Boxes className="h-3.5 w-3.5" />{t('morpheus.builder.title')}</span>}
          >
            <FoundationSummary />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
