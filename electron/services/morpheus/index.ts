/**
 * Composition root for the Morpheus native action framework.
 *
 * Registering a capability here is the only wiring step needed to ship a new
 * action or a new platform. See
 * `harness/reference/morpheus-execution-architecture.md`.
 */
import { join } from 'node:path';

import type { MorpheusActionEvent } from '@shared/morpheus/action-types';

import { createMorpheusAuditSink } from './audit';
import { createMorpheusCapabilityRegistry } from './capability-registry';
import { createAlwaysPromptPermissionGate } from './permission-gate';
import { createMorpheusRootProvider } from './roots';
import { createMorpheusRuntime, type MorpheusRuntime } from './runtime';
import { win32AppLaunchCapability } from './capabilities/win32/app-launch';
import { win32CreateTextFileCapability } from './capabilities/win32/create-text-file';
import { win32SystemReportCapability } from './capabilities/win32/system-report';

export type CreateMorpheusServiceOptions = {
  userDataDir: string;
  appVersion: string;
  emit: (event: MorpheusActionEvent) => void;
};

export function createMorpheusService(options: CreateMorpheusServiceOptions): MorpheusRuntime {
  const registry = createMorpheusCapabilityRegistry();
  registry.register(win32AppLaunchCapability);
  registry.register(win32CreateTextFileCapability);
  registry.register(win32SystemReportCapability);

  const roots = createMorpheusRootProvider({ userDataDir: options.userDataDir });
  const audit = createMorpheusAuditSink({
    auditDir: join(options.userDataDir, 'morpheus', 'audit'),
  });

  return createMorpheusRuntime({
    registry,
    roots,
    audit,
    gate: createAlwaysPromptPermissionGate(),
    appVersion: options.appVersion,
    emit: options.emit,
  });
}

export type { MorpheusRuntime } from './runtime';
