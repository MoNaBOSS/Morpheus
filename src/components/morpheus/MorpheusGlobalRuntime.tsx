/** Keeps Morpheus runtime observation alive on every route, including Chat. */
import { useEffect } from 'react';

import { useMorpheusActionsStore } from '@/stores/morpheus-actions';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { MorpheusCaptureIndicator } from './MorpheusCaptureIndicator';
import { MorpheusPermissionDialog } from './MorpheusPermissionDialog';
import { MorpheusPlanConsentDialog } from './MorpheusPlanConsentDialog';

export function MorpheusGlobalRuntime() {
  const subscribe = useMorpheusActionsStore((state) => state.subscribe);
  const loadCapabilities = useMorpheusActionsStore((state) => state.loadCapabilities);
  const runOrder = useMorpheusActionsStore((state) => state.runOrder);
  const runsById = useMorpheusActionsStore((state) => state.runsById);
  const subscribeConsent = useMorpheusCommandStore((state) => state.subscribeConsent);
  const loadPermissionCenter = useMorpheusCommandStore((state) => state.loadPermissionCenter);
  const loadFilesRoot = useMorpheusCommandStore((state) => state.loadFilesRoot);
  const captureArtifact = useMorpheusCommandStore((state) => state.captureArtifact);

  useEffect(() => {
    const unsubscribe = subscribe();
    const unsubscribeConsent = subscribeConsent();
    void Promise.all([loadCapabilities(), loadPermissionCenter(), loadFilesRoot()]);
    return () => {
      unsubscribe();
      unsubscribeConsent();
    };
  }, [subscribe, subscribeConsent, loadCapabilities, loadPermissionCenter, loadFilesRoot]);

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
    </>
  );
}

