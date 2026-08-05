/**
 * Maps an action id and a platform to a concrete capability implementation.
 *
 * Resolution returning `undefined` is a normal typed outcome, surfaced as the
 * `unsupported-platform` phase, never an exception. That is what makes future
 * Linux and macOS support purely additive: new capability modules register here
 * and nothing in the runtime, contract, audit or interface changes.
 */
import type {
  MorpheusActionId,
  MorpheusPlatform,
} from '@shared/morpheus/actions/registry';
import type {
  MorpheusActionParams,
  MorpheusActionResult,
  MorpheusFailureCode,
  MorpheusResolvedTarget,
} from '@shared/morpheus/action-types';

import type { MorpheusRootProvider } from './roots';

export class MorpheusCapabilityError extends Error {
  constructor(public readonly code: MorpheusFailureCode, message: string) {
    super(message);
    this.name = 'MorpheusCapabilityError';
  }
}

export type MorpheusCapabilityContext = {
  roots: MorpheusRootProvider;
  appVersion: string;
  env: NodeJS.ProcessEnv;
};

/**
 * The two-phase shape is the whole point of the design: `resolve` produces the
 * concrete target *before* the user is asked, so the confirmation names what
 * Main will actually do rather than what the Renderer asked for. `execute` is
 * reachable only after an explicit grant.
 */
export type MorpheusResolution = {
  target: MorpheusResolvedTarget;
  execute: () => Promise<MorpheusActionResult>;
};

export interface MorpheusCapability {
  readonly actionId: MorpheusActionId;
  readonly platform: MorpheusPlatform;
  resolve(params: MorpheusActionParams, context: MorpheusCapabilityContext): Promise<MorpheusResolution>;
}

export interface MorpheusCapabilityRegistry {
  register(capability: MorpheusCapability): void;
  resolve(actionId: MorpheusActionId, platform: string): MorpheusCapability | undefined;
  supportedActions(platform: string): MorpheusActionId[];
}

/**
 * Composite map key for (actionId, platform).
 *
 * Serialised as a JSON pair rather than joined by a delimiter: any single
 * separator can be ambiguous when it also occurs inside one of the parts
 * (`a` + `b::c` and `a::b` + `c` would otherwise collide onto one entry and
 * silently resolve the wrong capability). JSON encoding is injective and keeps
 * the key plain text.
 */
function key(actionId: string, platform: string): string {
  return JSON.stringify([actionId, platform]);
}

export function createMorpheusCapabilityRegistry(): MorpheusCapabilityRegistry {
  const capabilities = new Map<string, MorpheusCapability>();

  return {
    register(capability: MorpheusCapability): void {
      const mapKey = key(capability.actionId, capability.platform);
      if (capabilities.has(mapKey)) {
        throw new Error(`Morpheus capability already registered: ${capability.actionId} on ${capability.platform}`);
      }
      capabilities.set(mapKey, capability);
    },

    resolve(actionId: MorpheusActionId, platform: string): MorpheusCapability | undefined {
      return capabilities.get(key(actionId, platform));
    },

    supportedActions(platform: string): MorpheusActionId[] {
      const out: MorpheusActionId[] = [];
      for (const capability of capabilities.values()) {
        if (capability.platform === platform) out.push(capability.actionId);
      }
      return out;
    },
  };
}
