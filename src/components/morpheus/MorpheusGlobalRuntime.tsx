/** Keeps Morpheus runtime observation alive on every route, including Chat. */
import { useEffect } from 'react';

import { useMorpheusActionsStore } from '@/stores/morpheus-actions';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';
import { MorpheusCaptureIndicator } from './MorpheusCaptureIndicator';
import { MorpheusPermissionDialog } from './MorpheusPermissionDialog';
import { MorpheusPlanConsentDialog } from './MorpheusPlanConsentDialog';
import { MorpheusVoiceRuntime } from './MorpheusVoiceRuntime';

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

  useEffect(() => {
    const unsubscribe = subscribe();
    const unsubscribeConsent = subscribeConsent();
    const unsubscribeObjectives = subscribeObjectives();
    void Promise.all([
      loadCapabilities(), loadPermissionCenter(), loadFilesRoot(), loadWorkspaces(), loadArtifacts(), loadObjectives(),
    ]);
    return () => {
      unsubscribe();
      unsubscribeConsent();
      unsubscribeObjectives();
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
  ]);

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
    </>
  );
}
