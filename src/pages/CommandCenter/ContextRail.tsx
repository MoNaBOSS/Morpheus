import { Layers3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ArtifactsPanel } from './ArtifactsPanel';
import { SupportedActions } from './SupportedActions';
import { TodayPanel } from './TodayPanel';
import { GoalFocus } from './GoalFocus';
import { SystemsSummary } from './SystemsSummary';

export function ContextRail() {
  const { t } = useTranslation('dashboard');
  return (
    <aside data-testid="command-center-context-rail" className="flex min-h-0 flex-col overflow-y-auto border-l border-border/60 bg-[hsl(var(--morpheus-surface-2))]/45">
      <TodayPanel limit={3} />
      <GoalFocus />
      <SystemsSummary />
      <section className="border-b border-border/50 px-3 py-2.5">
        <p className="mb-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><Layers3 className="h-3.5 w-3.5" />{t('morpheus.launcher.title')}</p>
        <SupportedActions limit={3} />
      </section>
      <section className="min-h-0 px-3 py-2.5">
        <p className="mb-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.artifacts.latest')}</p>
        <ArtifactsPanel limit={1} />
      </section>
    </aside>
  );
}
