/**
 * Windows capability: create a text file inside a Main-controlled approved root.
 *
 * The Renderer supplies a leaf file name and content. It never supplies a
 * directory, a root, or an absolute path.
 *
 * The write uses the exclusive-create flag. That is the symlink-escape defence:
 * `wx` fails if anything at all already exists at the resolved path, so a
 * previously planted link or file cannot be written through.
 */
import { open } from 'node:fs/promises';

import {
  MORPHEUS_MAX_TEXT_BYTES,
  getMorpheusActionDescriptor,
} from '@shared/morpheus/actions/registry';
import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import { assertSafeTextFileName, resolveWithinRoot } from '../../../../utils/morpheus-path-guard';
import { morpheusContentDigest } from '../../audit';

export const win32CreateTextFileCapability: MorpheusCapability<'file.createText'> = {
  actionId: 'file.createText',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.createText'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    let fileName: string;
    try {
      fileName = assertSafeTextFileName(params.fileName);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      throw new MorpheusCapabilityError('invalid-params', `File name rejected: ${reason}`);
    }

    const content = params.content;
    if (typeof content !== 'string') {
      throw new MorpheusCapabilityError('invalid-params', 'Content must be a string');
    }
    // Lone surrogates cannot round-trip through UTF-8 and would make the stored
    // byte count disagree with the recorded digest.
    if (/[\uD800-\uDFFF]/.test(content.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))) {
      throw new MorpheusCapabilityError('invalid-params', 'Content contains unpaired surrogates');
    }

    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MORPHEUS_MAX_TEXT_BYTES) {
      throw new MorpheusCapabilityError('invalid-params', 'Content exceeds the permitted size');
    }

    const rootKey = getMorpheusActionDescriptor('file.createText').rootKey;
    if (!rootKey) {
      throw new MorpheusCapabilityError('internal', 'file.createText has no approved root');
    }

    const root = context.roots.resolve(rootKey);
    let filePath: string;
    try {
      filePath = resolveWithinRoot(root, fileName);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      throw new MorpheusCapabilityError('resolution-failed', `Path rejected: ${reason}`);
    }

    return {
      target: { kind: 'file', path: filePath, bytes },
      execute: async (): Promise<MorpheusActionResult> => {
        let handle;
        try {
          handle = await open(filePath, 'wx');
        } catch (error) {
          const code = (error as NodeJS.ErrnoException)?.code;
          if (code === 'EEXIST') {
            throw new MorpheusCapabilityError('execution-failed', 'A file with that name already exists');
          }
          throw new MorpheusCapabilityError('execution-failed', 'The file could not be created');
        }
        try {
          await handle.writeFile(content, 'utf8');
        } catch {
          throw new MorpheusCapabilityError('execution-failed', 'The file could not be written');
        } finally {
          await handle.close().catch(() => undefined);
        }

        return {
          kind: 'file',
          path: filePath,
          bytes,
          contentSha256: morpheusContentDigest(content),
        };
      },
    };
  },
};
