/**
 * Screen capture.
 *
 * The most sensitive capability in 0.5: it records whatever is on screen,
 * including windows belonging to other applications. It is `high` rather than
 * `critical` because it is reversible and because making it confirm forever
 * would produce exactly the prompt fatigue that stops people reading dialogs.
 * So: it asks the first time for a scope, is then grantable for a session or
 * persistently, and NEVER runs automatically on a scope the user has not seen.
 *
 * Three properties are non-negotiable and are enforced here rather than left to
 * the interface:
 *
 *   1. The image is written inside the approved workspace root. A capture that
 *      could land anywhere would be a filesystem escape wearing a new name.
 *   2. Every capture is audited — by path, size and digest, never by content.
 *   3. Capture is visible. The run reaches the interface through the same
 *      audited event stream as everything else, and the Command Center shows a
 *      live indicator driven by that stream, so the indicator cannot claim a
 *      capture that did not happen or miss one that did.
 *
 * The capability belongs to NO group: no workspace or clipboard trust implies
 * permission to photograph the screen.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { desktopCapturer, screen } from 'electron';

import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import { morpheusContentDigest } from '../../audit';

/** Subfolder captures land in, so they are separable from the user's own files. */
export const MORPHEUS_CAPTURE_DIR = 'captures';

/** Upper bound on captured image bytes, so one screenshot cannot fill a disk. */
export const MORPHEUS_MAX_CAPTURE_BYTES = 24 * 1024 * 1024;

/**
 * Filename for a capture.
 *
 * Main-generated from a timestamp: the renderer never names this file, so no
 * caller-supplied string reaches a filesystem path here at all.
 */
export function captureFileName(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `capture-${stamp}.png`;
}

export const win32ScreenCaptureCapability: MorpheusCapability<'screen.capture'> = {
  actionId: 'screen.capture',
  platform: 'win32',

  async resolve(
    _params: MorpheusParamsFor<'screen.capture'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const workspaceRoot = context.roots.resolve('morpheusFiles');
    const directory = join(workspaceRoot, MORPHEUS_CAPTURE_DIR);
    const fileName = captureFileName(new Date());
    const filePath = join(directory, fileName);

    return {
      // Resolved BEFORE the prompt, so the confirmation names the real file the
      // image will be written to rather than a placeholder.
      target: { kind: 'file', path: filePath, bytes: 0, workspaceRoot },

      execute: async (): Promise<MorpheusActionResult> => {
        const display = screen.getPrimaryDisplay();
        const { width, height } = display.size;
        const scale = display.scaleFactor || 1;

        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.round(width * scale),
            height: Math.round(height * scale),
          },
        });

        const source = sources[0];
        if (!source || source.thumbnail.isEmpty()) {
          // Truthful failure. Returning an empty image would be a fabricated
          // result, and the artifact list would claim a capture that is blank.
          throw new MorpheusCapabilityError('execution-failed', 'No screen was available to capture');
        }

        const png = source.thumbnail.toPNG();
        if (png.byteLength > MORPHEUS_MAX_CAPTURE_BYTES) {
          throw new MorpheusCapabilityError('execution-failed', 'Captured image is too large to store');
        }

        const { mkdir } = await import('node:fs/promises');
        await mkdir(directory, { recursive: true });
        // Exclusive create: the filename is timestamped, so a collision means
        // something unexpected already occupies the path and overwriting it
        // would destroy data this capability has no permission to destroy.
        await writeFile(filePath, png, { flag: 'wx' });

        return {
          kind: 'file',
          path: filePath,
          bytes: png.byteLength,
          // Digest of the bytes, never the bytes themselves.
          contentSha256: morpheusContentDigest(png.toString('base64')),
        };
      },
    };
  },
};
