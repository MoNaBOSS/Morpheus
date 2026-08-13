import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, FolderKanban } from 'lucide-react';

import { useMorpheusExecutionContextStore } from '@/stores/morpheus-execution-context';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';
import { cn } from '@/lib/utils';
import { MorpheusWorkspaceControl } from './MorpheusWorkspaceControl';

export function MorpheusObjectiveContextPicker({ className }: { className?: string }) {
  const { t } = useTranslation('dashboard');
  const profiles = useMorpheusFoundationStore((state) => state.agentProfiles);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const selectedAgentProfileId = useMorpheusExecutionContextStore((state) => state.selectedAgentProfileId);
  const selectAgentProfile = useMorpheusExecutionContextStore((state) => state.selectAgentProfile);
  const selectedProjectId = useMorpheusExecutionContextStore((state) => state.selectedProjectId);
  const selectProject = useMorpheusExecutionContextStore((state) => state.selectProject);
  const projects = useMorpheusCompanionStore((state) => state.projects.projects);
  const loadContext = useMorpheusCompanionStore((state) => state.loadContext);
  const selectedWorkspaceId = useMorpheusWorkspacesStore((state) => state.selectedWorkspaceId);

  useEffect(() => {
    let active = true;
    void Promise.all([loadModels(), loadContext()]).then(() => {
      if (!active) return;
      const persistedId = useMorpheusExecutionContextStore.getState().selectedAgentProfileId;
      const available = useMorpheusFoundationStore.getState().agentProfiles
        .some((profile) => profile.enabled && profile.profileId === persistedId);
      if (persistedId && !available) selectAgentProfile(null);

      const context = useMorpheusExecutionContextStore.getState();
      const availableProjects = useMorpheusCompanionStore.getState().projects.projects;
      const projectAvailable = availableProjects.some((project) => (
        project.enabled
        && project.projectId === context.selectedProjectId
        && project.workspaceId === selectedWorkspaceId
      ));
      if (!projectAvailable) {
        const personal = availableProjects.find((project) => (
          project.enabled && project.projectId === 'personal' && project.workspaceId === selectedWorkspaceId
        ));
        selectProject(personal?.projectId ?? null);
      }
    });
    return () => { active = false; };
  }, [loadContext, loadModels, selectAgentProfile, selectProject, selectedWorkspaceId]);

  const enabledProfiles = profiles.filter((profile) => profile.enabled);
  const selected = enabledProfiles.find((profile) => profile.profileId === selectedAgentProfileId);
  const enabledProjects = projects.filter((project) => (
    project.enabled && project.workspaceId === selectedWorkspaceId
  ));
  const selectedProject = enabledProjects.find((project) => project.projectId === selectedProjectId);

  return (
    <div data-testid="morpheus-objective-context" className={cn('flex min-w-0 items-center gap-2', className)}>
      <MorpheusWorkspaceControl compact />
      <div className="flex min-w-0 items-center gap-1.5">
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <select
          data-testid="morpheus-project-select"
          value={selectedProject?.projectId ?? ''}
          onChange={(event) => selectProject(event.target.value || null)}
          aria-label={t('morpheus.projects.active')}
          className="min-w-0 max-w-36 rounded-md border border-border/70 bg-[hsl(var(--morpheus-surface-2))] px-2 py-1.5 text-2xs text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]"
        >
          <option value="">{t('morpheus.projects.none')}</option>
          {enabledProjects.map((project) => (
            <option key={project.projectId} value={project.projectId}>{project.name}</option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <select
          data-testid="morpheus-agent-profile-select"
          value={selected?.profileId ?? ''}
          disabled={enabledProfiles.length === 0}
          onChange={(event) => selectAgentProfile(event.target.value || null)}
          aria-label={t('morpheus.agentProfiles.active')}
          className="min-w-0 max-w-44 rounded-md border border-border/70 bg-[hsl(var(--morpheus-surface-2))] px-2 py-1.5 text-2xs text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]"
        >
          <option value="">{t('morpheus.agentProfiles.automatic')}</option>
          {enabledProfiles.map((profile) => (
            <option key={profile.profileId} value={profile.profileId}>{profile.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
