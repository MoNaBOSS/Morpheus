import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';

type PresenceTone = 'idle' | 'active' | 'complete' | 'warn' | 'error';

export function ObjectiveCorePresence() {
  const { t } = useTranslation('dashboard');
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const presence = useMorpheusVoiceStore((state) => state.presence);
  const voiceStatus = useMorpheusVoiceStore((state) => state.status);

  const voiceEngaged = Boolean(presence && !['asleep', 'armed'].includes(presence.state));
  const objectiveActive = Boolean(objectiveRun && !isObjectiveTerminalState(objectiveRun.state));

  let state = 'ready';
  let label = t('morpheus.objective.states.ready');
  let detail = t('morpheus.command.promise');
  let tone: PresenceTone = 'idle';

  if (voiceEngaged && presence) {
    state = presence.state;
    label = t(`morpheus.voice.presence.${presence.state}`);
    detail = presence.reason ?? presence.providerLabel ?? t('morpheus.command.promise');
    tone = presence.state === 'error'
      ? 'error'
      : presence.state === 'waiting-for-approval'
        ? 'warn'
        : 'active';
  } else if (objectiveRun) {
    state = objectiveRun.state;
    label = t(`morpheus.objective.states.${objectiveRun.state}`);
    detail = objectiveRun.clarification
      ?? objectiveRun.error?.message
      ?? objectiveRun.summary
      ?? objectiveRun.objective;
    tone = objectiveActive
      ? objectiveRun.state === 'waiting-for-approval' ? 'warn' : 'active'
      : objectiveRun.state === 'complete'
        ? 'complete'
        : objectiveRun.state === 'error' || objectiveRun.state === 'degraded'
          ? 'error'
          : objectiveRun.state === 'needs-clarification'
            ? 'warn'
            : 'idle';
  } else if (presence?.state === 'armed') {
    state = 'armed';
    label = t('morpheus.voice.presence.armed');
    detail = t('morpheus.voice.wakeHint', {
      phrase: voiceStatus?.settings.wakePhrase ?? 'Morpheus',
    });
    tone = 'complete';
  } else if (presence?.reason) {
    detail = presence.reason;
  }

  return (
    <div
      data-testid="morpheus-core-presence"
      data-state={state}
      data-tone={tone}
      className="flex min-w-0 items-center justify-end gap-3"
    >
      <div
        aria-hidden
        className={cn(
          'morpheus-core-orb relative h-12 w-12 shrink-0 rounded-full',
          (tone === 'active' || tone === 'complete') && 'morpheus-core-orb-live',
          tone === 'warn' && 'morpheus-core-orb-warn',
          tone === 'error' && 'morpheus-core-orb-error',
        )}
      >
        <span className="absolute inset-[34%] rounded-full bg-current" />
      </div>
      <div className="min-w-0 max-w-[230px] text-right">
        <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {t('morpheus.plan.objectiveCore')}
        </p>
        <p className="mt-0.5 truncate text-2xs font-medium text-foreground/90">{label}</p>
        <p className="mt-0.5 truncate text-[9px] text-muted-foreground" title={detail}>{detail}</p>
      </div>
    </div>
  );
}
