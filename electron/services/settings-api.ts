import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import type { GatewayManager } from '../gateway/manager';
import { syncLaunchAtStartupSettingFromStore } from '../main/launch-at-startup';
import { createMenu } from '../main/menu';
import { applyProxySettings } from '../main/proxy';
import { initTelemetry, shutdownTelemetry } from '../utils/telemetry';
import { syncProxyConfigToOpenClaw } from '../utils/openclaw-proxy';
import {
  type AppSettings,
  getAllSettings,
  getSetting,
  resetSettings,
  setSetting,
} from '../utils/store';
import { isRecord } from './payload-utils';
import { isMorpheusAppearance, normalizeMorpheusAppearance, type MorpheusAppearance } from '../../shared/morpheus/appearance-types';

type KeyPayload = {
  key?: unknown;
};

type SetPayload = KeyPayload & {
  value?: unknown;
};

type SetManyPayload = {
  patch?: unknown;
};

const PROXY_SETTING_KEYS = new Set<keyof AppSettings>([
  'proxyEnabled',
  'proxyServer',
  'proxyHttpServer',
  'proxyHttpsServer',
  'proxyAllServer',
  'proxyBypassRules',
]);

async function validateSettingKey(key: unknown): Promise<boolean> {
  if (typeof key !== 'string' || key.length === 0) return false;
  const settings = await getAllSettings();
  return Object.prototype.hasOwnProperty.call(settings, key);
}

async function requireSettingKey(payload: unknown): Promise<keyof AppSettings> {
  const key = (payload as KeyPayload | undefined)?.key;
  if (!await validateSettingKey(key)) {
    throw new Error('Invalid settings key');
  }
  return key as keyof AppSettings;
}

async function requireSettingsPatch(payload: unknown): Promise<Partial<AppSettings>> {
  const patch = (payload as SetManyPayload | undefined)?.patch;
  if (!isRecord(patch)) {
    throw new Error('Invalid settings patch');
  }
  const entries = Object.entries(patch);
  for (const [key, value] of entries) {
    if (!await validateSettingKey(key)) {
      throw new Error('Invalid settings key');
    }
    requireSettingValue(key, value);
  }
  return Object.fromEntries(entries) as Partial<AppSettings>;
}

function requireSettingValue(key: string, value: unknown): void {
  if (key === 'morpheusAppearance' && !isMorpheusAppearance(value)) {
    throw new Error('Invalid Morpheus appearance');
  }
}

function patchTouchesProxy(patch: Partial<AppSettings>): boolean {
  return Object.keys(patch).some((key) => PROXY_SETTING_KEYS.has(key as keyof AppSettings));
}

function patchTouchesLaunchAtStartup(patch: Partial<AppSettings>): boolean {
  return Object.prototype.hasOwnProperty.call(patch, 'launchAtStartup');
}

function patchTouchesLanguage(patch: Partial<AppSettings>): boolean {
  return Object.prototype.hasOwnProperty.call(patch, 'language');
}

async function handleProxySettingsChange(gatewayManager: GatewayManager): Promise<void> {
  const settings = await getAllSettings();
  await syncProxyConfigToOpenClaw(settings, { preserveExistingWhenDisabled: false });
  await applyProxySettings(settings);
  if (gatewayManager.getStatus().state === 'running') {
    await gatewayManager.restart();
  }
}

async function runSettingsSideEffects(
  gatewayManager: GatewayManager,
  patch: Partial<AppSettings>,
): Promise<void> {
  if (patchTouchesProxy(patch)) {
    await handleProxySettingsChange(gatewayManager);
  }
  if (patchTouchesLaunchAtStartup(patch)) {
    await syncLaunchAtStartupSettingFromStore();
  }
  if (patchTouchesLanguage(patch)) {
    await createMenu(typeof patch.language === 'string' ? patch.language : undefined);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'telemetryEnabled')) {
    if (patch.telemetryEnabled) await initTelemetry();
    else await shutdownTelemetry();
  }
}

export function createSettingsApi(
  gatewayManager: GatewayManager,
  appearanceChanged?: (appearance: MorpheusAppearance) => void,
): CompleteHostServiceRegistry['settings'] {
  return {
    getAll: () => getAllSettings(),
    get: async (payload) => {
      const key = await requireSettingKey(payload);
      return getSetting(key as never);
    },
    set: async (payload) => {
      const body = payload as SetPayload | undefined;
      const key = await requireSettingKey(body);
      requireSettingValue(key, body?.value);
      await setSetting(key as never, body?.value as never);
      if (key === 'morpheusAppearance') appearanceChanged?.(normalizeMorpheusAppearance(body?.value));
      await runSettingsSideEffects(gatewayManager, { [key]: body?.value } as Partial<AppSettings>);
      return { success: true };
    },
    setMany: async (payload) => {
      const patch = await requireSettingsPatch(payload);
      const entries = Object.entries(patch) as Array<[keyof AppSettings, AppSettings[keyof AppSettings]]>;
      for (const [key, value] of entries) {
        await setSetting(key, value as never);
        if (key === 'morpheusAppearance') appearanceChanged?.(normalizeMorpheusAppearance(value));
      }
      await runSettingsSideEffects(gatewayManager, patch);
      return { success: true };
    },
    reset: async () => {
      await resetSettings();
      await handleProxySettingsChange(gatewayManager);
      await syncLaunchAtStartupSettingFromStore();
      const settings = await getAllSettings();
      appearanceChanged?.(normalizeMorpheusAppearance(settings.morpheusAppearance));
      await createMenu(settings.language);
      return { success: true, settings };
    },
  };
}
