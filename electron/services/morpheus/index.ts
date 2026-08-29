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
import type { MorpheusObjectiveEvent } from '@shared/morpheus/core/objective-types';
import type { MorpheusVoicePresence } from '@shared/morpheus/voice-types';

import { createMorpheusAuditSink, type MorpheusAuditSink } from './audit';
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
import { win32VerifySiteCapability } from './capabilities/win32/verify-site';
import { createWin32ScheduleReminderCapability } from './capabilities/win32/schedule-reminder';
import { createMorpheusAgentProfileStore, type MorpheusAgentProfileStore } from './agents/profile-store';
import { createMorpheusWorkflowStore, type MorpheusWorkflowStore } from './workflows/workflow-store';
import { createMorpheusWorkflowService, type MorpheusWorkflowService } from './workflows/workflow-service';
import { createMorpheusScheduleStore, type MorpheusScheduleStore } from './schedules/schedule-store';
import { createMorpheusScheduler, type MorpheusScheduler } from './schedules/scheduler';
import { createMorpheusObjectiveStore, type MorpheusObjectiveStore } from './core/objective-store';
import {
  createMorpheusObjectiveOrchestrator,
  type MorpheusObjectiveOrchestrator,
} from './core/objective-orchestrator';
import { createMorpheusPlannerSelector } from './planning/planner-selector';
import { getProviderService, type ProviderService } from '../providers/provider-service';
import { createMorpheusVoiceService, type MorpheusVoiceService } from './voice/voice-service';
import {
  createMorpheusWorkspaceStore,
  type MorpheusWorkspaceStore,
} from './workspaces/workspace-store';
import {
  createMorpheusRuntimeControl,
  type MorpheusRuntimeControlService,
} from './runtime-control';
import { createMorpheusMissionStore, type MorpheusMissionStore } from './missions/mission-store';
import { createMorpheusProjectStore, type MorpheusProjectStore } from './projects/project-store';
import { createMorpheusMemoryStore, type MorpheusMemoryStore } from './memory/memory-store';
import { createMorpheusOnboardingStore, type MorpheusOnboardingStore } from './onboarding/onboarding-store';
import { createMorpheusGoalStore, type MorpheusGoalStore } from './goals/goal-store';
import { createMorpheusGoalService, type MorpheusGoalService } from './goals/goal-service';
import { createMorpheusProactiveStore, type MorpheusProactiveStore } from './proactive/proactive-store';
import { createMorpheusProactiveService, type MorpheusProactiveService } from './proactive/proactive-service';
import { createMorpheusSystemStore, type MorpheusSystemStore } from './systems/system-store';
import { createMorpheusSystemService, type MorpheusSystemService } from './systems/system-service';

export type CreateMorpheusServiceOptions = {
  userDataDir: string;
  appVersion: string;
  emit: (event: MorpheusActionEvent) => void;
  /** Delivers the one batched consent request a plan may raise. */
  emitPlanConsent?: (event: MorpheusPlanConsentEvent) => void;
  emitObjective?: (event: MorpheusObjectiveEvent) => void;
  emitVoicePresence?: (presence: MorpheusVoicePresence) => void;
  providerService?: ProviderService;
};

export type MorpheusService = {
  runtime: MorpheusRuntime;
  grants: MorpheusGrantStore;
  agentProfiles: MorpheusAgentProfileStore;
  workflowStore: MorpheusWorkflowStore;
  workflows: MorpheusWorkflowService;
  scheduleStore: MorpheusScheduleStore;
  scheduler: MorpheusScheduler;
  objectiveStore: MorpheusObjectiveStore;
  objectives: MorpheusObjectiveOrchestrator;
  missions: MorpheusMissionStore;
  projects: MorpheusProjectStore;
  memory: MorpheusMemoryStore;
  onboarding: MorpheusOnboardingStore;
  goalStore: MorpheusGoalStore;
  goals: MorpheusGoalService;
  proactiveStore: MorpheusProactiveStore;
  proactive: MorpheusProactiveService;
  systemStore: MorpheusSystemStore;
  systems: MorpheusSystemService;
  voice: MorpheusVoiceService;
  workspaces: MorpheusWorkspaceStore;
  audit: MorpheusAuditSink;
  runtimeControl: MorpheusRuntimeControlService;
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
  registry.register(win32VerifySiteCapability);
  registry.register(win32LaunchProjectCapability);

  const workspaces = createMorpheusWorkspaceStore({ userDataDir: options.userDataDir });
  const roots = createMorpheusRootProvider({
    userDataDir: options.userDataDir,
    workspaces,
  });
  const audit = createMorpheusAuditSink({
    auditDir: join(options.userDataDir, 'morpheus', 'audit'),
  });
  const runtimeControl = createMorpheusRuntimeControl({
    userDataDir: options.userDataDir,
    audit,
    appVersion: options.appVersion,
  });

  const grants = createMorpheusGrantStore({ userDataDir: options.userDataDir });
  const engine = createMorpheusPolicyEngine(grants);
  const gate = createPolicyPermissionGate(engine, grants);

  // Audit health is observed, not assumed: a sink that starts failing must move
  // the product into degraded-security mode rather than continuing silently.
  const auditHealth = (): AuditHealth => (audit.isHealthy() ? 'healthy' : 'degraded');

  let objectives: MorpheusObjectiveOrchestrator | undefined;
  const runtime = createMorpheusRuntime({
    registry,
    roots,
    workspaces,
    audit,
    gate,
    grants,
    auditHealth,
    appVersion: options.appVersion,
    emit: options.emit,
    onPlanLifecycle: (event) => objectives?.onPlanLifecycle(event),

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
  const filesRoot = workspaces.resolveRoot();
  const projects = createMorpheusProjectStore({ userDataDir: options.userDataDir });
  const memory = createMorpheusMemoryStore({ userDataDir: options.userDataDir });
  const missions = createMorpheusMissionStore({ userDataDir: options.userDataDir });
  const onboarding = createMorpheusOnboardingStore({ userDataDir: options.userDataDir });
  const goalStore = createMorpheusGoalStore({ userDataDir: options.userDataDir });
  const objectiveStore = createMorpheusObjectiveStore({ userDataDir: options.userDataDir });
  missions.reconcile(objectiveStore.snapshot());
  const providerService = options.providerService ?? getProviderService();
  const plannerSelector = createMorpheusPlannerSelector({
    providerService,
  });
  const voice = createMorpheusVoiceService({
    userDataDir: options.userDataDir,
    providerService,
    audit,
    appVersion: options.appVersion,
    getPersonality: () => onboarding.status().preferences.personality,
    emitPresence: options.emitVoicePresence,
  });
  objectives = createMorpheusObjectiveOrchestrator({
    store: objectiveStore,
    runtime,
    agents: agentProfiles,
    planners: plannerSelector,
    audit,
    appVersion: options.appVersion,
    workspaces,
    missions,
    projects,
    memory,
    projectGoal: async (run) => {
      if (!run.goalId) return;
      await audit.recordControl({
        category: 'goal', event: 'objective-state-projected', subjectId: run.goalId,
        details: { objectiveRunId: run.objectiveRunId, state: run.state }, appVersion: options.appVersion,
      });
      goalStore.projectObjective(run);
    },
    isRuntimePaused: () => runtimeControl.snapshot().paused,
    emit: (event) => {
      // Objective transitions have already been audit-persisted here. Voice
      // presence is only a truthful projection of that state, never authority.
      voice.observeObjective(event);
      options.emitObjective?.(event);
    },
  });
  const workflowStore = createMorpheusWorkflowStore({ userDataDir: options.userDataDir });
  const workflows = createMorpheusWorkflowService({
    store: workflowStore,
    profiles: agentProfiles,
    workspaces,
  });
  const scheduleStore = createMorpheusScheduleStore({ userDataDir: options.userDataDir });
  const scheduler = createMorpheusScheduler({
    store: scheduleStore,
    workflows,
    objectives,
    recordActivity: (event, subjectId, details) => audit.recordControl({
      category: 'schedule', event, subjectId, details, appVersion: options.appVersion,
    }),
    isRuntimePaused: () => runtimeControl.snapshot().paused,
  });
  // This capability depends on the Morpheus-owned scheduler, so registration
  // happens only after the service exists. Runtime holds the registry by
  // reference and no external caller can execute before composition returns.
  registry.register(createWin32ScheduleReminderCapability({ scheduler }));
  const goals = createMorpheusGoalService({
    store: goalStore, objectives, projects, workspaces, agents: agentProfiles,
    audit, appVersion: options.appVersion,
  });
  const proactiveStore = createMorpheusProactiveStore({ userDataDir: options.userDataDir });
  const proactive = createMorpheusProactiveService({
    store: proactiveStore, missions, goals: goalStore, schedules: scheduleStore,
    objectives, audit, appVersion: options.appVersion,
  });
  const systemStore = createMorpheusSystemStore({ userDataDir: options.userDataDir });
  const systems = createMorpheusSystemService({
    store: systemStore, workflows, agents: agentProfiles, workspaces, projects,
    schedules: scheduleStore, scheduler, objectives, missions, audit,
    auditHealth, appVersion: options.appVersion,
  });

  return {
    runtime,
    grants,
    agentProfiles,
    workflowStore,
    workflows,
    scheduleStore,
    scheduler,
    objectiveStore,
    objectives,
    missions,
    projects,
    memory,
    onboarding,
    goalStore,
    goals,
    proactiveStore,
    proactive,
    systemStore,
    systems,
    voice,
    workspaces,
    audit,
    runtimeControl,
    filesRoot,
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
export type { MorpheusObjectiveStore } from './core/objective-store';
export type { MorpheusObjectiveOrchestrator } from './core/objective-orchestrator';
export type { MorpheusMissionStore } from './missions/mission-store';
export type { MorpheusProjectStore } from './projects/project-store';
export type { MorpheusMemoryStore } from './memory/memory-store';
export type { MorpheusOnboardingStore } from './onboarding/onboarding-store';
export type { MorpheusGoalStore } from './goals/goal-store';
export type { MorpheusGoalService } from './goals/goal-service';
export type { MorpheusProactiveStore } from './proactive/proactive-store';
export type { MorpheusProactiveService } from './proactive/proactive-service';
export type { MorpheusSystemStore } from './systems/system-store';
export type { MorpheusSystemService } from './systems/system-service';
export type { MorpheusVoiceService } from './voice/voice-service';
export type { MorpheusWorkspaceStore } from './workspaces/workspace-store';
export type { MorpheusRuntimeControlService } from './runtime-control';
