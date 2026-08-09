/**
 * Windows capability: privacy-safe system information.
 *
 * Deliberately excludes username, hostname, network interfaces, machine id,
 * serial numbers and locale — anything that identifies the person or the
 * machine rather than describing the runtime.
 */
import { arch, cpus, freemem, platform, release, totalmem, uptime } from 'node:os';

import type { MorpheusActionResult, MorpheusSystemInfo } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';

import type {
  MorpheusCapability,
  MorpheusCapabilityContext,
  MorpheusResolution,
} from '../../capability-registry';

export function collectMorpheusSystemInfo(appVersion: string): MorpheusSystemInfo {
  return {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    uptimeSeconds: Math.round(uptime()),
    appVersion,
    electronVersion: process.versions.electron ?? '',
    chromeVersion: process.versions.chrome ?? '',
    nodeVersion: process.versions.node ?? '',
  };
}

export const win32SystemReportCapability: MorpheusCapability<'system.report'> = {
  actionId: 'system.report',
  platform: 'win32',

  async resolve(
    _params: MorpheusParamsFor<'system.report'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    return {
      target: { kind: 'none' },
      execute: async (): Promise<MorpheusActionResult> => ({
        kind: 'system',
        info: collectMorpheusSystemInfo(context.appVersion),
      }),
    };
  },
};
