/**
 * Composition root for the Morpheus native action framework.
 *
 * Registering a capability here is the only wiring step needed to ship a new
 * action or a new platform. See
 * `harness/reference/morpheus-execution-architecture.md`.
 */
import { join } from 'node:path';

import type { MorpheusActionEvent } from '@shared/morpheus/action-types';
import type { MorpheusPlanConsentEvent } from '@shared/host-events/contract';

import { createMorpheusAuditSink } from './audit';
import { createMorpheusCapabilityRegistry } from './capability-registry';
import { createMorpheusGrantStore, type MorpheusGrantStore } from './policy/grant-store';
import { createPolicyPermissionGate } from './policy/permission-gate';
import { createMorpheusPolicyEngine, type AuditHealth } from './policy/policy-engine';
import { createMorpheusRootProvider } from './roots';
import { createMorpheusRuntime, type MorpheusRuntime } from './runtime';
import { win32AppLaunchCapability } from './capabilities/win32/app-launch';
import { win32CreateTextFileCapability } from './capabilities/win32/create-text-file';
import { win32FilesystemCapabilities } from './capabilities/win32/filesystem';
import {
  win32ClipboardReadCapability,
  win32ClipboardWriteCapability,
} from './capabilities/win32/clipboard';
import { win32NotifyCapability } from './capabilities/win32/notify';
import { win32ScreenCaptureCapability } from './capabilities/win32/screen-capture';
import { win32SystemReportCapability } from './capabilities/win32/system-report';
import { win32SystemStorageCapability } from './capabilities/win32/system-storage';
import { win32SystemProcessesCapability } from './capabilities/win32/system-processes';
import { win32OpenUrlCapability } from './capabilities/win32/open-url';
import { win32LaunchProjectCapability } from './capabilities/win32/launch-project';
import { createMorpheusAgentProfileStore, type MorpheusAgentProfileStore } from './agents/profile-store';
import { createMorpheusWorkflowStore, type MorpheusWorkflowStore } from './workflows/workflow-store';
import { createMorpheusWorkflowService, type MorpheusWorkflowService } from './workflows/workflow-service';
import { createMorpheusScheduleStore, type MorpheusScheduleStore } from './schedules/schedule-store';
import { createMorpheusScheduler, type MorpheusScheduler } from './schedules/scheduler';

export type CreateMorpheusServiceOptions = {
  userDataDir: string;
  appVersion: string;
  emit: (event: MorpheusActionEvent) => void;
  /** Delivers the one batched consent request a plan may raise. */
  emitPlanConsent?: (event: MorpheusPlanConsentEvent) => void;
};

export type MorpheusService = {
  runtime: MorpheusRuntime;
  grants: MorpheusGrantStore;
  agentProfiles: MorpheusAgentProfileStore;
  workflowStore: MorpheusWorkflowStore;
  workflows: MorpheusWorkflowService;
  scheduleStore: MorpheusScheduleStore;
  scheduler: MorpheusScheduler;
  /** Current approved files root, for the Command Center's artifacts panel. */
  filesRoot: string;
  auditHealth: () => AuditHealth;
};

export function createMorpheusService(options: CreateMorpheusServiceOptions): MorpheusService {
  const registry = createMorpheusCapabilityRegistry();
  registry.register(win32AppLaunchCapability);
  registry.register(win32CreateTextFileCapability);
  registry.register(win32SystemReportCapability);
  for (const capability of win32FilesystemCapabilities) registry.register(capability);
  registry.register(win32ClipboardReadCapability);
  registry.register(win32ClipboardWriteCapability);
  registry.register(win32NotifyCapability);
  registry.register(win32ScreenCaptureCapability);
  registry.register(win32SystemStorageCapability);
  registry.register(win32SystemProcessesCapability);
  registry.register(win32OpenUrlCapability);
  registry.register(win32LaunchProjectCapability);

  const roots = createMorpheusRootProvider({ userDataDir: options.userDataDir });
  const audit = createMorpheusAuditSink({
    auditDir: join(options.userDataDir, 'morpheus', 'audit'),
  });

  const grants = createMorpheusGrantStore({ userDataDir: options.userDataDir });
  const engine = createMorpheusPolicyEngine(grants);
  const gate = createPolicyPermissionGate(engine, grants);

  // Audit health is observed, not assumed: a sink that starts failing must move
  // the product into degraded-security mode rather than continuing silently.
  const auditHealth = (): AuditHealth => (audit.isHealthy() ? 'healthy' : 'degraded');

  const runtime = createMorpheusRuntime({
    registry,
    roots,
    audit,
    gate,
    grants,
    auditHealth,
    appVersion: options.appVersion,
    emit: options.emit,

    /**
     * Flattens the plan's trust boundaries into wire shape.
     *
     * Only the fields the user must SEE to decide cross the boundary. The
     * internal `PermissionScope` is not sent: the renderer answers with a
     * boundary id, and Main re-derives the scope from the request it issued —
     * so a response can never widen the scope it applies to.
     */
    emitPlanConsent: (request) => options.emitPlanConsent?.({
      planId: request.planId,
      objective: request.objective,
      boundaries: request.boundaries.map((boundary) => ({
        boundaryId: boundary.boundaryId,
        capabilityId: boundary.scope.capabilityId,
        capabilityGroup: boundary.scope.capabilityGroup,
        resourceScope: boundary.scope.resourceScope,
        riskTier: boundary.scope.riskTier,
        stepIds: boundary.stepIds,
        targets: boundary.targets,
        mandatoryConfirmation: boundary.mandatoryConfirmation,
      })),
    }),
  });

  const agentProfiles = createMorpheusAgentProfileStore({ userDataDir: options.userDataDir });
  const workflowStore = createMorpheusWorkflowStore({ userDataDir: options.userDataDir });
  const workflows = createMorpheusWorkflowService({
    store: workflowStore,
    profiles: agentProfiles,
    runtime,
    filesRoot: roots.resolve('morpheusFiles'),
  });
  const scheduleStore = createMorpheusScheduleStore({ userDataDir: options.userDataDir });
  const scheduler = createMorpheusScheduler({ store: scheduleStore, workflows, runtime });

  return {
    runtime,
    grants,
    agentProfiles,
    workflowStore,
    workflows,
    scheduleStore,
    scheduler,
    filesRoot: roots.resolve('morpheusFiles'),
    auditHealth,
  };
}

export type { MorpheusRuntime } from './runtime';
export type { MorpheusGrantStore } from './policy/grant-store';
export type { MorpheusAgentProfileStore } from './agents/profile-store';
export type { MorpheusWorkflowStore } from './workflows/workflow-store';
export type { MorpheusWorkflowService } from './workflows/workflow-service';
export type { MorpheusScheduleStore } from './schedules/schedule-store';
export type { MorpheusScheduler } from './schedules/scheduler';
