import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';

export function MorpheusOnboardingSettings() {
  const { t } = useTranslation('dashboard');
  const reset = useMorpheusCompanionStore((state) => state.resetOnboarding);

  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-modal p-4" data-testid="settings-morpheus-activation">
      <div className="pr-5"><p className="text-sm font-medium">{t('morpheus.activation.replay')}</p><p className="mt-1 text-meta text-muted-foreground">{t('morpheus.activation.replayDescription')}</p></div>
      <Button variant="outline" size="sm" data-testid="settings-replay-activation" onClick={() => void (async () => { await reset(); window.location.reload(); })()} className="shrink-0 gap-2"><RotateCcw className="h-3.5 w-3.5" />{t('morpheus.activation.replayAction')}</Button>
    </div>
  );
}
