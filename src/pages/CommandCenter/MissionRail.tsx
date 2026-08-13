import { Link } from 'react-router-dom';
import { ArrowUpRight, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { EmptyState, StatusDot, type StatusTone } from '@/components/morpheus/ui';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import type { MorpheusMissionStatus } from '@shared/morpheus/mission-types';

function missionTone(status: MorpheusMissionStatus): StatusTone {
  if (status === 'completed') return 'ok';
  if (status === 'failed') return 'error';
  if (status === 'waiting-for-permission' || status === 'needs-input') return 'warn';
  if (status === 'cancelled') return 'idle';
  return 'running';
}

export function MissionRail() {
  const { t } = useTranslation('dashboard');
  const snapshot = useMorpheusCompanionStore((state) => state.missions);
  const missions = snapshot.missionOrder.slice(0, 5).flatMap((id) => {
    const mission = snapshot.missionsById[id];
    return mission ? [mission] : [];
  });

  return (
    <aside data-testid="command-center-missions" className="flex min-h-0 flex-col border-r border-border/60 bg-[hsl(var(--morpheus-surface-2))]/45">
      <header className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><Target className="h-3.5 w-3.5" />{t('morpheus.missions.activeRail')}</span>
        <span className="font-mono text-[9px] text-muted-foreground">{snapshot.missionOrder.length}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {missions.length === 0 ? <EmptyState message={t('morpheus.missions.emptyCompact')} /> : (
          <ol className="divide-y divide-border/40">
            {missions.map((mission) => (
              <li key={mission.missionId} data-testid="command-center-mission">
                <Link to="/missions" className="block px-3 py-3 hover:bg-white/[0.025]">
                  <StatusDot tone={missionTone(mission.status)} label={t(`morpheus.missions.status.${mission.status}`)} />
                  <p className="mt-2 line-clamp-2 text-2xs leading-relaxed text-foreground/80">{mission.objective}</p>
                  {mission.route ? <p className="mt-1.5 truncate font-mono text-[9px] uppercase text-muted-foreground">{t(`morpheus.missions.routes.${mission.route.kind}`)}</p> : null}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Link to="/missions" className="flex items-center justify-between border-t border-border/50 px-3 py-2 text-2xs text-muted-foreground hover:text-foreground">{t('morpheus.missions.open')}<ArrowUpRight className="h-3 w-3" /></Link>
    </aside>
  );
}
