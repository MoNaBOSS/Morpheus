/** Bounded process inventory using a fixed Windows system executable. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

import type { MorpheusProcessResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import { assertRegularFileInside } from '../../../../utils/morpheus-path-guard';
import { resolveSystemRoot } from './app-launch';

const MAX_PROCESSES = 500;
const TIMEOUT_MS = 5_000;

export function parseTaskListCsv(output: string): MorpheusProcessResult['processes'] {
  const rows: Array<{ pid: number; name: string; memoryBytes?: number }> = [];
  for (const line of output.split(/\r?\n/)) {
    const fields = line.match(/^"((?:[^"]|"")*)","(\d+)","[^"]*","[^"]*","([\d,]+) K"/i);
    if (!fields) continue;
    const name = fields[1].replace(/""/g, '"').trim();
    const pid = Number(fields[2]);
    const memoryKiB = Number(fields[3].replace(/,/g, ''));
    if (!name || !Number.isSafeInteger(pid) || pid < 0) continue;
    rows.push({
      pid,
      name,
      memoryBytes: Number.isFinite(memoryKiB) ? memoryKiB * 1024 : undefined,
    });
    if (rows.length >= MAX_PROCESSES) break;
  }
  return rows;
}

function collect(executablePath: string): Promise<MorpheusProcessResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let output = '';
    const finish = (result: MorpheusProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    };

    let child;
    try {
      child = spawn(executablePath, ['/FO', 'CSV', '/NH'], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        detached: false,
      });
    } catch {
      fail(new MorpheusCapabilityError('execution-failed', 'Failed to inspect running processes'));
      return;
    }
    child.stdout?.on('data', (chunk: Buffer | string) => {
      if (output.length < 512 * 1024) output += String(chunk);
    });
    child.once('error', () => fail(new MorpheusCapabilityError('execution-failed', 'Failed to inspect running processes')));
    child.once('close', (code) => {
      if (code !== 0) {
        fail(new MorpheusCapabilityError('execution-failed', 'Windows process inventory failed'));
        return;
      }
      finish({ kind: 'processes', processes: parseTaskListCsv(output), truncated: output.length >= 512 * 1024 });
    });
    timer = setTimeout(() => {
      try { child.kill(); } catch { /* already exited */ }
      fail(new MorpheusCapabilityError('execution-failed', 'Windows process inventory timed out'));
    }, TIMEOUT_MS);
  });
}

export const win32SystemProcessesCapability: MorpheusCapability<'system.processes'> = {
  actionId: 'system.processes',
  platform: 'win32',

  async resolve(
    _params: MorpheusParamsFor<'system.processes'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const systemRoot = resolveSystemRoot(context.env);
    const expectedDir = join(systemRoot, 'System32');
    let executablePath: string;
    try {
      executablePath = assertRegularFileInside(expectedDir, join(expectedDir, 'tasklist.exe'));
    } catch {
      throw new MorpheusCapabilityError('resolution-failed', 'Windows process inventory is unavailable');
    }
    return {
      // The fixed helper is an implementation detail, not the user's trust
      // boundary. Keep the prompt about process disclosure rather than showing
      // a misleading approved-app label.
      target: { kind: 'none' },
      execute: () => collect(executablePath),
    };
  },
};
