/** Keeps Morpheus runtime observation alive on every route, including Chat. */
import { useEffect } from 'react';

import { useMorpheusActionsStore } from '@/stores/morpheus-actions';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';
import { MorpheusCaptureIndicator } from './MorpheusCaptureIndicator';
import { MorpheusPermissionDialog } from './MorpheusPermissionDialog';
import { MorpheusPlanConsentDialog } from './MorpheusPlanConsentDialog';
import { MorpheusVoiceRuntime } from './MorpheusVoiceRuntime';
import { MorpheusOperatorNavigation } from './operator/MorpheusOperatorNavigation';

export function MorpheusGlobalRuntime() {
  const subscribe = useMorpheusActionsStore((state) => state.subscribe);
  const loadCapabilities = useMorpheusActionsStore((state) => state.loadCapabilities);
  const runOrder = useMorpheusActionsStore((state) => state.runOrder);
  const runsById = useMorpheusActionsStore((state) => state.runsById);
  const subscribeConsent = useMorpheusCommandStore((state) => state.subscribeConsent);
  const subscribeObjectives = useMorpheusCommandStore((state) => state.subscribeObjectives);
  const loadObjectives = useMorpheusCommandStore((state) => state.loadObjectives);
  const loadPermissionCenter = useMorpheusCommandStore((state) => state.loadPermissionCenter);
  const loadFilesRoot = useMorpheusCommandStore((state) => state.loadFilesRoot);
  const loadArtifacts = useMorpheusCommandStore((state) => state.loadArtifacts);
  const captureArtifact = useMorpheusCommandStore((state) => state.captureArtifact);
  const loadWorkspaces = useMorpheusWorkspacesStore((state) => state.load);
  const loadCompanion = useMorpheusCompanionStore((state) => state.loadAll);
  const loadMissions = useMorpheusCompanionStore((state) => state.loadMissions);
  const objectiveUpdatedAt = useMorpheusCommandStore((state) => state.objectiveRun?.updatedAt);
  const subscribeVoicePresence = useMorpheusVoiceStore((state) => state.subscribePresence);
  const loadVoiceStatus = useMorpheusVoiceStore((state) => state.loadStatus);
  const ensureAmbient = useMorpheusVoiceStore((state) => state.ensureAmbient);
  const loadIntelligence = useMorpheusIntelligenceStore((state) => state.load);
  const refreshToday = useMorpheusIntelligenceStore((state) => state.refreshToday);

  useEffect(() => {
    const unsubscribe = subscribe();
    const unsubscribeConsent = subscribeConsent();
    const unsubscribeObjectives = subscribeObjectives();
    const unsubscribeVoice = subscribeVoicePresence();
    void Promise.all([
      loadCapabilities(), loadPermissionCenter(), loadFilesRoot(), loadWorkspaces(), loadArtifacts(), loadObjectives(),
      loadCompanion(), loadIntelligence(), loadVoiceStatus().then(() => ensureAmbient()).catch(() => undefined),
    ]);
    return () => {
      unsubscribe();
      unsubscribeConsent();
      unsubscribeObjectives();
      unsubscribeVoice();
    };
  }, [
    subscribe,
    subscribeConsent,
    subscribeObjectives,
    loadCapabilities,
    loadPermissionCenter,
    loadFilesRoot,
    loadWorkspaces,
    loadArtifacts,
    loadObjectives,
    loadCompanion,
    subscribeVoicePresence,
    loadVoiceStatus,
    ensureAmbient,
    loadIntelligence,
  ]);

  useEffect(() => {
    if (objectiveUpdatedAt) void Promise.all([loadMissions(), refreshToday()]);
  }, [loadMissions, refreshToday, objectiveUpdatedAt]);

  useEffect(() => {
    const latestId = runOrder[runOrder.length - 1];
    const latest = latestId ? runsById[latestId] : undefined;
    if (!latest) return;
    captureArtifact(latest);
    if (latest.phase === 'succeeded' || latest.phase === 'denied') void loadPermissionCenter();
  }, [runOrder, runsById, captureArtifact, loadPermissionCenter]);

  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-10 z-[100000] -translate-x-1/2">
        <MorpheusCaptureIndicator />
      </div>
      <MorpheusPlanConsentDialog />
      <MorpheusPermissionDialog />
      <MorpheusVoiceRuntime />
      <MorpheusOperatorNavigation />
    </>
  );
}
