import { Loader2, Mic, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import {
  useMorpheusVoiceStore,
  type MorpheusVoiceSource,
} from '@/stores/morpheus-voice';

export function MorpheusVoiceButton({
  source,
  className,
  disabled = false,
}: {
  source: MorpheusVoiceSource;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation('dashboard');
  const phase = useMorpheusVoiceStore((state) => state.phase);
  const startListening = useMorpheusVoiceStore((state) => state.startListening);
  const stopListening = useMorpheusVoiceStore((state) => state.stopListening);
  const listening = phase === 'listening';
  const processing = phase === 'requesting' || phase === 'transcribing';

  return (
    <button
      type="button"
      data-testid={`morpheus-voice-button-${source}`}
      aria-label={listening ? t('morpheus.voice.stop') : t('morpheus.voice.start')}
      aria-pressed={listening}
      disabled={processing || disabled}
      onClick={() => {
        if (listening) stopListening();
        else void startListening(source);
      }}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border transition-colors',
        listening
          ? 'border-[hsl(var(--morpheus-danger))]/60 bg-[hsl(var(--morpheus-danger))]/10 text-[hsl(var(--morpheus-danger))]'
          : 'border-border text-muted-foreground hover:border-[hsl(var(--morpheus-accent-dim))] hover:text-[hsl(var(--morpheus-accent))]',
        'disabled:cursor-wait disabled:opacity-60',
        className,
      )}
    >
      {processing ? (
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
      ) : listening ? (
        <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
      ) : (
        <Mic className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
