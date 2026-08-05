/**
 * Morpheus command center.
 *
 * The first Morpheus-identity surface in the product. It composes the native
 * action framework: capability launcher, live execution timeline driven by real
 * Main-process events, permission confirmation, and the audit projection.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import { MorpheusActionTimeline } from '@/components/morpheus/MorpheusActionTimeline';
import { MorpheusAuditPanel } from '@/components/morpheus/MorpheusAuditPanel';
import { MorpheusPermissionDialog } from '@/components/morpheus/MorpheusPermissionDialog';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';

import { ActionLauncherPanel } from './ActionLauncherPanel';
import { SystemInfoPanel } from './SystemInfoPanel';

type SectionProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  testId?: string;
};

function Section({ title, description, children, testId }: SectionProps) {
  return (
    <Card data-testid={testId} className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="font-serif text-base font-normal tracking-tight">{title}</h2>
        <p className="mt-0.5 text-tiny text-muted-foreground">{description}</p>
      </div>
      {children}
    </Card>
  );
}

export function Dashboard() {
  const { t } = useTranslation('dashboard');
  const subscribe = useMorpheusActionsStore((state) => state.subscribe);
  const loadSystemInfo = useMorpheusActionsStore((state) => state.loadSystemInfo);
  const loadCapabilities = useMorpheusActionsStore((state) => state.loadCapabilities);
  const loadAudit = useMorpheusActionsStore((state) => state.loadAudit);

  useEffect(() => {
    const unsubscribe = subscribe();
    void loadSystemInfo();
    void loadCapabilities();
    void loadAudit();
    return unsubscribe;
  }, [subscribe, loadSystemInfo, loadCapabilities, loadAudit]);

  return (
    <div data-morpheus data-testid="dashboard-page" className="flex h-full flex-col overflow-y-auto">
      <header className="border-b px-6 py-5">
        <h1 data-testid="dashboard-page-title" className="font-serif text-2xl font-normal tracking-tight">
          {t('morpheus.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('morpheus.subtitle')}</p>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <Section
          testId="morpheus-system-section"
          title={t('morpheus.systemPanel.title')}
          description={t('morpheus.systemPanel.description')}
        >
          <SystemInfoPanel />
        </Section>

        <Section
          testId="morpheus-launcher-section"
          title={t('morpheus.launcher.title')}
          description={t('morpheus.launcher.description')}
        >
          <ActionLauncherPanel />
        </Section>

        <Section
          testId="morpheus-timeline-section"
          title={t('morpheus.timeline.title')}
          description={t('morpheus.timeline.description')}
        >
          <MorpheusActionTimeline />
        </Section>

        <Section
          testId="morpheus-audit-section"
          title={t('morpheus.audit.title')}
          description={t('morpheus.audit.description')}
        >
          <MorpheusAuditPanel />
        </Section>
      </div>

      <MorpheusPermissionDialog />
    </div>
  );
}
