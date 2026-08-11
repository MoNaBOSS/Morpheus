import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Pencil, Play, Plus, Save, Trash2, X } from 'lucide-react';

import { EmptyState, MonoPath, Panel, StatusDot } from '@/components/morpheus/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';
import type {
  MorpheusSchedule,
  MorpheusScheduleDraft,
  MorpheusScheduleTrigger,
} from '@shared/morpheus/schedule-types';

type TriggerKind = MorpheusScheduleTrigger['type'];

const fieldClass = 'mt-1 w-full rounded border border-border bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2 text-tiny text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]';

function localDateTimeValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function scheduleDraft(schedule: MorpheusSchedule): MorpheusScheduleDraft {
  return {
    scheduleId: schedule.scheduleId,
    name: schedule.name,
    workflowId: schedule.workflowId,
    workspaceId: schedule.workspaceId,
    enabled: schedule.enabled,
    trigger: structuredClone(schedule.trigger),
  };
}

export function Schedules() {
  const { t } = useTranslation('dashboard');
  const workflows = useMorpheusFoundationStore((state) => state.workflows);
  const schedules = useMorpheusFoundationStore((state) => state.schedules);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const saveSchedule = useMorpheusFoundationStore((state) => state.saveSchedule);
  const removeSchedule = useMorpheusFoundationStore((state) => state.removeSchedule);
  const runSchedule = useMorpheusFoundationStore((state) => state.runSchedule);
  const workspaceSnapshot = useMorpheusWorkspacesStore((state) => state.snapshot);
  const selectedWorkspaceId = useMorpheusWorkspacesStore((state) => state.selectedWorkspaceId);
  const loadWorkspaces = useMorpheusWorkspacesStore((state) => state.load);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [triggerKind, setTriggerKind] = useState<TriggerKind>('interval');
  const [triggerValue, setTriggerValue] = useState('60');
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => { void Promise.all([loadModels(), loadWorkspaces()]); }, [loadModels, loadWorkspaces]);
  const selectedWorkflowId = workflowId || workflows[0]?.workflowId || '';
  const effectiveWorkspaceId = workspaceId || selectedWorkspaceId;
  const workspaces = workspaceSnapshot?.workspaces.filter((workspace) => workspace.enabled && workspace.available) ?? [];

  const trigger = useMemo<MorpheusScheduleTrigger | null>(() => {
    if (triggerKind === 'interval') {
      const everyMinutes = Number(triggerValue);
      return Number.isInteger(everyMinutes) && everyMinutes >= 1 ? { type: 'interval', everyMinutes } : null;
    }
    if (triggerKind === 'daily') return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(triggerValue) ? { type: 'daily', localTime: triggerValue } : null;
    if (triggerKind === 'once') {
      const stamp = Date.parse(triggerValue);
      return Number.isFinite(stamp) ? { type: 'once', runAt: new Date(stamp).toISOString() } : null;
    }
    return { type: 'app-startup' };
  }, [triggerKind, triggerValue]);

  const canSave = Boolean(name.trim() && selectedWorkflowId && effectiveWorkspaceId && trigger && !saving);
  const resetForm = () => {
    setEditingId(null);
    setName('');
    setWorkflowId('');
    setWorkspaceId('');
    setEnabled(true);
    setTriggerKind('interval');
    setTriggerValue('60');
  };
  const editSchedule = (schedule: MorpheusSchedule) => {
    setEditingId(schedule.scheduleId);
    setName(schedule.name);
    setWorkflowId(schedule.workflowId);
    setWorkspaceId(schedule.workspaceId);
    setEnabled(schedule.enabled);
    setTriggerKind(schedule.trigger.type);
    setTriggerValue(
      schedule.trigger.type === 'interval' ? String(schedule.trigger.everyMinutes)
        : schedule.trigger.type === 'daily' ? schedule.trigger.localTime
          : schedule.trigger.type === 'once' ? localDateTimeValue(schedule.trigger.runAt)
            : '',
    );
  };

  return (
    <main data-morpheus data-testid="schedules-page" className="h-full overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] p-5">
      <header className="mb-4 flex items-end justify-between gap-4 border-b border-border/70 pb-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.foundation.automation')}</p>
          <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.schedules.title')}</h1>
          <p className="mt-1 max-w-2xl text-tiny text-muted-foreground">{t('morpheus.schedules.description')}</p>
        </div>
        <button type="button" onClick={resetForm} className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--morpheus-accent-dim))] px-3 py-2 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10">
          <Plus className="h-3.5 w-3.5" />
          {t('morpheus.schedules.create')}
        </button>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title={t('morpheus.schedules.current')} testId="schedules-list">
          {schedules.length === 0 ? <EmptyState message={t('morpheus.schedules.empty')} /> : (
            <ol className="space-y-2">
              {schedules.map((schedule) => {
                const workspace = workspaceSnapshot?.workspaces.find((candidate) => candidate.workspaceId === schedule.workspaceId);
                const workflow = workflows.find((candidate) => candidate.workflowId === schedule.workflowId);
                return (
                  <li key={schedule.scheduleId} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-border/50 bg-[hsl(var(--morpheus-surface-3))] px-3 py-2.5" data-testid={`schedule-${schedule.scheduleId}`}>
                    <StatusDot tone={schedule.lastStatus === 'running' ? 'running' : schedule.lastStatus === 'failed' || schedule.lastStatus === 'rejected' ? 'error' : schedule.enabled ? 'ok' : 'idle'} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-tiny font-medium">{schedule.name}</p>
                        <span className="font-mono text-[9px] uppercase text-muted-foreground">{schedule.lastStatus}</span>
                      </div>
                      <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                        {workflow?.name ?? schedule.workflowId} · {workspace?.name ?? schedule.workspaceId} · {schedule.trigger.type}
                        {schedule.nextRunAt ? ` · ${new Date(schedule.nextRunAt).toLocaleString()}` : ''}
                      </p>
                      {schedule.lastObjectiveRunId ? (
                        <MonoPath path={schedule.lastObjectiveRunId} className="mt-1 inline-block max-w-full bg-transparent px-0 py-0 text-[9px] text-muted-foreground" testId={`schedule-objective-${schedule.scheduleId}`} />
                      ) : null}
                      {schedule.lastError ? <p className="mt-1 text-2xs text-destructive">{schedule.lastError}</p> : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        data-testid={`schedule-enabled-${schedule.scheduleId}`}
                        checked={schedule.enabled}
                        onCheckedChange={(nextEnabled) => void saveSchedule({ ...scheduleDraft(schedule), enabled: nextEnabled })}
                        aria-label={schedule.enabled ? t('morpheus.common.disable') : t('morpheus.common.enable')}
                      />
                      <button type="button" onClick={() => editSchedule(schedule)} className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--morpheus-accent))]" aria-label={t('morpheus.common.edit')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        data-testid={`schedule-run-${schedule.scheduleId}`}
                        disabled={runningId !== null || !schedule.enabled}
                        onClick={() => {
                          setRunningId(schedule.scheduleId);
                          void runSchedule(schedule.scheduleId).finally(() => setRunningId(null));
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--morpheus-accent))] disabled:opacity-30"
                        aria-label={t('morpheus.schedules.runNow')}
                      ><Play className="h-3.5 w-3.5" /></button>
                      <button
                        type="button"
                        data-testid={`schedule-remove-${schedule.scheduleId}`}
                        onClick={() => setRemovingId(schedule.scheduleId)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-destructive"
                        aria-label={t('morpheus.schedules.remove')}
                      ><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel
          title={editingId ? t('morpheus.schedules.edit') : t('morpheus.schedules.create')}
          description={t('morpheus.schedules.createDescription')}
          testId="schedule-create-panel"
        >
          <form
            className="space-y-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSave || !trigger) return;
              const draft: MorpheusScheduleDraft = {
                ...(editingId ? { scheduleId: editingId } : {}),
                name: name.trim(),
                workflowId: selectedWorkflowId,
                workspaceId: effectiveWorkspaceId,
                enabled,
                trigger,
              };
              setSaving(true);
              void saveSchedule(draft).then(resetForm).finally(() => setSaving(false));
            }}
          >
            <label className="block text-2xs text-muted-foreground">
              {t('morpheus.schedules.name')}
              <input data-testid="schedule-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} className={fieldClass} />
            </label>
            <label className="block text-2xs text-muted-foreground">
              {t('morpheus.schedules.workflow')}
              <select data-testid="schedule-workflow" value={selectedWorkflowId} onChange={(event) => setWorkflowId(event.target.value)} className={fieldClass}>
                {workflows.filter((workflow) => workflow.enabled && workflow.allowedTriggers.includes('schedule')).map((workflow) => <option key={workflow.workflowId} value={workflow.workflowId}>{workflow.name}</option>)}
              </select>
            </label>
            <label className="block text-2xs text-muted-foreground">
              {t('morpheus.schedules.workspace')}
              <select data-testid="schedule-workspace" value={effectiveWorkspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className={fieldClass}>
                {workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name} · {workspace.access}</option>)}
              </select>
            </label>
            <label className="block text-2xs text-muted-foreground">
              {t('morpheus.schedules.trigger')}
              <select
                data-testid="schedule-trigger"
                value={triggerKind}
                onChange={(event) => {
                  const next = event.target.value as TriggerKind;
                  setTriggerKind(next);
                  setTriggerValue(next === 'interval' ? '60' : next === 'daily' ? '09:00' : '');
                }}
                className={fieldClass}
              >
                <option value="interval">{t('morpheus.schedules.interval')}</option>
                <option value="daily">{t('morpheus.schedules.daily')}</option>
                <option value="once">{t('morpheus.schedules.once')}</option>
                <option value="app-startup">{t('morpheus.schedules.startup')}</option>
              </select>
            </label>
            {triggerKind !== 'app-startup' && (
              <input
                data-testid="schedule-trigger-value"
                type={triggerKind === 'interval' ? 'number' : triggerKind === 'daily' ? 'time' : 'datetime-local'}
                min={triggerKind === 'interval' ? 1 : undefined}
                value={triggerValue}
                onChange={(event) => setTriggerValue(event.target.value)}
                className={fieldClass}
              />
            )}
            <label className="flex items-center justify-between rounded-md border border-border/60 bg-[hsl(var(--morpheus-surface-3))] px-3 py-2 text-tiny text-muted-foreground">
              {t('morpheus.common.enabled')}
              <Switch data-testid="schedule-form-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {editingId ? (
                <button type="button" onClick={resetForm} className="flex items-center justify-center gap-1.5 rounded border border-border py-2 text-tiny text-muted-foreground hover:bg-white/5">
                  <X className="h-3.5 w-3.5" />
                  {t('morpheus.common.cancel')}
                </button>
              ) : <span />}
              <button type="submit" data-testid="schedule-save" disabled={!canSave} className="flex items-center justify-center gap-1.5 rounded border border-[hsl(var(--morpheus-accent-dim))] py-2 text-tiny text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10 disabled:opacity-30">
                {saving ? <CalendarClock className="h-3.5 w-3.5 animate-pulse" /> : editingId ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {editingId ? t('morpheus.schedules.update') : t('morpheus.schedules.save')}
              </button>
            </div>
          </form>
        </Panel>
      </div>

      <ConfirmDialog
        open={Boolean(removingId)}
        title={t('morpheus.schedules.removeTitle')}
        message={t('morpheus.schedules.removeDescription')}
        confirmLabel={t('morpheus.common.remove')}
        cancelLabel={t('morpheus.common.cancel')}
        variant="destructive"
        onCancel={() => setRemovingId(null)}
        onConfirm={async () => {
          if (!removingId) return;
          await removeSchedule(removingId);
          setRemovingId(null);
        }}
      />
    </main>
  );
}
