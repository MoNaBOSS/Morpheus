import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, FolderKanban, Plus, Save, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState, StatusDot } from '@/components/morpheus/ui';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';
import type { MorpheusProjectDraft } from '@shared/morpheus/project-types';
import type { MorpheusMemoryDraft, MorpheusMemoryKind } from '@shared/morpheus/memory-types';

const EMPTY_PROJECT = (workspaceId: string): MorpheusProjectDraft => ({
  name: '', description: '', instructions: '', workspaceId, enabled: true,
});

const EMPTY_MEMORY = (projectId?: string): MorpheusMemoryDraft => ({
  title: '', text: '', kind: 'project-context', sensitivity: 'normal', providerUse: 'allowed', enabled: true,
  ...(projectId ? { projectId } : {}),
});

function draftFromProject(project: MorpheusProjectDraft & { projectId: string }): MorpheusProjectDraft {
  return {
    projectId: project.projectId,
    name: project.name,
    description: project.description,
    workspaceId: project.workspaceId,
    instructions: project.instructions,
    enabled: project.enabled,
  };
}

export function Projects() {
  const { t } = useTranslation('dashboard');
  const projects = useMorpheusCompanionStore((state) => state.projects.projects);
  const memories = useMorpheusCompanionStore((state) => state.memories);
  const error = useMorpheusCompanionStore((state) => state.error);
  const loadContext = useMorpheusCompanionStore((state) => state.loadContext);
  const saveProject = useMorpheusCompanionStore((state) => state.saveProject);
  const removeProject = useMorpheusCompanionStore((state) => state.removeProject);
  const saveMemory = useMorpheusCompanionStore((state) => state.saveMemory);
  const removeMemory = useMorpheusCompanionStore((state) => state.removeMemory);
  const workspaceSnapshot = useMorpheusWorkspacesStore((state) => state.snapshot);
  const selectedWorkspaceId = useMorpheusWorkspacesStore((state) => state.selectedWorkspaceId);
  const loadWorkspaces = useMorpheusWorkspacesStore((state) => state.load);
  const [selectedProjectId, setSelectedProjectId] = useState<string | 'new'>('personal');
  const [projectDraft, setProjectDraft] = useState<MorpheusProjectDraft>(() => EMPTY_PROJECT(selectedWorkspaceId));
  const [memoryDraft, setMemoryDraft] = useState<MorpheusMemoryDraft>(() => EMPTY_MEMORY('personal'));
  const [saving, setSaving] = useState(false);

  useEffect(() => { void Promise.all([loadContext(), loadWorkspaces()]); }, [loadContext, loadWorkspaces]);

  const selected = selectedProjectId === 'new' ? null : projects.find((project) => project.projectId === selectedProjectId) ?? projects[0] ?? null;
  // Project data arrives asynchronously. Until a user edits this selection,
  // render its durable Main projection directly instead of copying it through
  // an effect and creating an avoidable render cascade.
  const visibleProjectDraft = selected && projectDraft.projectId !== selected.projectId
    ? draftFromProject(selected)
    : projectDraft;

  const projectMemories = useMemo(() => memories.filter((memory) => memory.projectId === selected?.projectId), [memories, selected?.projectId]);
  const workspaces = workspaceSnapshot?.workspaces.filter((workspace) => workspace.enabled && workspace.available) ?? [];
  const selectProject = (project: NonNullable<typeof selected>): void => {
    setSelectedProjectId(project.projectId);
    setProjectDraft(draftFromProject(project));
    setMemoryDraft(EMPTY_MEMORY(project.projectId));
  };

  return (
    <div data-morpheus data-testid="projects-page" className="morpheus-command-center flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--morpheus-surface-1))]">
      <header className="relative z-10 flex shrink-0 items-end justify-between border-b border-border/60 px-6 py-4">
        <div><p className="text-[9px] uppercase tracking-[0.25em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.projects.eyebrow')}</p><h1 className="mt-1 font-serif text-2xl font-normal">{t('morpheus.projects.title')}</h1><p className="mt-1 text-2xs text-muted-foreground">{t('morpheus.projects.description')}</p></div>
        <Button size="sm" variant="outline" data-testid="project-create" onClick={() => { setSelectedProjectId('new'); setProjectDraft(EMPTY_PROJECT(selectedWorkspaceId)); setMemoryDraft(EMPTY_MEMORY()); }} className="gap-2"><Plus className="h-3.5 w-3.5" />{t('morpheus.projects.create')}</Button>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-border/60 bg-[hsl(var(--morpheus-surface-2))]/55" data-testid="projects-list">
          {projects.map((project) => <button key={project.projectId} type="button" data-testid={`project-list-item-${project.projectId}`} data-selected={selected?.projectId === project.projectId} onClick={() => selectProject(project)} className={`w-full border-l-2 px-4 py-3 text-left ${selected?.projectId === project.projectId ? 'border-[hsl(var(--morpheus-accent))] bg-[hsl(var(--morpheus-accent))]/[0.06]' : 'border-transparent hover:bg-white/[0.03]'}`}><div className="flex items-center gap-2"><FolderKanban className="h-3.5 w-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-tiny">{project.name}</span><StatusDot tone={project.enabled ? 'ok' : 'idle'} /></div><p className="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">{project.description || t('morpheus.projects.noDescription')}</p></button>)}
        </aside>

        <main className="min-h-0 overflow-y-auto p-6">
          <div className="mx-auto grid max-w-5xl gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <section data-testid="project-editor">
              <div className="flex items-center justify-between border-b border-border/60 pb-3"><div><p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{selectedProjectId === 'new' ? t('morpheus.projects.newProject') : t('morpheus.projects.projectContext')}</p><h2 className="mt-1 font-serif text-xl">{visibleProjectDraft.name || t('morpheus.projects.untitled')}</h2></div>{selected && !selected.builtIn ? <Button variant="ghost" size="sm" data-testid="project-remove" onClick={() => void (async () => { if (await removeProject(selected.projectId)) { const personal = projects.find((project) => project.projectId === 'personal'); if (personal) selectProject(personal); } })()} className="gap-1.5 text-[hsl(var(--morpheus-danger))]"><Trash2 className="h-3.5 w-3.5" />{t('morpheus.common.remove')}</Button> : null}</div>
              <div className="mt-5 space-y-4">
                <label className="block"><span className="text-2xs text-muted-foreground">{t('morpheus.projects.name')}</span><input data-testid="project-name" value={visibleProjectDraft.name} onChange={(event) => setProjectDraft({ ...visibleProjectDraft, name: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] px-3 text-sm outline-none focus:border-[hsl(var(--morpheus-accent-dim))]" /></label>
                <label className="block"><span className="text-2xs text-muted-foreground">{t('morpheus.projects.descriptionLabel')}</span><input data-testid="project-description" value={visibleProjectDraft.description} onChange={(event) => setProjectDraft({ ...visibleProjectDraft, description: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] px-3 text-sm outline-none focus:border-[hsl(var(--morpheus-accent-dim))]" /></label>
                <label className="block"><span className="text-2xs text-muted-foreground">{t('morpheus.projects.workspace')}</span><select data-testid="project-workspace" value={visibleProjectDraft.workspaceId} disabled={Boolean(selected?.builtIn)} onChange={(event) => setProjectDraft({ ...visibleProjectDraft, workspaceId: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] px-3 text-sm outline-none">{workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}</select></label>
                <label className="block"><span className="text-2xs text-muted-foreground">{t('morpheus.projects.instructions')}</span><textarea data-testid="project-instructions" rows={7} value={visibleProjectDraft.instructions} onChange={(event) => setProjectDraft({ ...visibleProjectDraft, instructions: event.target.value })} placeholder={t('morpheus.projects.instructionsPlaceholder')} className="mt-1.5 w-full resize-none rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] p-3 text-sm leading-relaxed outline-none focus:border-[hsl(var(--morpheus-accent-dim))]" /></label>
                <label className="flex items-center gap-2 text-2xs text-muted-foreground"><input data-testid="project-enabled" type="checkbox" checked={visibleProjectDraft.enabled} disabled={Boolean(selected?.builtIn)} onChange={(event) => setProjectDraft({ ...visibleProjectDraft, enabled: event.target.checked })} />{t('morpheus.common.enabled')}</label>
                {error ? <p data-testid="project-error" className="text-2xs text-[hsl(var(--morpheus-danger))]">{error}</p> : null}
                <Button data-testid="project-save" disabled={saving || !visibleProjectDraft.name.trim()} onClick={() => void (async () => { setSaving(true); const saved = await saveProject(visibleProjectDraft); setSaving(false); if (saved) selectProject(saved); })()} className="gap-2"><Save className="h-3.5 w-3.5" />{t('morpheus.common.save')}</Button>
              </div>
            </section>

            <section data-testid="project-memory" className="border-l border-border/60 pl-8">
              <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-[hsl(var(--morpheus-accent))]" /><h2 className="font-serif text-lg">{t('morpheus.memory.title')}</h2></div>
              <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{t('morpheus.memory.description')}</p>
              {!selected ? <EmptyState message={t('morpheus.memory.saveProjectFirst')} /> : (
                <>
                  <div className="mt-4 space-y-2"><input data-testid="memory-title" value={memoryDraft.title} onChange={(event) => setMemoryDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder={t('morpheus.memory.titlePlaceholder')} className="h-9 w-full rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] px-3 text-tiny outline-none" /><textarea data-testid="memory-text" rows={4} value={memoryDraft.text} onChange={(event) => setMemoryDraft((draft) => ({ ...draft, text: event.target.value }))} placeholder={t('morpheus.memory.textPlaceholder')} className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] p-3 text-tiny outline-none" /><div className="grid grid-cols-2 gap-2"><select data-testid="memory-kind" value={memoryDraft.kind} onChange={(event) => setMemoryDraft((draft) => ({ ...draft, kind: event.target.value as MorpheusMemoryKind }))} className="h-9 rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] px-2 text-2xs">{(['preference', 'project-context', 'routine', 'decision'] as const).map((kind) => <option key={kind} value={kind}>{t(`morpheus.memory.kinds.${kind}`)}</option>)}</select><select data-testid="memory-provider-use" value={memoryDraft.providerUse} onChange={(event) => setMemoryDraft((draft) => ({ ...draft, providerUse: event.target.value as 'allowed' | 'local-only' }))} className="h-9 rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] px-2 text-2xs"><option value="allowed">{t('morpheus.memory.providerUse.allowed')}</option><option value="local-only">{t('morpheus.memory.providerUse.local-only')}</option></select></div><label className="flex items-center gap-2 text-2xs text-muted-foreground"><input type="checkbox" checked={memoryDraft.sensitivity === 'sensitive'} onChange={(event) => setMemoryDraft((draft) => ({ ...draft, sensitivity: event.target.checked ? 'sensitive' : 'normal', providerUse: event.target.checked ? 'local-only' : draft.providerUse }))} />{t('morpheus.memory.sensitive')}</label><Button size="sm" variant="outline" data-testid="memory-save" disabled={!memoryDraft.title.trim() || !memoryDraft.text.trim()} onClick={() => void (async () => { const saved = await saveMemory({ ...memoryDraft, projectId: selected.projectId }); if (saved) setMemoryDraft(EMPTY_MEMORY(selected.projectId)); })()} className="gap-2"><Plus className="h-3.5 w-3.5" />{t('morpheus.memory.add')}</Button></div>
                  <div className="mt-6 border-t border-border/60 pt-4"><p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.memory.entries', { count: projectMemories.length })}</p>{projectMemories.length === 0 ? <EmptyState message={t('morpheus.memory.empty')} /> : <ol className="mt-2 divide-y divide-border/50">{projectMemories.map((memory) => <li key={memory.memoryId} data-testid={`memory-item-${memory.memoryId}`} data-enabled={memory.enabled} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-tiny font-medium">{memory.title}</p><p className="mt-1 line-clamp-3 text-2xs leading-relaxed text-muted-foreground">{memory.text}</p><p className="mt-2 font-mono text-[9px] uppercase text-muted-foreground">{t(`morpheus.memory.kinds.${memory.kind}`)} · {t(`morpheus.memory.providerUse.${memory.providerUse}`)}</p></div><div className="flex shrink-0 items-center gap-1"><button type="button" data-testid={`memory-toggle-${memory.memoryId}`} onClick={() => void saveMemory({ memoryId: memory.memoryId, title: memory.title, text: memory.text, kind: memory.kind, sensitivity: memory.sensitivity, providerUse: memory.providerUse, projectId: memory.projectId, enabled: !memory.enabled })} className="rounded border border-border px-1.5 py-1 text-[9px] uppercase text-muted-foreground hover:text-foreground">{memory.enabled ? t('morpheus.common.disable') : t('morpheus.common.enable')}</button><button type="button" aria-label={t('morpheus.memory.remove')} onClick={() => void removeMemory(memory.memoryId)} className="rounded p-1 text-muted-foreground hover:text-[hsl(var(--morpheus-danger))]"><Trash2 className="h-3.5 w-3.5" /></button></div></div></li>)}</ol>}</div>
                </>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
