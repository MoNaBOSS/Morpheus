/** Morpheus Command Center — objective, Mission, trust, execution, result. */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Orbit } from 'lucide-react';

import morpheusLogo from '@/assets/morpheus-logo.svg';
import { MorpheusActionTimeline } from '@/components/morpheus/MorpheusActionTimeline';
import { MorpheusObjectiveContextPicker } from '@/components/morpheus/MorpheusObjectiveContextPicker';
import { Panel } from '@/components/morpheus/ui';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';

import { CommandBar } from './CommandBar';
import { PlanPanel } from './PlanPanel';
import { RuntimeStatusBar } from './RuntimeStatusBar';
import { MissionRail } from './MissionRail';
import { ContextRail } from './ContextRail';
import { RecentActivity } from './RecentActivity';

export function CommandCenter() {
  const { t } = useTranslation('dashboard');
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const loadActivity = useMorpheusFoundationStore((state) => state.loadActivity);
  const loadCompanion = useMorpheusCompanionStore((state) => state.loadAll);

  useEffect(() => {
    void Promise.all([loadModels(), loadActivity({ limit: 20 }), loadCompanion()]);
  }, [loadModels, loadActivity, loadCompanion]);

  return (
    <div data-morpheus data-testid="command-center-page" className="morpheus-command-center flex h-full min-h-0 flex-col overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] lg:overflow-hidden">
      <header className="relative z-10 flex shrink-0 items-center gap-4 border-b border-border/60 px-4 py-2.5">
        <div className="flex w-[174px] min-w-0 shrink-0 items-center gap-2.5">
          <div className="morpheus-mark-frame flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-[hsl(var(--morpheus-surface-2))]"><img src={morpheusLogo} alt="" aria-hidden className="h-6 w-6" /></div>
          <div><h1 data-testid="command-center-title" className="font-serif text-base font-normal tracking-[0.1em]">{t('morpheus.title')}</h1><p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.commandCenter')}</p></div>
        </div>
        <RuntimeStatusBar />
      </header>

      <div className="relative z-10 flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-2">
        <span className="flex shrink-0 items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><Orbit className="h-3.5 w-3.5 text-[hsl(var(--morpheus-accent))]" />{t('morpheus.context.title')}</span>
        <MorpheusObjectiveContextPicker className="min-w-0 flex-1" />
      </div>

      <div className="relative z-10 shrink-0 px-4 pb-3 pt-3"><CommandBar /></div>

      <div className="relative z-10 grid min-h-[560px] flex-1 border-t border-border/40 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_258px]">
        <section className="grid min-h-0 lg:grid-rows-[minmax(0,1fr)_132px]">
          <div className="grid min-h-0 grid-cols-[190px_minmax(0,1fr)] border-b border-border/60">
            <MissionRail />
            <div className="min-h-0 p-3"><PlanPanel className="h-full min-h-[280px] lg:min-h-0" /></div>
          </div>
          <div className="grid min-h-0 grid-cols-[minmax(0,1.25fr)_minmax(250px,0.75fr)]">
            <Panel testId="command-center-execution" title={<span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" />{t('morpheus.timeline.current')}</span>} className="min-h-0 overflow-hidden rounded-none border-0 border-r border-border/60 bg-transparent p-3">
              <div className="max-h-24 overflow-y-auto pr-1"><MorpheusActionTimeline limit={3} /></div>
            </Panel>
            <Panel testId="command-center-activity" title={t('morpheus.activity.recent')} className="min-h-0 overflow-hidden rounded-none border-0 bg-transparent p-3"><RecentActivity /></Panel>
          </div>
        </section>
        <ContextRail />
      </div>
    </div>
  );
}
