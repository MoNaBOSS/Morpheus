import { useEffect } from 'react';
import { BellRing, Clock3, Radar } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusDot } from '@/components/morpheus/ui';
import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';
import type { MorpheusAttentionSource } from '@shared/morpheus/proactive-types';

const CATEGORIES: readonly MorpheusAttentionSource[] = [
  'mission', 'goal', 'schedule', 'routine', 'reminder',
];

export function MorpheusProactiveSettings() {
  const { t } = useTranslation('dashboard');
  const snapshot = useMorpheusIntelligenceStore((state) => state.proactive);
  const error = useMorpheusIntelligenceStore((state) => state.error);
  const load = useMorpheusIntelligenceStore((state) => state.load);
  const update = useMorpheusIntelligenceStore((state) => state.updateProactiveSettings);
  const settings = snapshot.settings;

  useEffect(() => {
    if (snapshot.generatedAt === new Date(0).toISOString()) void load();
  }, [load, snapshot.generatedAt]);

  return (
    <section
      data-testid="morpheus-proactive-settings"
      className="rounded-xl border border-border/60 bg-[hsl(var(--morpheus-surface-2))]/80 p-4"
    >
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-border/70 bg-[hsl(var(--morpheus-surface-3))] p-2 text-[hsl(var(--morpheus-accent))]">
          <Radar className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{t('morpheus.proactive.settings.title')}</p>
            <StatusDot tone={settings.enabled ? 'ok' : 'idle'} />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t('morpheus.proactive.settings.description')}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <SettingToggle
          label={t('morpheus.proactive.settings.enabled')}
          description={t('morpheus.proactive.settings.enabledDescription')}
          checked={settings.enabled}
          testId="morpheus-proactive-enabled"
          onChange={(enabled) => void update({ enabled })}
        />
        <div className="rounded-lg border border-[hsl(var(--morpheus-accent-dim))]/30 bg-[hsl(var(--morpheus-accent))]/[0.035] p-3.5">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />
            <div className="min-w-0 flex-1">
              <SettingToggle
                label={t('morpheus.proactive.settings.notifications')}
                description={t('morpheus.proactive.settings.notificationsDescription')}
                checked={settings.notificationsEnabled}
                testId="morpheus-proactive-notifications"
                onChange={(notificationsEnabled) => void update({ notificationsEnabled })}
              />
              <p className="mt-3 rounded border border-border/50 bg-black/10 px-2.5 py-2 text-2xs leading-relaxed text-muted-foreground">
                {t('morpheus.proactive.settings.factualDisclosure')}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/50 bg-black/[0.04] p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t('morpheus.proactive.settings.quietHours')}</p>
            <Switch
              className="ml-auto"
              checked={settings.quietHoursEnabled}
              onCheckedChange={(quietHoursEnabled) => void update({ quietHoursEnabled })}
              data-testid="morpheus-proactive-quiet-hours"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TimeField
              id="morpheus-proactive-quiet-start"
              label={t('morpheus.proactive.settings.quietStart')}
              value={settings.quietHoursStart}
              disabled={!settings.quietHoursEnabled}
              onChange={(quietHoursStart) => void update({ quietHoursStart })}
            />
            <TimeField
              id="morpheus-proactive-quiet-end"
              label={t('morpheus.proactive.settings.quietEnd')}
              value={settings.quietHoursEnd}
              disabled={!settings.quietHoursEnabled}
              onChange={(quietHoursEnd) => void update({ quietHoursEnd })}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground/85">{t('morpheus.proactive.settings.sources')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((source) => (
              <label key={source} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/45 px-3 py-2 text-xs text-foreground/85 hover:bg-white/[0.025]">
                <Switch
                  checked={settings.categories[source]}
                  onCheckedChange={(enabled) => void update({ categories: { [source]: enabled } })}
                  data-testid={`morpheus-proactive-source-${source}`}
                />
                {t(`morpheus.today.sources.${source}`)}
              </label>
            ))}
          </div>
        </div>
        {error ? <p className="text-xs text-[hsl(var(--morpheus-danger))]">{error}</p> : null}
      </div>
    </section>
  );
}

function SettingToggle({
  label, description, checked, testId, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  testId: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

function TimeField({
  id, label, value, disabled, onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-2xs text-muted-foreground">{label}</Label>
      <input
        id={id}
        data-testid={id}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="morpheus-field h-9 font-mono text-xs disabled:opacity-45"
      />
    </div>
  );
}
