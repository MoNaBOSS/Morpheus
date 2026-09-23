import { useTranslation } from 'react-i18next';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';

export function MorpheusTaskSwitcher() {
  const { t } = useTranslation('dashboard');
  const history = useMorpheusCommandStore((state) => state.objectiveHistory);
  const selectedId = useMorpheusCommandStore((state) => state.selectedObjectiveRunId);
  const select = useMorpheusCommandStore((state) => state.selectObjective);
  const active = history?.runOrder.filter((id) => !isObjectiveTerminalState(history.runsById[id].state)) ?? [];
  if (!history || active.length === 0) return null;
  const ids = [...new Set([...(selectedId && history.runsById[selectedId] ? [selectedId] : []), ...active])];
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">{t('morpheus.tasks.active', { count: active.length })}</span>
      <select data-testid="morpheus-task-switcher" aria-label={t('morpheus.tasks.select')}
        value={selectedId ?? active[0]} onChange={(event) => select(event.target.value)}
        className="min-w-0 max-w-72 rounded border border-border bg-surface-input px-2 py-1 text-foreground">
        {ids.map((id) => <option key={id} value={id}>{history.runsById[id].objective.slice(0, 70)}</option>)}
      </select>
    </label>
  );
}
