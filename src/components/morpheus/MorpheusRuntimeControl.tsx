import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusDot } from '@/components/morpheus/ui';
import { useMorpheusRuntimeStore } from '@/stores/morpheus-runtime';
import { cn } from '@/lib/utils';

export function MorpheusRuntimeControl({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('dashboard');
  const control = useMorpheusRuntimeStore((state) => state.control);
  const loading = useMorpheusRuntimeStore((state) => state.loading);
  const updating = useMorpheusRuntimeStore((state) => state.updating);
  const error = useMorpheusRuntimeStore((state) => state.error);
  const load = useMorpheusRuntimeStore((state) => state.load);
  const setPaused = useMorpheusRuntimeStore((state) => state.setPaused);

  useEffect(() => {
    if (!control && !loading) void load();
  }, [control, load, loading]);

  const paused = control?.paused ?? false;
  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="morpheus-runtime-pause-compact"
        data-paused={String(paused)}
        disabled={loading || updating}
        onClick={() => void setPaused(!paused)}
        className={cn(
          'h-8 shrink-0 gap-1.5 rounded-md px-2 text-2xs',
          paused
            ? 'text-[hsl(var(--morpheus-warn))] hover:bg-[hsl(var(--morpheus-warn))]/10'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        )}
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {paused ? t('morpheus.runtimeControl.resume') : t('morpheus.runtimeControl.pause')}
      </Button>
    );
  }

  return (
    <section
      data-testid="morpheus-runtime-control"
      data-paused={String(paused)}
      className="rounded-xl border border-border/60 bg-[hsl(var(--morpheus-surface-2))]/80 p-4"
    >
      <div className="flex items-center justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot tone={paused ? 'warn' : 'ok'} />
            <p className="text-sm font-medium text-foreground">
              {paused ? t('morpheus.runtimeControl.paused') : t('morpheus.runtimeControl.active')}
            </p>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {t('morpheus.runtimeControl.description')}
          </p>
          {error ? <p className="mt-2 text-xs text-[hsl(var(--morpheus-danger))]">{error}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {paused ? t('morpheus.runtimeControl.resume') : t('morpheus.runtimeControl.pause')}
          </span>
          <Switch
            checked={!paused}
            disabled={loading || updating}
            onCheckedChange={(active) => void setPaused(!active)}
            aria-label={paused ? t('morpheus.runtimeControl.resume') : t('morpheus.runtimeControl.pause')}
            data-testid="morpheus-runtime-pause-switch"
          />
        </div>
      </div>
    </section>
  );
}
