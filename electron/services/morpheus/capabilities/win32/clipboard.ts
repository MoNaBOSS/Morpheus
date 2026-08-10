/**
 * Clipboard capabilities.
 *
 * Read and write are separate capabilities with separate trust scopes, and
 * neither belongs to a capability group. That separation is deliberate: the
 * clipboard routinely holds passwords, tokens and private text the user copied
 * for some entirely unrelated purpose, so "Morpheus may put text on my
 * clipboard" must never imply "Morpheus may read what is already on it".
 */
import { clipboard } from 'electron';

import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';
import { PARAM_LIMITS } from '@shared/morpheus/capabilities/params';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import { morpheusContentDigest } from '../../audit';

/**
 * Reads the clipboard.
 *
 * `high` risk: grantable, but never automatic on a scope the user has not
 * approved. The resolved target is `none` — there is no path to show, and the
 * prompt describes the boundary rather than a file.
 */
export const win32ClipboardReadCapability: MorpheusCapability<'clipboard.readText'> = {
  actionId: 'clipboard.readText',
  platform: 'win32',

  async resolve(
    _params: MorpheusParamsFor<'clipboard.readText'>,
    _context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    return {
      target: { kind: 'none' },
      execute: async (): Promise<MorpheusActionResult> => {
        const text = clipboard.readText();
        // Bounded like any other text payload, so an enormous clipboard cannot
        // be pulled wholesale into an event and a renderer store.
        if (text.length > PARAM_LIMITS.textContentBytes) {
          throw new MorpheusCapabilityError('invalid-params', 'Clipboard contents are too large to read');
        }
        return {
          kind: 'text',
          path: 'clipboard',
          bytes: Buffer.byteLength(text, 'utf8'),
          contentSha256: morpheusContentDigest(text),
          text,
        };
      },
    };
  },
};

export const win32ClipboardWriteCapability: MorpheusCapability<'clipboard.writeText'> = {
  actionId: 'clipboard.writeText',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'clipboard.writeText'>,
    _context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const content = params.content;

    return {
      target: { kind: 'none' },
      execute: async (): Promise<MorpheusActionResult> => {
        clipboard.writeText(content);
        return {
          kind: 'text',
          path: 'clipboard',
          bytes: Buffer.byteLength(content, 'utf8'),
          contentSha256: morpheusContentDigest(content),
          // Echoed back so the interface can confirm what was placed. The
          // audit still records only a byte count and a digest.
          text: content,
        };
      },
    };
  },
};
