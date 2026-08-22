import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import {
  MORPHEUS_INTERACTION_MODES,
  type MorpheusInteractionMode,
} from '@shared/morpheus/operator-types';

type MorpheusInteractionModeControlProps = {
  value: MorpheusInteractionMode;
  onChange: (value: MorpheusInteractionMode) => void;
  className?: string;
  showDescription?: boolean;
};

export function MorpheusInteractionModeControl({
  value,
  onChange,
  className,
  showDescription = false,
}: MorpheusInteractionModeControlProps) {
  const { t } = useTranslation('dashboard');

  return (
    <div
      className={cn('grid grid-cols-3 border border-white/[0.09] bg-black/15', className)}
      role="radiogroup"
      aria-label={t('morpheus.operator.modeLabel')}
      data-testid="morpheus-interaction-mode"
    >
      {MORPHEUS_INTERACTION_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          data-testid={`morpheus-mode-${mode}`}
          data-selected={value === mode}
          onClick={() => onChange(mode)}
          className="relative min-w-0 border-r border-white/[0.08] px-4 py-3 text-left transition-colors last:border-r-0 hover:bg-white/[0.025] data-[selected=true]:bg-[hsl(var(--morpheus-accent)/0.08)]"
        >
          <span className={cn(
            'block text-[11px] uppercase tracking-[0.18em]',
            value === mode ? 'text-[hsl(var(--morpheus-accent))]' : 'text-foreground/65',
          )}>
            {t(`morpheus.operator.modes.${mode}.name`)}
          </span>
          {showDescription ? (
            <span className="mt-1.5 block text-[9px] leading-relaxed text-muted-foreground">
              {t(`morpheus.operator.modes.${mode}.description`)}
            </span>
          ) : null}
          {value === mode ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-[hsl(var(--morpheus-accent))]" /> : null}
        </button>
      ))}
    </div>
  );
}
