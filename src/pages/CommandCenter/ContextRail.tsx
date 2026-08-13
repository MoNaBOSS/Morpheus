import { Link } from 'react-router-dom';
import { ArrowUpRight, Brain, FolderKanban, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ArtifactsPanel } from './ArtifactsPanel';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusExecutionContextStore } from '@/stores/morpheus-execution-context';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { SupportedActions } from './SupportedActions';
import { PermissionCenter } from '@/components/morpheus/PermissionCenter';

export function ContextRail() {
  const { t } = useTranslation('dashboard');
  const projects = useMorpheusCompanionStore((state) => state.projects.projects);
  const memories = useMorpheusCompanionStore((state) => state.memories);
  const selectedProjectId = useMorpheusExecutionContextStore((state) => state.selectedProjectId);
  const permission = useMorpheusCommandStore((state) => state.permission);
  const project = projects.find((candidate) => candidate.projectId === selectedProjectId) ?? null;
  const projectMemories = memories.filter((memory) => (
    memory.enabled && (memory.projectId === undefined || memory.projectId === project?.projectId)
  ));

  return (
    <aside data-testid="command-center-context-rail" className="flex min-h-0 flex-col overflow-y-auto border-l border-border/60 bg-[hsl(var(--morpheus-surface-2))]/45">
      <section className="border-b border-border/50 p-4">
        <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><FolderKanban className="h-3.5 w-3.5" />{t('morpheus.projects.active')}</p>
        <p data-testid="command-center-active-project" className="mt-2 text-sm text-foreground">{project?.name ?? t('morpheus.projects.none')}</p>
        <p className="mt-1 line-clamp-3 text-2xs leading-relaxed text-muted-foreground">{project?.description || t('morpheus.projects.noActiveDescription')}</p>
        <Link to="/projects" className="mt-3 inline-flex items-center gap-1 text-2xs text-[hsl(var(--morpheus-accent))]">{t('morpheus.projects.manage')}<ArrowUpRight className="h-3 w-3" /></Link>
      </section>

      <section className="border-b border-border/50 p-4">
        <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.launcher.title')}</p>
        <SupportedActions limit={3} />
      </section>

      <section className="border-b border-border/50 p-4">
        <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><Brain className="h-3.5 w-3.5" />{t('morpheus.memory.context')}</p><span data-testid="command-center-memory-count" className="font-mono text-[9px] text-muted-foreground">{projectMemories.length}</span></div>
        {projectMemories.length === 0 ? <p className="mt-3 text-2xs text-muted-foreground">{t('morpheus.memory.emptyCompact')}</p> : <ol className="mt-2 space-y-1.5">{projectMemories.slice(0, 3).map((memory) => <li key={memory.memoryId} className="truncate border-l border-border/70 pl-2 text-2xs text-foreground/75">{memory.title}</li>)}</ol>}
        <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground">{t('morpheus.memory.disclosure')}</p>
      </section>

      <section className="border-b border-border/50 p-4">
        <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />{t('morpheus.status.trust')}</p>
        <p data-testid="command-center-trust-profile" className="mt-2 text-sm">{permission ? t(`morpheus.permission.profiles.${permission.profile}.name`) : t('morpheus.permission.loading')}</p>
        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{t('morpheus.permission.planFirst')}</p>
        <div className="mt-3"><PermissionCenter compact /></div>
      </section>

      <section className="min-h-0 p-4">
        <p className="mb-3 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.artifacts.latest')}</p>
        <ArtifactsPanel limit={2} />
      </section>
    </aside>
  );
}
