import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPlus, Shield, Trash2 } from 'lucide-react';

import { MonoPath, StatusDot } from '@/components/morpheus/ui';
import { Switch } from '@/components/ui/switch';
import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';

type MorpheusWorkspaceControlProps = {
  compact?: boolean;
};

const controlClass = 'rounded-md border border-border/80 bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2 text-tiny text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]';

export function MorpheusWorkspaceControl({ compact = false }: MorpheusWorkspaceControlProps) {
  const { t } = useTranslation('dashboard');
  const snapshot = useMorpheusWorkspacesStore((state) => state.snapshot);
  const selectedWorkspaceId = useMorpheusWorkspacesStore((state) => state.selectedWorkspaceId);
  const loading = useMorpheusWorkspacesStore((state) => state.loading);
  const error = useMorpheusWorkspacesStore((state) => state.error);
  const load = useMorpheusWorkspacesStore((state) => state.load);
  const select = useMorpheusWorkspacesStore((state) => state.select);
  const add = useMorpheusWorkspacesStore((state) => state.add);
  const update = useMorpheusWorkspacesStore((state) => state.update);
  const remove = useMorpheusWorkspacesStore((state) => state.remove);
  const open = useMorpheusWorkspacesStore((state) => state.open);

  useEffect(() => { void load(); }, [load]);

  const available = snapshot?.workspaces.filter((workspace) => workspace.enabled && workspace.available) ?? [];
  const selected = snapshot?.workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId);

  if (compact) {
    return (
      <div data-testid="morpheus-workspace-control" className="flex min-w-0 items-center gap-1.5">
        <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <select
          data-testid="morpheus-workspace-select"
          value={selectedWorkspaceId}
          disabled={loading || available.length === 0}
          onChange={(event) => select(event.target.value)}
          aria-label={t('morpheus.workspaces.active')}
          className="min-w-0 max-w-44 rounded-md border border-border/70 bg-[hsl(var(--morpheus-surface-2))] px-2 py-1.5 text-2xs text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]"
        >
          {available.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}
        </select>
        <button
          type="button"
          data-testid="morpheus-workspace-open"
          onClick={() => void open()}
          disabled={!selected?.available}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--morpheus-accent))] disabled:opacity-30"
          aria-label={t('morpheus.workspaces.open')}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          data-testid="morpheus-workspace-add"
          onClick={() => void add({ access: 'read-write' })}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--morpheus-accent))]"
          aria-label={t('morpheus.workspaces.add')}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <section data-morpheus data-testid="morpheus-workspace-manager" className="rounded-xl border border-border/70 bg-[hsl(var(--morpheus-surface-2))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[hsl(var(--morpheus-accent))]" />
            <h3 className="font-serif text-lg font-normal tracking-tight">{t('morpheus.workspaces.title')}</h3>
          </div>
          <p className="mt-1 max-w-2xl text-tiny text-muted-foreground">{t('morpheus.workspaces.description')}</p>
        </div>
        <button
          type="button"
          data-testid="morpheus-workspace-add-full"
          onClick={() => void add({ access: 'read-write' })}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-3 py-2 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/15"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {t('morpheus.workspaces.add')}
        </button>
      </div>

      {error ? <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-tiny text-destructive">{error}</p> : null}
      <div className="mt-4 space-y-2">
        {snapshot?.workspaces.map((workspace) => (
          <article
            key={workspace.workspaceId}
            data-testid={`morpheus-workspace-${workspace.workspaceId}`}
            className="grid items-center gap-3 rounded-lg border border-border/60 bg-[hsl(var(--morpheus-surface-3))] p-3 md:grid-cols-[minmax(0,1fr)_140px_auto]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { if (workspace.enabled && workspace.available) select(workspace.workspaceId); }}
                  className="truncate text-left text-tiny font-medium text-foreground hover:text-[hsl(var(--morpheus-accent))]"
                >
                  {workspace.name}
                </button>
                {workspace.workspaceId === selectedWorkspaceId ? <StatusDot tone="ok" label={t('morpheus.workspaces.selected')} /> : null}
                {!workspace.available ? <StatusDot tone="error" label={t('morpheus.workspaces.unavailable')} /> : null}
                {workspace.kind === 'managed' ? <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{t('morpheus.workspaces.managed')}</span> : null}
              </div>
              <MonoPath path={workspace.rootPath} className="mt-1 block truncate text-2xs" />
            </div>
            <label className="text-2xs text-muted-foreground">
              {t('morpheus.workspaces.access')}
              <select
                data-testid={`morpheus-workspace-access-${workspace.workspaceId}`}
                value={workspace.access}
                onChange={(event) => void update({
                  workspaceId: workspace.workspaceId,
                  access: event.target.value as 'read' | 'read-write',
                })}
                className={`${controlClass} mt-1 w-full`}
              >
                <option value="read">{t('morpheus.workspaces.read')}</option>
                <option value="read-write">{t('morpheus.workspaces.readWrite')}</option>
              </select>
            </label>
            <div className="flex items-center justify-end gap-1">
              <Switch
                data-testid={`morpheus-workspace-enabled-${workspace.workspaceId}`}
                checked={workspace.enabled}
                onCheckedChange={(enabled) => void update({ workspaceId: workspace.workspaceId, enabled })}
                aria-label={workspace.enabled ? t('morpheus.common.disable') : t('morpheus.common.enable')}
              />
              <button
                type="button"
                onClick={() => void open(workspace.workspaceId)}
                disabled={!workspace.available}
                className="rounded-md p-2 text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--morpheus-accent))] disabled:opacity-30"
                aria-label={t('morpheus.workspaces.open')}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
              {workspace.kind === 'user' ? (
                <button
                  type="button"
                  data-testid={`morpheus-workspace-remove-${workspace.workspaceId}`}
                  onClick={() => void remove(workspace.workspaceId)}
                  className="rounded-md p-2 text-muted-foreground hover:bg-white/5 hover:text-destructive"
                  aria-label={t('morpheus.common.remove')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">{t('morpheus.workspaces.authorityNote')}</p>
    </section>
  );
}
