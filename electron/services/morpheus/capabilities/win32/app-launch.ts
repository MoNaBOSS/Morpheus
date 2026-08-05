/**
 * Windows capability: launch an approved application.
 *
 * The Renderer supplies an application KEY. The absolute path is derived here
 * from a trusted environment value and then proven to be a real regular file
 * inside the expected system directory. Spawn hardening follows the template in
 * `electron/services/attachment-open-with.ts`.
 *
 * See `harness/specs/rules/morpheus-native-action-safety.md`.
 */
import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';

import {
  getMorpheusApplicationEntry,
  isMorpheusApplicationKey,
} from '@shared/morpheus/actions/registry';
import type { MorpheusActionParams, MorpheusActionResult } from '@shared/morpheus/action-types';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import { assertRegularFileInside } from '../../../../utils/morpheus-path-guard';

/** Bounded lifetime for the spawn attempt itself, not for the launched app. */
const SPAWN_SETTLE_TIMEOUT_MS = 10_000;

/**
 * Resolves the trusted base directory. Taken from the process environment, never
 * from a payload, and asserted to be an absolute drive-rooted path.
 */
export function resolveSystemRoot(env: NodeJS.ProcessEnv): string {
  const candidate = env.SystemRoot || env.systemroot || env.SYSTEMROOT || 'C:\\Windows';
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new MorpheusCapabilityError('resolution-failed', 'SystemRoot is not set');
  }
  if (!isAbsolute(candidate) || !/^[A-Za-z]:[\\/]/.test(candidate)) {
    throw new MorpheusCapabilityError('resolution-failed', 'SystemRoot is not an absolute drive-rooted path');
  }
  return candidate;
}

function launch(executablePath: string, args: readonly string[]): Promise<number | null> {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (pid: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise(pid);
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      rejectPromise(error);
    };

    let child;
    try {
      child = spawn(executablePath, [...args], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        detached: false,
      });
    } catch {
      fail(new MorpheusCapabilityError('execution-failed', 'Failed to start the application'));
      return;
    }

    timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // A bounded rejection is sufficient if the process already exited.
      }
      fail(new MorpheusCapabilityError('execution-failed', 'Application launch did not settle in time'));
    }, SPAWN_SETTLE_TIMEOUT_MS);

    child.once('error', () => {
      fail(new MorpheusCapabilityError('execution-failed', 'Failed to start the application'));
    });

    child.once('spawn', () => {
      // The launched application is intentionally left running; only the spawn
      // itself is bounded. `unref` lets Main exit without waiting on it.
      try {
        child.unref();
      } catch {
        // Not fatal; the child is already detached from our stdio.
      }
      finish(child.pid ?? null);
    });
  });
}

export const win32AppLaunchCapability: MorpheusCapability = {
  actionId: 'app.launch',
  platform: 'win32',

  async resolve(params: MorpheusActionParams, context: MorpheusCapabilityContext): Promise<MorpheusResolution> {
    const applicationKey = params.applicationKey;
    if (!isMorpheusApplicationKey(applicationKey)) {
      throw new MorpheusCapabilityError('invalid-params', 'Unknown application key');
    }

    const entry = getMorpheusApplicationEntry(applicationKey);
    if (entry.platform !== 'win32') {
      throw new MorpheusCapabilityError('unsupported-platform', 'Application is not registered for this platform');
    }

    const systemRoot = resolveSystemRoot(context.env);
    const expectedDir = join(systemRoot, entry.relativeDir);
    const candidate = join(expectedDir, entry.fileName);

    let executablePath: string;
    try {
      executablePath = assertRegularFileInside(expectedDir, candidate);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      throw new MorpheusCapabilityError('resolution-failed', `Application could not be verified: ${reason}`);
    }

    return {
      target: { kind: 'executable', path: executablePath, applicationKey },
      execute: async (): Promise<MorpheusActionResult> => {
        const pid = await launch(executablePath, entry.args);
        return { kind: 'launch', applicationKey, executablePath, pid };
      },
    };
  },
};
