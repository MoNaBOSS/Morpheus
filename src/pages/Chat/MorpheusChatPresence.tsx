import { Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MorpheusFluidOrb } from '@/components/morpheus/MorpheusFluidOrb';
import type { AcpTimelineSnapshot } from '@/lib/acp/timeline-types';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { isObjectiveTerminalState } from '@shared/morpheus/core/objective-types';
import { resolveMorpheusChatPresence } from './morpheus-chat-presence';

type MorpheusChatPresenceProps = {
  sessionTitle: string;
  timeline: AcpTimelineSnapshot;
  acpLoading: boolean;
  acpSending: boolean;
  acpCancelling: boolean;
  acpError: string | null;
  imageGenerationPending: boolean;
};

export function MorpheusChatPresence({
  sessionTitle,
  timeline,
  acpLoading,
  acpSending,
  acpCancelling,
  acpError,
  imageGenerationPending,
}: MorpheusChatPresenceProps) {
  const { t } = useTranslation(['chat', 'dashboard']);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const voicePresence = useMorpheusVoiceStore((state) => state.presence);
  const objectiveRun = useMorpheusCommandStore((state) => state.objectiveRun);
  const cancelObjective = useMorpheusCommandStore((state) => state.cancelObjective);
  const snapshot = resolveMorpheusChatPresence({
    timeline,
    acpLoading,
    acpSending,
    acpCancelling,
    acpError,
    imageGenerationPending,
    voicePhase,
    voicePresence: voicePresence?.state,
    objectiveRun,
  });
  const objectiveActive = Boolean(objectiveRun && !isObjectiveTerminalState(objectiveRun.state));

  let label = t('chat:presence.ready');
  let detail = t('chat:presence.readyDetail');

  if (snapshot.source === 'voice') {
    label = voicePresence && !['asleep', 'armed'].includes(voicePresence.state)
      ? t(`dashboard:morpheus.voice.presence.${voicePresence.state}`)
      : t(`dashboard:morpheus.voice.states.${voicePhase}`);
    detail = voicePresence?.reason
      ?? voicePresence?.providerLabel
      ?? t('chat:presence.voiceDetail');
  } else if (snapshot.source === 'objective' && objectiveRun) {
    label = t(`dashboard:morpheus.objective.states.${objectiveRun.state}`);
    const outcome = objectiveRun.clarification
      ?? objectiveRun.error?.message
      ?? objectiveRun.summary
      ?? objectiveRun.plannerNotice;
    detail = outcome && isObjectiveTerminalState(objectiveRun.state)
      ? `${objectiveRun.objective} · ${outcome}`
      : outcome ?? objectiveRun.objective;
  } else if (snapshot.activity === 'permission') {
    label = t('chat:presence.permission');
    detail = t('chat:presence.permissionDetail');
  } else if (snapshot.activity === 'tool') {
    label = t('chat:presence.executing');
    detail = snapshot.activeToolTitle ?? t('chat:presence.executingDetail');
  } else if (snapshot.activity === 'thinking') {
    label = t('dashboard:morpheus.title');
    detail = t('dashboard:morpheus.workspace.subtitle');
  } else if (snapshot.activity === 'stopping') {
    label = t('chat:presence.stopping');
    detail = t('chat:presence.stoppingDetail');
  } else if (snapshot.activity === 'connecting') {
    label = t('chat:presence.connecting');
    detail = t('chat:presence.connectingDetail');
  } else if (snapshot.activity === 'error') {
    label = t('chat:presence.error');
    detail = acpError ?? t('chat:presence.errorDetail');
  }

  return (
    <section
      data-morpheus
      data-testid="morpheus-chat-presence"
      data-signal-state={snapshot.signalState}
      data-source={snapshot.source}
      className="relative flex min-w-0 flex-1 items-center gap-3 overflow-hidden py-1 sm:gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center">
        <MorpheusFluidOrb
          state={snapshot.signalState}
          className="h-14 w-14"
          label={t(`dashboard:morpheus.signalOs.signal.${snapshot.signalState}`)}
        />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="mt-1 flex min-w-0 items-baseline gap-2">
          <h1
            data-testid="chat-session-title"
            title={sessionTitle}
            className="max-w-[45%] truncate font-serif text-sm text-foreground/75"
          >
            {sessionTitle}
          </h1>
          <span className="text-muted-foreground/40">/</span>
          <p data-testid="morpheus-chat-presence-label" className="truncate text-sm font-medium text-foreground">
            {label}
          </p>
        </div>
        <p
          data-testid="morpheus-chat-presence-detail"
          className="mt-1 line-clamp-2 max-w-3xl text-[11px] leading-relaxed text-muted-foreground"
          title={detail}
        >
          {detail}
        </p>
      </div>

      {objectiveActive ? (
        <button
          type="button"
          data-testid="morpheus-chat-cancel-objective"
          aria-label={t('chat:presence.stop')}
          onClick={() => void cancelObjective()}
          className="relative z-10 mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--morpheus-danger))]/35 text-[hsl(var(--morpheus-danger))] transition-colors hover:bg-[hsl(var(--morpheus-danger))]/10"
        >
          <Square className="h-3 w-3 fill-current" aria-hidden />
        </button>
      ) : null}
    </section>
  );
}
