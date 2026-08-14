import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Check, CircleDot, Flag, Pause, Play, Plus, Save, Target, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { EmptyState, StatusDot } from '@/components/morpheus/ui';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';
import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';
import {
  morpheusGoalProgress,
  type MorpheusGoal,
  type MorpheusGoalDraft,
  type MorpheusGoalMilestoneDraft,
} from '@shared/morpheus/goal-types';

function draftFrom(goal: MorpheusGoal): MorpheusGoalDraft {
  return {
    goalId: goal.goalId, name: goal.name, objective: goal.objective,
    successCriteria: goal.successCriteria, status: goal.status,
    targetDate: goal.targetDate, projectId: goal.projectId, workspaceId: goal.workspaceId,
    agentProfileId: goal.agentProfileId, nextAction: goal.nextAction,
    milestones: goal.milestones.map(({ milestoneId, title, status, targetDate }) => ({
      milestoneId, title, status, targetDate,
    })),
  };
}

function emptyDraft(projectId = 'personal', workspaceId = 'morpheus-files'): MorpheusGoalDraft {
  return {
    name: '', objective: '', successCriteria: '', status: 'active', projectId,
    workspaceId, agentProfileId: 'general', nextAction: '', milestones: [],
  };
}

export function Goals() {
  const { t } = useTranslation('dashboard');
  const goals = useMorpheusIntelligenceStore((state) => state.goals.goals);
  const error = useMorpheusIntelligenceStore((state) => state.error);
  const load = useMorpheusIntelligenceStore((state) => state.load);
  const saveGoal = useMorpheusIntelligenceStore((state) => state.saveGoal);
  const removeGoal = useMorpheusIntelligenceStore((state) => state.removeGoal);
  const continueGoal = useMorpheusIntelligenceStore((state) => state.continueGoal);
  const projects = useMorpheusCompanionStore((state) => state.projects.projects);
  const loadContext = useMorpheusCompanionStore((state) => state.loadContext);
  const profiles = useMorpheusFoundationStore((state) => state.agentProfiles);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const workspaces = useMorpheusWorkspacesStore((state) => state.snapshot?.workspaces ?? []);
  const loadWorkspaces = useMorpheusWorkspacesStore((state) => state.load);
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<MorpheusGoalDraft>(() => emptyDraft());
  const [saving, setSaving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    void Promise.all([load(), loadContext(), loadModels(), loadWorkspaces()]);
  }, [load, loadContext, loadModels, loadWorkspaces]);

  const selected = useMemo(() => {
    if (selectedId === 'new') return null;
    return goals.find((goal) => goal.goalId === selectedId) ?? goals[0] ?? null;
  }, [goals, selectedId]);
  const visible = selected && draft.goalId !== selected.goalId ? draftFrom(selected) : draft;
  const choose = (goal: MorpheusGoal): void => { setSelectedId(goal.goalId); setDraft(draftFrom(goal)); };
  const startNew = (): void => {
    const project = projects.find((item) => item.enabled) ?? projects[0];
    setSelectedId('new');
    setDraft(emptyDraft(project?.projectId, project?.workspaceId));
  };
  const patchMilestone = (index: number, patch: Partial<MorpheusGoalMilestoneDraft>): void => {
    setDraft({
      ...visible,
      milestones: visible.milestones.map((milestone, position) => position === index ? { ...milestone, ...patch } : milestone),
    });
  };

  return (
    <div data-morpheus data-testid="goals-page" className="morpheus-command-center flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--morpheus-surface-1))]">
      <header className="flex shrink-0 items-end justify-between border-b border-border/60 px-6 py-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.25em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.goals.eyebrow')}</p>
          <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.goals.title')}</h1>
          <p className="mt-1 text-2xs text-muted-foreground">{t('morpheus.goals.description')}</p>
        </div>
        <Button size="sm" variant="outline" data-testid="goal-create" onClick={startNew} className="gap-2">
          <Plus className="h-3.5 w-3.5" />{t('morpheus.goals.create')}
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[270px_minmax(0,1fr)]">
        <aside data-testid="goals-list" className="min-h-0 overflow-y-auto border-r border-border/60 bg-[hsl(var(--morpheus-surface-2))]/50">
          {goals.length === 0 && selectedId !== 'new' ? <EmptyState message={t('morpheus.goals.empty')} /> : goals.map((goal) => (
            <button
              type="button" key={goal.goalId} data-testid={`goal-list-${goal.goalId}`}
              data-selected={selected?.goalId === goal.goalId}
              onClick={() => choose(goal)}
              className={`w-full border-l-2 px-4 py-3.5 text-left transition-colors ${selected?.goalId === goal.goalId ? 'border-[hsl(var(--morpheus-accent))] bg-[hsl(var(--morpheus-accent))]/[0.055]' : 'border-transparent hover:bg-white/[0.025]'}`}
            >
              <div className="flex items-center gap-2">
                <StatusDot tone={goal.status === 'active' ? 'ok' : goal.status === 'paused' ? 'warn' : 'idle'} />
                <span className="min-w-0 flex-1 truncate text-tiny font-medium">{goal.name}</span>
                <span className="font-mono text-[9px] text-muted-foreground">{morpheusGoalProgress(goal)}%</span>
              </div>
              <p className="mt-2 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">{goal.nextAction || goal.objective}</p>
              <div className="mt-2 h-0.5 overflow-hidden bg-border/50"><div className="h-full bg-[hsl(var(--morpheus-accent))]" style={{ width: `${morpheusGoalProgress(goal)}%` }} /></div>
            </button>
          ))}
        </aside>

        <main className="min-h-0 overflow-y-auto p-5">
          {!selected && selectedId !== 'new' ? <EmptyState message={t('morpheus.goals.select')} /> : (
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground"><Target className="h-3.5 w-3.5" />{selectedId === 'new' ? t('morpheus.goals.newGoal') : t('morpheus.goals.longHorizon')}</p>
                  <h2 className="mt-1 truncate font-serif text-xl font-normal">{visible.name || t('morpheus.goals.untitled')}</h2>
                </div>
                <div className="flex shrink-0 gap-2">
                  {selected ? (
                    <>
                      <Button variant="outline" size="sm" disabled={selected.status !== 'active' || !selected.nextAction} data-testid="goal-continue" onClick={() => void continueGoal(selected.goalId)} className="gap-1.5"><Play className="h-3.5 w-3.5" />{t('morpheus.goals.continue')}</Button>
                      <Button variant="ghost" size="sm" data-testid="goal-remove" onClick={() => setRemoveOpen(true)} className="text-[hsl(var(--morpheus-danger))]"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>
                  ) : null}
                  <Button size="sm" data-testid="goal-save" disabled={saving || !visible.name.trim() || !visible.objective.trim()} onClick={() => void (async () => {
                    setSaving(true);
                    const saved = await saveGoal(visible);
                    if (saved) { setSelectedId(saved.goalId); setDraft(draftFrom(saved)); }
                    setSaving(false);
                  })()} className="gap-1.5"><Save className="h-3.5 w-3.5" />{t('morpheus.common.save')}</Button>
                </div>
              </div>

              {error ? <p data-testid="goals-error" className="rounded border border-[hsl(var(--morpheus-danger))]/30 bg-[hsl(var(--morpheus-danger))]/5 px-3 py-2 text-xs text-[hsl(var(--morpheus-danger))]">{error}</p> : null}

              <section className="grid gap-4 md:grid-cols-2">
                <Field label={t('morpheus.goals.name')}><input data-testid="goal-name" value={visible.name} maxLength={100} onChange={(event) => setDraft({ ...visible, name: event.target.value })} className="morpheus-field" /></Field>
                <Field label={t('morpheus.goals.status')}><select data-testid="goal-status" value={visible.status} onChange={(event) => setDraft({ ...visible, status: event.target.value as MorpheusGoalDraft['status'] })} className="morpheus-field"><option value="active">{t('morpheus.goals.statuses.active')}</option><option value="paused">{t('morpheus.goals.statuses.paused')}</option><option value="completed">{t('morpheus.goals.statuses.completed')}</option><option value="abandoned">{t('morpheus.goals.statuses.abandoned')}</option></select></Field>
                <Field label={t('morpheus.goals.objective')} wide><textarea data-testid="goal-objective" rows={3} value={visible.objective} maxLength={2000} onChange={(event) => setDraft({ ...visible, objective: event.target.value })} className="morpheus-field resize-none py-2" /></Field>
                <Field label={t('morpheus.goals.successCriteria')} wide><textarea data-testid="goal-success" rows={3} value={visible.successCriteria} maxLength={2000} onChange={(event) => setDraft({ ...visible, successCriteria: event.target.value })} className="morpheus-field resize-none py-2" /></Field>
                <Field label={t('morpheus.goals.project')}><select data-testid="goal-project" value={visible.projectId} onChange={(event) => { const project = projects.find((item) => item.projectId === event.target.value); setDraft({ ...visible, projectId: event.target.value, workspaceId: project?.workspaceId ?? visible.workspaceId }); }} className="morpheus-field">{projects.filter((project) => project.enabled).map((project) => <option key={project.projectId} value={project.projectId}>{project.name}</option>)}</select></Field>
                <Field label={t('morpheus.goals.agent')}><select data-testid="goal-agent" value={visible.agentProfileId} onChange={(event) => setDraft({ ...visible, agentProfileId: event.target.value })} className="morpheus-field">{profiles.filter((profile) => profile.enabled).map((profile) => <option key={profile.profileId} value={profile.profileId}>{profile.name}</option>)}</select></Field>
                <Field label={t('morpheus.goals.workspace')}><select data-testid="goal-workspace" value={visible.workspaceId} disabled className="morpheus-field opacity-70">{workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}</select></Field>
                <Field label={t('morpheus.goals.targetDate')}><input type="date" data-testid="goal-target-date" value={visible.targetDate ?? ''} onChange={(event) => setDraft({ ...visible, targetDate: event.target.value || undefined })} className="morpheus-field" /></Field>
                <Field label={t('morpheus.goals.nextAction')} wide><textarea data-testid="goal-next-action" rows={2} value={visible.nextAction} maxLength={2000} onChange={(event) => setDraft({ ...visible, nextAction: event.target.value })} className="morpheus-field resize-none py-2" /></Field>
              </section>

              <section className="border-t border-border/60 pt-4">
                <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground"><Flag className="h-3.5 w-3.5" />{t('morpheus.goals.milestones')}</h3><Button size="sm" variant="ghost" onClick={() => setDraft({ ...visible, milestones: [...visible.milestones, { title: '', status: 'pending' }] })} className="gap-1.5"><Plus className="h-3.5 w-3.5" />{t('morpheus.goals.addMilestone')}</Button></div>
                <div className="mt-3 space-y-2">
                  {visible.milestones.length === 0 ? <EmptyState message={t('morpheus.goals.noMilestones')} /> : visible.milestones.map((milestone, index) => (
                    <div key={milestone.milestoneId ?? `new-${index}`} className="grid grid-cols-[24px_minmax(0,1fr)_150px_120px_32px] items-center gap-2 border-b border-border/40 py-2">
                      {milestone.status === 'completed' ? <Check className="h-3.5 w-3.5 text-[hsl(var(--morpheus-accent))]" /> : milestone.status === 'in-progress' ? <CircleDot className="h-3.5 w-3.5 text-[hsl(var(--morpheus-warning))]" /> : <Pause className="h-3.5 w-3.5 text-muted-foreground" />}
                      <input data-testid={`goal-milestone-title-${index}`} value={milestone.title} maxLength={160} onChange={(event) => patchMilestone(index, { title: event.target.value })} className="morpheus-field h-8" />
                      <select value={milestone.status} onChange={(event) => patchMilestone(index, { status: event.target.value as MorpheusGoalMilestoneDraft['status'] })} className="morpheus-field h-8"><option value="pending">{t('morpheus.goals.milestoneStatuses.pending')}</option><option value="in-progress">{t('morpheus.goals.milestoneStatuses.inProgress')}</option><option value="completed">{t('morpheus.goals.milestoneStatuses.completed')}</option><option value="skipped">{t('morpheus.goals.milestoneStatuses.skipped')}</option></select>
                      <input type="date" value={milestone.targetDate ?? ''} onChange={(event) => patchMilestone(index, { targetDate: event.target.value || undefined })} className="morpheus-field h-8" />
                      <button type="button" aria-label={t('morpheus.goals.removeMilestone')} onClick={() => setDraft({ ...visible, milestones: visible.milestones.filter((_, position) => position !== index) })} className="rounded p-1 text-muted-foreground hover:text-[hsl(var(--morpheus-danger))]"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </section>

              {selected?.history.length ? (
                <section className="border-t border-border/60 pt-4"><h3 className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{t('morpheus.goals.history')}</h3><div className="mt-3 grid gap-2 md:grid-cols-2">{selected.history.slice(-6).reverse().map((entry) => <div key={entry.historyId} className="border-l border-[hsl(var(--morpheus-accent-dim))]/40 pl-3"><p className="text-2xs text-foreground/80">{entry.summary}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{new Date(entry.ts).toLocaleString()}</p></div>)}</div></section>
              ) : null}
            </div>
          )}
        </main>
      </div>

      <ConfirmDialog open={removeOpen} title={t('morpheus.goals.removeTitle')} message={t('morpheus.goals.removeMessage')} confirmLabel={t('morpheus.common.remove')} cancelLabel={t('morpheus.common.cancel')} variant="destructive" onCancel={() => setRemoveOpen(false)} onConfirm={async () => { if (!selected) return; if (await removeGoal(selected.goalId)) { setSelectedId(null); setDraft(emptyDraft()); setRemoveOpen(false); } }} />
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? 'md:col-span-2' : ''}><span className="text-2xs text-muted-foreground">{label}</span>{children}</label>;
}
