/**
 * Morpheus Command Center — the product home at `/`.
 *
 * Layout priority is deliberate and must survive 1280x800 without scrolling:
 *
 *   Primary   identity · command input · runtime readiness · active execution
 *   Secondary recent executions · artifacts · capabilities · permission summary
 *   Tertiary  full audit history (Settings) · diagnostics
 *
 * Chat lives at `/chat`. It remains fully functional and is a first-class
 * navigation destination, but it is one interface into Morpheus, not the
 * product itself.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import morpheusLogo from '@/assets/morpheus-logo.svg';
import { MorpheusActionTimeline } from '@/components/morpheus/MorpheusActionTimeline';
import { MorpheusPermissionDialog } from '@/components/morpheus/MorpheusPermissionDialog';
import { MorpheusPlanConsentDialog } from '@/components/morpheus/MorpheusPlanConsentDialog';
import { MorpheusCaptureIndicator } from '@/components/morpheus/MorpheusCaptureIndicator';
import { PermissionCenter } from '@/components/morpheus/PermissionCenter';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';

import { ArtifactsPanel } from './ArtifactsPanel';
import { CommandBar } from './CommandBar';
import { PlanPanel } from './PlanPanel';
import { RuntimeStatusBar } from './RuntimeStatusBar';
import { SupportedActions } from './SupportedActions';

export function CommandCenter() {
  const { t } = useTranslation('dashboard');

  const subscribe = useMorpheusActionsStore((state) => state.subscribe);
  const loadCapabilities = useMorpheusActionsStore((state) => state.loadCapabilities);
  const runOrder = useMorpheusActionsStore((state) => state.runOrder);
  const runsById = useMorpheusActionsStore((state) => state.runsById);

  const loadPermissionCenter = useMorpheusCommandStore((state) => state.loadPermissionCenter);
  const subscribeConsent = useMorpheusCommandStore((state) => state.subscribeConsent);
  const loadFilesRoot = useMorpheusCommandStore((state) => state.loadFilesRoot);
  const captureArtifact = useMorpheusCommandStore((state) => state.captureArtifact);

  useEffect(() => {
    const unsubscribe = subscribe();
    const unsubscribeConsent = subscribeConsent();
    void loadCapabilities();
    void loadPermissionCenter();
    void loadFilesRoot();
    return () => {
      unsubscribe();
      unsubscribeConsent();
    };
  }, [subscribe, subscribeConsent, loadCapabilities, loadPermissionCenter, loadFilesRoot]);

  // Artifacts and grant state are derived from real terminal runs. Refreshing
  // the permission summary here is what makes a newly created grant visible
  // without a manual reload.
  useEffect(() => {
    const latest = runOrder.length ? runsById[runOrder[runOrder.length - 1]] : undefined;
    if (!latest) return;
    captureArtifact(latest);
    if (latest.phase === 'succeeded' || latest.phase === 'denied') {
      void loadPermissionCenter();
    }
  }, [runOrder, runsById, captureArtifact, loadPermissionCenter]);

  return (
    <div
      data-morpheus
      data-testid="command-center-page"
      className="flex h-full flex-col overflow-y-auto"
    >
      {/* Identity and the command bar are the two things that must always be
          visible at 1280x800 without scrolling. */}
      <header className="shrink-0 border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={morpheusLogo} alt="" aria-hidden className="h-7 w-7" />
            <div>
              <h1
                data-testid="command-center-title"
                className="font-serif text-xl font-normal tracking-tight"
              >
                {t('morpheus.title')}
              </h1>
              <p className="text-2xs text-muted-foreground">{t('morpheus.subtitle')}</p>
            </div>
          </div>
          <RuntimeStatusBar />
        </div>

        <div className="mt-3">
          <CommandBar />
        </div>

        {/* Sits in the header, above the fold: a capture must announce itself
            where the user is already looking, not in a panel they may have
            scrolled past. Renders nothing when no capture is happening. */}
        <div className="mt-2 empty:mt-0">
          <MorpheusCaptureIndicator />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-3">
        {/* Plan above timeline: the plan is what Morpheus intends, the timeline
            is the raw event record. Intent first, evidence under it. */}
        <div className="flex flex-col gap-4 xl:col-span-2">
          <PlanPanel />

          <Card data-testid="command-center-execution" className="flex flex-col gap-2 p-3">
            <h2 className="font-serif text-sm font-normal tracking-tight">
              {t('morpheus.timeline.title')}
            </h2>
            <p className="text-2xs text-muted-foreground">{t('morpheus.timeline.description')}</p>
            <MorpheusActionTimeline />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card data-testid="command-center-permission" className="flex flex-col gap-2 p-3">
            <h2 className="font-serif text-sm font-normal tracking-tight">
              {t('morpheus.permission.centerTitle')}
            </h2>
            <PermissionCenter compact />
          </Card>

          <Card data-testid="command-center-actions" className="flex flex-col gap-2 p-3">
            <h2 className="font-serif text-sm font-normal tracking-tight">
              {t('morpheus.launcher.title')}
            </h2>
            <SupportedActions />
          </Card>

          <Card data-testid="command-center-artifacts" className="flex flex-col gap-2 p-3">
            <h2 className="font-serif text-sm font-normal tracking-tight">
              {t('morpheus.artifacts.title')}
            </h2>
            <ArtifactsPanel />
          </Card>
        </div>
      </div>

      {/* Two dialogs, one at a time: the plan-level batch for command-bar work,
          the per-run dialog for a single action launched directly. */}
      <MorpheusPlanConsentDialog />
      <MorpheusPermissionDialog />
    </div>
  );
}
