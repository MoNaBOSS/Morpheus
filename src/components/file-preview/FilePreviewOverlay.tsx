/**
 * Sheet-based wrapper around `FilePreviewBody`, used by the Skills page
 * (read-only) to preview SKILL.md and friends in a full-screen overlay.
 *
 * The Chat page uses the inline `ArtifactPanel` instead of this component.
 */
import { useEffect } from 'react';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { isHtmlPreviewExt } from '@/lib/generated-files';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { FilePreviewBody } from './FilePreviewBody';
import type { FilePreviewTarget } from './types';

export type { FilePreviewTarget } from './types';

export interface FilePreviewOverlayProps {
  file: FilePreviewTarget | null;
  readOnly?: boolean;
  onClose: () => void;
}

export function FilePreviewOverlay({ file, readOnly = false, onClose }: FilePreviewOverlayProps) {
  const htmlPreview = file && isHtmlPreviewExt(file.ext) ? file : null;

  useEffect(() => {
    if (!htmlPreview) return;

    // The sandboxed HTML webview is route-stable and Main-owned. Publish the
    // overlay's exact scoped file reference to the same state used by the Chat
    // artifact panel so WebBrowserHost can validate and navigate it. The
    // overlay still owns presentation; this store carries no file authority.
    useArtifactPanel.getState().openPreview(htmlPreview);
    return () => {
      const current = useArtifactPanel.getState();
      if (current.focusedFile === htmlPreview) current.close();
    };
  }, [htmlPreview]);

  return (
    <Sheet open={!!file} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[70vw] max-w-[1100px] sm:max-w-[1100px] p-0 flex flex-col"
      >
        {file && <FilePreviewBody file={file} readOnly={readOnly} />}
      </SheetContent>
    </Sheet>
  );
}

export default FilePreviewOverlay;
