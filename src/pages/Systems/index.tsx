import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowDown,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircuitBoard,
  FlaskConical,
  FolderLock,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { EmptyState, StatusDot, type StatusTone } from '@/components/morpheus/ui';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { useMorpheusSystemsStore } from '@/stores/morpheus-systems';
import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';
import type { MorpheusSystem, MorpheusSystemDraft, MorpheusSystemStatus } from '@shared/morpheus/system-types';

const FIELD = 'morpheus-field h-9 text-xs';

function statusTone(status: MorpheusSystemStatus): StatusTone {
  if (status === 'active' || status === 'tested') return 'ok';
  if (status === 'invalid') return 'error';
  if (status === 'draft') return 'warn';
  return 'idle';
}

function fromSystem(system: MorpheusSystem): MorpheusSystemDraft {
  return {
    systemId: system.systemId,
    name: system.name,
    description: system.description,
    workflowId: system.workflowId,
    workspaceId: system.workspaceId,
    ...(system.projectId ? { projectId: system.projectId } : {}),
    scheduleIds: [...system.scheduleIds],
    outputs: structuredClone(system.outputs),
  };
}

export function Systems() {
  const { t } = useTranslation('dashboard');
  const [searchParams, setSearchParams] = useSearchParams();
  const systems = useMorpheusSystemsStore((state) => state.snapshot.systems);
  const loadSystems = useMorpheusSystemsStore((state) => state.load);
  const saveSystem = useMorpheusSystemsStore((state) => state.save);
  const removeSystem = useMorpheusSystemsStore((state) => state.remove);
  const testSystem = useMorpheusSystemsStore((state) => state.test);
  const activateSystem = useMorpheusSystemsStore((state) => state.activate);
  const pauseSystem = useMorpheusSystemsStore((state) => state.pause);
  const runSystem = useMorpheusSystemsStore((state) => state.run);
  const busySystemId = useMorpheusSystemsStore((state) => state.busySystemId);
  const error = useMorpheusSystemsStore((state) => state.error);
  const workflows = useMorpheusFoundationStore((state) => state.workflows);
  const schedules = useMorpheusFoundationStore((state) => state.schedules);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const projects = useMorpheusCompanionStore((state) => state.projects.projects);
  const loadContext = useMorpheusCompanionStore((state) => state.loadContext);
  const workspaceSnapshot = useMorpheusWorkspacesStore((state) => state.snapshot);
  const selectedWorkspaceId = useMorpheusWorkspacesStore((state) => state.selectedWorkspaceId);
  const loadWorkspaces = useMorpheusWorkspacesStore((state) => state.load);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MorpheusSystemDraft | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([loadSystems(), loadModels(), loadContext(), loadWorkspaces()]);
  }, [loadContext, loadModels, loadSystems, loadWorkspaces]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? systems.filter((system) => `${system.name} ${system.description}`.toLocaleLowerCase().includes(query)) : systems;
  }, [search, systems]);
  const requestedId = searchParams.get('systemId');
  const effectiveSelectedId = selectedId && systems.some((system) => system.systemId === selectedId)
    ? selectedId
    : requestedId && systems.some((system) => system.systemId === requestedId)
      ? requestedId
      : systems[0]?.systemId ?? null;
  const selected = systems.find((system) => system.systemId === effectiveSelectedId) ?? null;
  const workflow = workflows.find((candidate) => candidate.workflowId === (draft?.workflowId ?? selected?.workflowId));
  const workspaces = workspaceSnapshot?.workspaces.filter((workspace) => workspace.enabled && workspace.available) ?? [];
  const activeDraft = draft;
  const matchingSchedules = schedules.filter((schedule) => (
    schedule.workflowId === activeDraft?.workflowId && schedule.workspaceId === activeDraft.workspaceId
  ));
  const matchingProjects = projects.filter((project) => project.enabled && project.workspaceId === activeDraft?.workspaceId);
  const canSave = Boolean(activeDraft?.name.trim() && activeDraft.workflowId && activeDraft.workspaceId);

  const beginNew = () => {
    const firstWorkflow = workflows.find((candidate) => candidate.enabled);
    const workspaceId = workspaces.some((workspace) => workspace.workspaceId === selectedWorkspaceId)
      ? selectedWorkspaceId : workspaces[0]?.workspaceId ?? 'morpheus-files';
    setDraft({
      name: '', description: '', workflowId: firstWorkflow?.workflowId ?? '', workspaceId,
      scheduleIds: [], outputs: { collectArtifacts: true, retainHistory: true },
    });
  };
  const selectSystem = (systemId: string) => {
    setSelectedId(systemId);
    setDraft(null);
    setSearchParams({ systemId }, { replace: true });
  };

  return (
    <main data-morpheus data-testid="systems-page" className="morpheus-command-center flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--morpheus-surface-1))]">
      <header className="relative z-10 flex h-[74px] shrink-0 items-center justify-between border-b border-border/60 px-5">
        <div>
          <h1 className="font-serif text-2xl font-normal tracking-tight">{t('morpheus.systems.title')}</h1>
          <p className="mt-1 text-2xs text-muted-foreground">{t('morpheus.systems.description')}</p>
        </div>
        <button type="button" data-testid="system-new" onClick={beginNew} className="flex items-center gap-1.5 rounded border border-[hsl(var(--morpheus-accent-dim))] px-3 py-2 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10">
          <Plus className="h-3.5 w-3.5" />{t('morpheus.systems.new')}
        </button>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(380px,1fr)_250px]">
        <aside className="flex min-h-0 flex-col border-r border-border/60 bg-[hsl(var(--morpheus-surface-2))]/45">
          <div className="border-b border-border/50 p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <input data-testid="systems-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('morpheus.systems.search')} className="morpheus-field h-9 pl-8 text-xs" />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="systems-list">
            {filtered.length === 0 ? <EmptyState message={t('morpheus.systems.empty')} /> : filtered.map((system) => (
              <button
                key={system.systemId}
                type="button"
                data-testid={`system-list-${system.systemId}`}
                data-selected={system.systemId === selected?.systemId}
                onClick={() => selectSystem(system.systemId)}
                className={`w-full border-b border-l-2 border-b-border/35 px-3 py-3 text-left ${system.systemId === selected?.systemId ? 'border-l-[hsl(var(--morpheus-accent))] bg-[hsl(var(--morpheus-accent))]/[0.055]' : 'border-l-transparent hover:bg-white/[0.025]'}`}
              >
                <div className="flex items-center gap-2"><StatusDot tone={statusTone(system.status)} /><span className="min-w-0 flex-1 truncate text-xs font-medium">{system.name}</span></div>
                <p className="mt-1.5 truncate font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{t(`morpheus.systems.status.${system.status}`)} · {system.capabilityIds.length} {t('morpheus.systems.capabilities')}</p>
              </button>
            ))}
          </div>
          <div className="border-t border-border/50 px-3 py-2 font-mono text-[9px] text-muted-foreground">{systems.length} {t('morpheus.systems.count')}</div>
        </aside>

        <section className="flex min-h-0 flex-col border-r border-border/60">
          {activeDraft ? (
            <SystemEditor
              draft={activeDraft}
              workflows={workflows}
              workspaces={workspaces}
              projects={matchingProjects}
              schedules={matchingSchedules}
              canSave={canSave}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={() => {
                if (!canSave) return;
                void saveSystem(activeDraft).then((system) => {
                  if (!system) return;
                  selectSystem(system.systemId);
                  setDraft(null);
                });
              }}
            />
          ) : !selected ? <EmptyState message={t('morpheus.systems.select')} /> : (
            <>
              <div className="shrink-0 border-b border-border/60 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><StatusDot tone={statusTone(selected.status)} label={t(`morpheus.systems.status.${selected.status}`)} /><span className="font-mono text-[9px] text-muted-foreground">{selected.systemId}</span></div>
                    <h2 className="mt-2 font-serif text-2xl font-normal tracking-tight">{selected.name}</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{selected.description || t('morpheus.systems.noDescription')}</p>
                  </div>
                  <button type="button" disabled={selected.status === 'active'} onClick={() => setDraft(fromSystem(selected))} className="rounded p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-30" aria-label={t('morpheus.common.edit')}><Pencil className="h-4 w-4" /></button>
                </div>
                {selected.invalidReason ? <p data-testid="system-invalid-reason" className="mt-3 flex items-center gap-2 rounded border border-[hsl(var(--morpheus-danger))]/35 bg-[hsl(var(--morpheus-danger))]/[0.05] px-3 py-2 text-2xs text-[hsl(var(--morpheus-danger))]"><AlertTriangle className="h-3.5 w-3.5" />{selected.invalidReason}</p> : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="mb-3 flex items-center justify-between"><h3 className="font-serif text-lg font-normal">{t('morpheus.systems.executionPlan')}</h3><span className="font-mono text-[9px] uppercase text-muted-foreground">{workflow?.steps.length ?? 0} {t('morpheus.systems.steps')}</span></div>
                {!workflow ? <EmptyState message={t('morpheus.systems.workflowUnavailable')} /> : (
                  <ol data-testid="system-plan" className="space-y-0">
                    {workflow.steps.map((step, index) => (
                      <li key={step.stepId}>
                        <div className="grid grid-cols-[28px_42px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border/55 bg-[hsl(var(--morpheus-surface-2))]/65 px-3 py-3">
                          <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                          <span className="flex h-9 w-9 items-center justify-center rounded border border-[hsl(var(--morpheus-accent-dim))]/40 bg-[hsl(var(--morpheus-accent))]/[0.055] text-[hsl(var(--morpheus-accent))]"><CircuitBoard className="h-4 w-4" /></span>
                          <div className="min-w-0"><p className="truncate text-xs font-medium">{step.summary}</p><p className="mt-1 truncate font-mono text-[9px] text-muted-foreground">{step.capabilityId}{step.dependsOn.length ? ` · ${t('morpheus.systems.dependsOn')} ${step.dependsOn.join(', ')}` : ''}</p></div>
                        </div>
                        {index < workflow.steps.length - 1 ? <div className="flex h-5 items-center pl-[45px]"><ArrowDown className="h-3 w-3 text-muted-foreground" /></div> : null}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-[hsl(var(--morpheus-accent-dim))]/35 bg-[hsl(var(--morpheus-accent))]/[0.035] px-3 py-3 text-2xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--morpheus-accent))]" /><span>{t('morpheus.systems.trustDisclosure')}</span></div>
                {selected.runHistory.length > 0 ? (
                  <div className="mt-5"><h3 className="mb-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.systems.runHistory')}</h3><ol className="divide-y divide-border/45 border-y border-border/45">{selected.runHistory.slice(-5).reverse().map((run) => <li key={run.runId} className="flex items-center gap-3 py-2.5"><StatusDot tone={run.status === 'completed' ? 'ok' : run.status === 'partially-completed' ? 'warn' : 'error'} /><span className="min-w-0 flex-1 truncate text-2xs">{t(`morpheus.systems.runKinds.${run.kind}`)} · {t(`morpheus.systems.runStatus.${run.status}`)}</span><time className="font-mono text-[9px] text-muted-foreground">{new Date(run.completedAt).toLocaleString()}</time></li>)}</ol></div>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 bg-[hsl(var(--morpheus-surface-2))]/45 px-5 py-3">
                <button type="button" data-testid="system-remove" disabled={selected.status === 'active' || busySystemId === selected.systemId} onClick={() => setRemoveId(selected.systemId)} className="rounded p-2 text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--morpheus-danger))] disabled:opacity-30" aria-label={t('morpheus.common.remove')}><Trash2 className="h-4 w-4" /></button>
                <div className="flex items-center gap-2">
                  <ActionButton testId="system-test" label={t('morpheus.systems.test')} icon={<FlaskConical className="h-3.5 w-3.5" />} disabled={selected.status === 'active' || selected.status === 'invalid' || busySystemId !== null} onClick={() => void testSystem(selected.systemId)} />
                  {selected.status === 'active' ? <ActionButton testId="system-pause" label={t('morpheus.systems.pause')} icon={<Pause className="h-3.5 w-3.5" />} disabled={busySystemId !== null} onClick={() => void pauseSystem(selected.systemId)} /> : <ActionButton testId="system-activate" label={t('morpheus.systems.activate')} icon={<Zap className="h-3.5 w-3.5" />} accent disabled={!['tested', 'paused'].includes(selected.status) || busySystemId !== null} onClick={() => void activateSystem(selected.systemId)} />}
                  <ActionButton testId="system-run" label={t('morpheus.systems.run')} icon={<Play className="h-3.5 w-3.5" />} accent disabled={selected.status !== 'active' || busySystemId !== null} onClick={() => void runSystem(selected.systemId)} />
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto bg-[hsl(var(--morpheus-surface-2))]/35 p-3">
          {!selected || activeDraft ? <EmptyState message={t('morpheus.systems.detailsHint')} /> : (
            <div className="space-y-3" data-testid="system-boundary">
              <DetailPanel icon={<Bot className="h-3.5 w-3.5" />} title={t('morpheus.systems.agent')}><p className="text-xs font-medium">{selected.agentProfileId}</p><p className="mt-1 text-[10px] text-muted-foreground">{workflow?.name ?? selected.workflowId}</p></DetailPanel>
              <DetailPanel icon={<FolderLock className="h-3.5 w-3.5" />} title={t('morpheus.systems.workspace')}><p className="break-all font-mono text-[10px]">{selected.workspaceId}</p>{selected.projectId ? <p className="mt-1 text-[10px] text-muted-foreground">{selected.projectId}</p> : null}</DetailPanel>
              <DetailPanel icon={<CalendarClock className="h-3.5 w-3.5" />} title={t('morpheus.systems.schedules')}><p className="text-xs">{selected.scheduleIds.length ? selected.scheduleIds.join(', ') : t('morpheus.systems.manualOnly')}</p></DetailPanel>
              <DetailPanel icon={<ShieldCheck className="h-3.5 w-3.5" />} title={t('morpheus.systems.permissionBoundary')}><ul className="space-y-1">{selected.capabilityIds.map((id) => <li key={id} className="font-mono text-[10px] text-foreground/80">• {id}</li>)}</ul></DetailPanel>
              <DetailPanel icon={<CheckCircle2 className="h-3.5 w-3.5" />} title={t('morpheus.systems.testEvidence')}><p className="text-xs">{selected.lastTestStatus ? t(`morpheus.systems.runStatus.${selected.lastTestStatus}`) : t('morpheus.systems.notTested')}</p>{selected.lastTestedAt ? <time className="mt-1 block font-mono text-[9px] text-muted-foreground">{new Date(selected.lastTestedAt).toLocaleString()}</time> : null}{selected.lastTestMissionId ? <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">{selected.lastTestMissionId}</p> : null}</DetailPanel>
              {error ? <p className="rounded border border-[hsl(var(--morpheus-danger))]/30 px-3 py-2 text-2xs text-[hsl(var(--morpheus-danger))]">{error}</p> : null}
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(removeId)}
        title={t('morpheus.systems.removeTitle')}
        message={t('morpheus.systems.removeMessage')}
        confirmLabel={t('morpheus.common.remove')}
        cancelLabel={t('morpheus.common.cancel')}
        variant="destructive"
        onCancel={() => setRemoveId(null)}
        onConfirm={async () => {
          if (!removeId) return;
          if (await removeSystem(removeId)) { setSelectedId(null); setSearchParams({}, { replace: true }); }
          setRemoveId(null);
        }}
      />
    </main>
  );
}

function DetailPanel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-border/55 bg-[hsl(var(--morpheus-surface-3))]/55 p-3"><h3 className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{icon}{title}</h3>{children}</section>;
}

function ActionButton({ testId, label, icon, disabled, accent = false, onClick }: { testId: string; label: string; icon: ReactNode; disabled: boolean; accent?: boolean; onClick: () => void }) {
  return <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} className={`flex items-center gap-1.5 rounded border px-3 py-2 text-2xs disabled:opacity-30 ${accent ? 'border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 text-[hsl(var(--morpheus-accent))]' : 'border-border text-foreground/80 hover:bg-white/5'}`}>{icon}{label}</button>;
}

function SystemEditor({ draft, workflows, workspaces, projects, schedules, canSave, onChange, onCancel, onSave }: {
  draft: MorpheusSystemDraft;
  workflows: readonly { workflowId: string; name: string; enabled: boolean }[];
  workspaces: readonly { workspaceId: string; name: string }[];
  projects: readonly { projectId: string; name: string }[];
  schedules: readonly { scheduleId: string; name: string }[];
  canSave: boolean;
  onChange: (draft: MorpheusSystemDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation('dashboard');
  return <form data-testid="system-editor" className="min-h-0 flex-1 overflow-y-auto p-5" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
    <div className="mx-auto max-w-2xl space-y-4">
      <div><h2 className="font-serif text-2xl font-normal">{draft.systemId ? t('morpheus.systems.edit') : t('morpheus.systems.new')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('morpheus.systems.editorDescription')}</p></div>
      <label className="block text-2xs text-muted-foreground">{t('morpheus.systems.name')}<input data-testid="system-name" maxLength={100} value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} className={`mt-1 ${FIELD}`} /></label>
      <label className="block text-2xs text-muted-foreground">{t('morpheus.systems.descriptionLabel')}<textarea data-testid="system-description" maxLength={500} value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} className="morpheus-field mt-1 min-h-20 resize-y text-xs" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-2xs text-muted-foreground">{t('morpheus.systems.workflow')}<select data-testid="system-workflow" value={draft.workflowId} onChange={(event) => onChange({ ...draft, workflowId: event.target.value, scheduleIds: [] })} className={`mt-1 ${FIELD}`}>{workflows.filter((item) => item.enabled).map((item) => <option key={item.workflowId} value={item.workflowId}>{item.name}</option>)}</select></label>
        <label className="block text-2xs text-muted-foreground">{t('morpheus.systems.workspace')}<select data-testid="system-workspace" value={draft.workspaceId} onChange={(event) => onChange({ ...draft, workspaceId: event.target.value, projectId: undefined, scheduleIds: [] })} className={`mt-1 ${FIELD}`}>{workspaces.map((item) => <option key={item.workspaceId} value={item.workspaceId}>{item.name}</option>)}</select></label>
      </div>
      <label className="block text-2xs text-muted-foreground">{t('morpheus.systems.project')}<select data-testid="system-project" value={draft.projectId ?? ''} onChange={(event) => onChange({ ...draft, projectId: event.target.value || undefined })} className={`mt-1 ${FIELD}`}><option value="">{t('morpheus.projects.none')}</option>{projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.name}</option>)}</select></label>
      <div><p className="mb-2 text-2xs text-muted-foreground">{t('morpheus.systems.schedules')}</p>{schedules.length === 0 ? <p className="rounded border border-border/50 px-3 py-2 text-xs text-muted-foreground">{t('morpheus.systems.noMatchingSchedules')}</p> : <div className="space-y-2">{schedules.map((schedule) => <label key={schedule.scheduleId} className="flex items-center justify-between rounded border border-border/50 px-3 py-2 text-xs"><span>{schedule.name}</span><Switch checked={draft.scheduleIds.includes(schedule.scheduleId)} onCheckedChange={(checked) => onChange({ ...draft, scheduleIds: checked ? [...draft.scheduleIds, schedule.scheduleId] : draft.scheduleIds.filter((id) => id !== schedule.scheduleId) })} /></label>)}</div>}</div>
      <div className="grid gap-2 sm:grid-cols-2">{(['collectArtifacts', 'retainHistory'] as const).map((key) => <label key={key} className="flex items-center justify-between gap-2 rounded border border-border/50 px-3 py-2 text-[10px] text-muted-foreground"><span>{t(`morpheus.systems.outputs.${key}`)}</span><Switch checked={draft.outputs[key]} onCheckedChange={(checked) => onChange({ ...draft, outputs: { ...draft.outputs, [key]: checked } })} /></label>)}</div>
      <div className="flex justify-end gap-2 border-t border-border/60 pt-4"><button type="button" onClick={onCancel} className="rounded border border-border px-4 py-2 text-2xs text-muted-foreground hover:bg-white/5">{t('morpheus.common.cancel')}</button><button type="submit" data-testid="system-save" disabled={!canSave} className="rounded border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-4 py-2 text-2xs text-[hsl(var(--morpheus-accent))] disabled:opacity-30">{t('morpheus.common.save')}</button></div>
    </div>
  </form>;
}
