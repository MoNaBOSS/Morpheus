/**
 * Artifacts produced by real executions, plus the approved files location.
 *
 * The folder is opened through a typed Main-owned capability; the renderer
 * never gets shell access to an arbitrary path.
 */
import { useTranslation } from 'react-i18next';
import { FileText, FolderOpen, MonitorPlay, ScrollText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';

function reportSummary(data: Record<string, string | number>): string {
  if (typeof data.path === 'string') return data.path;
  if (typeof data.platform === 'string') return `${data.platform} ${data.release ?? ''}`.trim();
  if (typeof data.origin === 'string') return data.origin;
  if (typeof data.root === 'string') return data.root;
  const first = Object.entries(data)[0];
  return first ? `${first[0]}: ${first[1]}` : 'report';
}

export function ArtifactsPanel({ limit }: { limit?: number }) {
  const { t } = useTranslation('dashboard');
  const artifacts = useMorpheusCommandStore((state) => state.artifacts);
  const filesRoot = useMorpheusCommandStore((state) => state.filesRoot);
  const openFilesRoot = useMorpheusCommandStore((state) => state.openFilesRoot);
  const visibleArtifacts = typeof limit === 'number' ? artifacts.slice(0, limit) : artifacts;

  return (
    <div data-testid="morpheus-artifacts" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded-md border bg-surface-input px-2.5 py-2">
        <div className="min-w-0">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            {t('morpheus.artifacts.rootLabel')}
          </p>
          <p data-testid="morpheus-files-root" className="truncate font-mono text-2xs">
            {filesRoot ?? t('morpheus.artifacts.rootUnknown')}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          data-testid="morpheus-open-files-root"
          disabled={!filesRoot}
          onClick={() => void openFilesRoot()}
          className="h-7 shrink-0 gap-1.5"
        >
          <FolderOpen className="h-3.5 w-3.5" aria-hidden />
          {t('morpheus.artifacts.open')}
        </Button>
      </div>

      {artifacts.length === 0 ? (
        <p data-testid="morpheus-artifacts-empty" className="text-tiny text-muted-foreground">
          {t('morpheus.artifacts.empty')}
        </p>
      ) : (
        <ul data-testid="morpheus-artifact-list" className="flex flex-col gap-1">
          {visibleArtifacts.map((artifact) => (
            <li
              key={artifact.artifactId}
              data-testid="morpheus-artifact"
              data-kind={artifact.kind}
              className="flex items-center gap-2 rounded-md border bg-surface-modal px-2.5 py-1.5"
            >
              {artifact.kind === 'file' ? <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                : artifact.kind === 'process' ? <MonitorPlay className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  : <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-2xs">
                  {artifact.kind === 'file' ? artifact.path
                    : artifact.kind === 'process' ? artifact.executablePath
                      : reportSummary(artifact.data)}
                </p>
                <p className="text-2xs text-muted-foreground">
                  {new Date(artifact.createdAt).toLocaleTimeString()}
                  {artifact.kind === 'file' ? ` · ${artifact.bytes} B` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {visibleArtifacts.length < artifacts.length ? (
        <p className="text-right text-[9px] text-muted-foreground">
          {t('morpheus.artifacts.more', { count: artifacts.length - visibleArtifacts.length })}
        </p>
      ) : null}
    </div>
  );
}
