import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Play, Plus, Trash2 } from 'lucide-react';

import { EmptyState, Panel, StatusDot } from '@/components/morpheus/ui';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import type { MorpheusScheduleDraft, MorpheusScheduleTrigger } from '@shared/morpheus/schedule-types';

type TriggerKind = MorpheusScheduleTrigger['type'];

export function Schedules() {
  const { t } = useTranslation('dashboard');
  const workflows = useMorpheusFoundationStore((state) => state.workflows);
  const schedules = useMorpheusFoundationStore((state) => state.schedules);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const saveSchedule = useMorpheusFoundationStore((state) => state.saveSchedule);
  const removeSchedule = useMorpheusFoundationStore((state) => state.removeSchedule);
  const runSchedule = useMorpheusFoundationStore((state) => state.runSchedule);
  const [name, setName] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [triggerKind, setTriggerKind] = useState<TriggerKind>('interval');
  const [triggerValue, setTriggerValue] = useState('60');
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => { void loadModels(); }, [loadModels]);
  const selectedWorkflowId = workflowId || workflows[0]?.workflowId || '';

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

  const canSave = Boolean(name.trim() && selectedWorkflowId && trigger && !saving);

  return (
    <main data-morpheus data-testid="schedules-page" className="h-full overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] p-5">
      <header className="mb-4 border-b border-border/70 pb-3">
        <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.foundation.automation')}</p>
        <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.schedules.title')}</h1>
        <p className="mt-1 max-w-2xl text-tiny text-muted-foreground">{t('morpheus.schedules.description')}</p>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title={t('morpheus.schedules.current')} testId="schedules-list">
          {schedules.length === 0 ? <EmptyState message={t('morpheus.schedules.empty')} /> : (
            <ol className="space-y-1">
              {schedules.map((schedule) => (
                <li key={schedule.scheduleId} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2" data-testid={`schedule-${schedule.scheduleId}`}>
                  <StatusDot tone={schedule.lastStatus === 'running' ? 'running' : schedule.lastStatus === 'failed' ? 'error' : schedule.enabled ? 'ok' : 'idle'} />
                  <div className="min-w-0">
                    <p className="truncate text-tiny font-medium">{schedule.name}</p>
                    <p className="truncate font-mono text-2xs text-muted-foreground">
                      {schedule.workflowId} · {schedule.trigger.type}
                      {schedule.nextRunAt ? ` · ${new Date(schedule.nextRunAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
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
                      onClick={() => void removeSchedule(schedule.scheduleId)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-destructive"
                      aria-label={t('morpheus.schedules.remove')}
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={t('morpheus.schedules.create')} description={t('morpheus.schedules.createDescription')} testId="schedule-create-panel">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSave || !trigger) return;
              const draft: MorpheusScheduleDraft = { name: name.trim(), workflowId: selectedWorkflowId, enabled: true, trigger };
              setSaving(true);
              void saveSchedule(draft).then(() => setName('')).finally(() => setSaving(false));
            }}
          >
            <label className="block text-2xs text-muted-foreground">
              {t('morpheus.schedules.name')}
              <input data-testid="schedule-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border border-border bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2 text-tiny text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]" />
            </label>
            <label className="block text-2xs text-muted-foreground">
              {t('morpheus.schedules.workflow')}
              <select data-testid="schedule-workflow" value={selectedWorkflowId} onChange={(event) => setWorkflowId(event.target.value)} className="mt-1 w-full rounded border border-border bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2 text-tiny text-foreground">
                {workflows.map((workflow) => <option key={workflow.workflowId} value={workflow.workflowId}>{workflow.name}</option>)}
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
                  setTriggerValue(next === 'interval' ? '60' : next === 'daily' ? '09:00' : next === 'once' ? '' : '');
                }}
                className="mt-1 w-full rounded border border-border bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2 text-tiny text-foreground"
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
                className="w-full rounded border border-border bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2 text-tiny text-foreground"
              />
            )}
            <button type="submit" data-testid="schedule-save" disabled={!canSave} className="flex w-full items-center justify-center gap-1.5 rounded border border-[hsl(var(--morpheus-accent-dim))] py-2 text-tiny text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10 disabled:opacity-30">
              {saving ? <CalendarClock className="h-3.5 w-3.5 animate-pulse" /> : <Plus className="h-3.5 w-3.5" />}
              {t('morpheus.schedules.save')}
            </button>
          </form>
        </Panel>
      </div>
    </main>
  );
}
