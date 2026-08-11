import { join } from 'node:path';

import {
  MORPHEUS_RUNTIME_CONTROL_VERSION,
  type MorpheusRuntimeControlSnapshot,
} from '@shared/morpheus/runtime-control-types';

import type { MorpheusAuditSink } from './audit';
import { readValidatedJson, writeJsonAtomically } from './storage/atomic-json';

export interface MorpheusRuntimeControlService {
  snapshot(): MorpheusRuntimeControlSnapshot;
  setPaused(paused: boolean, source: 'settings' | 'tray'): Promise<MorpheusRuntimeControlSnapshot>;
}

function validateSnapshot(value: unknown): MorpheusRuntimeControlSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return record.v === MORPHEUS_RUNTIME_CONTROL_VERSION
    && typeof record.paused === 'boolean'
    && typeof record.updatedAt === 'string'
    && Number.isFinite(Date.parse(record.updatedAt))
    ? value as MorpheusRuntimeControlSnapshot
    : null;
}

export function createMorpheusRuntimeControl(options: {
  userDataDir: string;
  audit: MorpheusAuditSink;
  appVersion: string;
  now?: () => Date;
}): MorpheusRuntimeControlService {
  const now = options.now ?? (() => new Date());
  const file = join(options.userDataDir, 'morpheus', 'runtime-control.json');
  let state: MorpheusRuntimeControlSnapshot = readValidatedJson(file, validateSnapshot) ?? {
    v: MORPHEUS_RUNTIME_CONTROL_VERSION,
    paused: false,
    updatedAt: now().toISOString(),
  };

  return {
    snapshot: () => structuredClone(state),
    async setPaused(paused, source) {
      if (state.paused === paused) return structuredClone(state);
      await options.audit.recordControl({
        category: 'runtime',
        event: paused ? 'paused' : 'resumed',
        details: { paused, source },
        appVersion: options.appVersion,
      });
      state = {
        v: MORPHEUS_RUNTIME_CONTROL_VERSION,
        paused,
        updatedAt: now().toISOString(),
      };
      writeJsonAtomically(file, state);
      return structuredClone(state);
    },
  };
}
