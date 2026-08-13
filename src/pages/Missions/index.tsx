import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clock3,
  FileText,
  Orbit,
  Play,
  RotateCcw,
  Route,
  Square,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState, StatusDot, type StatusTone } from '@/components/morpheus/ui';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import type { MorpheusMission, MorpheusMissionStatus } from '@shared/morpheus/mission-types';

function tone(status: MorpheusMissionStatus): StatusTone {
  if (status === 'completed') return 'ok';
  if (status === 'failed') return 'error';
  if (status === 'waiting-for-permission' || status === 'needs-input') return 'warn';
  if (status === 'cancelled') return 'idle';
  return 'running';
}

function MissionListItem({ mission, active, onSelect }: {
  mission: MorpheusMission;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <button
      type="button"
      data-testid={`mission-list-item-${mission.missionId}`}
      data-selected={active}
      onClick={onSelect}
      className={`w-full border-l-2 px-4 py-3 text-left transition-colors ${active ? 'border-[hsl(var(--morpheus-accent))] bg-[hsl(var(--morpheus-accent))]/[0.06]' : 'border-transparent hover:bg-white/[0.03]'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <StatusDot tone={tone(mission.status)} label={t(`morpheus.missions.status.${mission.status}`)} />
        <time className="font-mono text-[9px] text-muted-foreground">{new Date(mission.updatedAt).toLocaleDateString()}</time>
      </div>
      <p className="mt-2 line-clamp-2 text-tiny leading-relaxed text-foreground/85">{mission.objective}</p>
      <p className="mt-2 truncate font-mono text-[9px] text-muted-foreground">{mission.missionId}</p>
    </button>
  );
}

export function Missions() {
  const { t } = useTranslation('dashboard');
  const snapshot = useMorpheusCompanionStore((state) => state.missions);
  const loadMissions = useMorpheusCompanionStore((state) => state.loadMissions);
  const rerunMission = useMorpheusCompanionStore((state) => state.rerunMission);
  const cancelMission = useMorpheusCompanionStore((state) => state.cancelMission);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => { void loadMissions(); }, [loadMissions]);

  const missions = useMemo(() => snapshot.missionOrder.flatMap((id) => {
    const mission = snapshot.missionsById[id];
    return mission ? [mission] : [];
  }), [snapshot]);
  const selected = snapshot.missionsById[selectedId ?? snapshot.activeMissionId ?? snapshot.missionOrder[0]] ?? null;

  return (
    <div data-morpheus data-testid="missions-page" className="morpheus-command-center flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--morpheus-surface-1))]">
      <header className="relative z-10 flex shrink-0 items-end justify-between border-b border-border/60 px-6 py-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.25em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.missions.eyebrow')}</p>
          <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.missions.title')}</h1>
          <p className="mt-1 text-2xs text-muted-foreground">{t('morpheus.missions.description')}</p>
        </div>
        <Button asChild size="sm" className="gap-2"><Link to="/"><Orbit className="h-3.5 w-3.5" />{t('morpheus.missions.new')}</Link></Button>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-border/60 bg-[hsl(var(--morpheus-surface-2))]/55" data-testid="missions-list">
          {missions.length === 0 ? <EmptyState message={t('morpheus.missions.empty')} /> : missions.map((mission) => (
            <MissionListItem key={mission.missionId} mission={mission} active={mission.missionId === selected?.missionId} onSelect={() => setSelectedId(mission.missionId)} />
          ))}
        </aside>

        <main className="min-h-0 overflow-y-auto p-6">
          {!selected ? <EmptyState message={t('morpheus.missions.select')} /> : (
            <article data-testid="mission-detail" className="mx-auto max-w-4xl">
              <div className="flex items-start justify-between gap-5 border-b border-border/60 pb-5">
                <div className="min-w-0">
                  <StatusDot tone={tone(selected.status)} label={t(`morpheus.missions.status.${selected.status}`)} testId="mission-detail-status" />
                  <h2 className="mt-3 max-w-3xl font-serif text-3xl font-normal leading-tight">{selected.objective}</h2>
                  <p className="mt-3 font-mono text-[10px] text-muted-foreground">{selected.missionId}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selected.activeObjectiveRunId ? <Button variant="ghost" size="sm" data-testid="mission-cancel" onClick={() => void cancelMission(selected.missionId)} className="gap-2 text-[hsl(var(--morpheus-danger))]"><Square className="h-3 w-3 fill-current" />{t('morpheus.common.cancel')}</Button> : null}
                  <Button variant="outline" size="sm" data-testid="mission-rerun" disabled={rerunning || !['completed', 'failed', 'cancelled', 'needs-input'].includes(selected.status)} onClick={() => void (async () => { setRerunning(true); await rerunMission(selected.missionId); setRerunning(false); })()} className="gap-2"><RotateCcw className="h-3.5 w-3.5" />{t('morpheus.missions.rerun')}</Button>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60 py-5">
                <div className="pr-5"><p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><Route className="h-3.5 w-3.5" />{t('morpheus.missions.route')}</p><p data-testid="mission-route" className="mt-2 text-sm">{selected.route ? t(`morpheus.missions.routes.${selected.route.kind}`) : t('morpheus.missions.routeUnknown')}</p><p className="mt-1 truncate text-2xs text-muted-foreground">{selected.latestPlanId ?? selected.route?.reason ?? ''}</p></div>
                <div className="px-5"><p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><Play className="h-3.5 w-3.5" />{t('morpheus.missions.runs')}</p><p className="mt-2 text-sm">{selected.objectiveRunIds.length}</p><p className="mt-1 truncate font-mono text-2xs text-muted-foreground">{selected.objectiveRunIds.at(-1)}</p></div>
                <div className="pl-5"><p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{t('morpheus.missions.updated')}</p><p className="mt-2 text-sm">{new Date(selected.updatedAt).toLocaleString()}</p><p className="mt-1 text-2xs text-muted-foreground">{selected.projectId ?? t('morpheus.projects.none')}</p></div>
              </div>

              <section className="py-5">
                <h3 className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.missions.result')}</h3>
                <p data-testid="mission-summary" className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/85">{selected.summary ?? selected.error?.message ?? t('morpheus.missions.noSummary')}</p>
              </section>

              <section className="border-t border-border/60 pt-5">
                <div className="flex items-center justify-between"><h3 className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.missions.artifacts')}</h3><span className="font-mono text-[10px] text-muted-foreground">{selected.artifacts.length}</span></div>
                {selected.artifacts.length === 0 ? <EmptyState message={t('morpheus.missions.noArtifacts')} /> : (
                  <ol className="mt-3 divide-y divide-border/50 border-y border-border/50">
                    {selected.artifacts.map((artifact) => <li key={artifact.artifactId} className="flex items-center gap-3 py-3"><FileText className="h-4 w-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-mono text-2xs">{artifact.kind === 'file' ? artifact.path : artifact.kind === 'process' ? artifact.executablePath : artifact.artifactId}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></li>)}
                  </ol>
                )}
              </section>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
