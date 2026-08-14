/** Windows-native Morpheus tray controls backed by real Main-owned state. */
import {
  Tray,
  Menu,
  BrowserWindow,
  app,
  nativeImage,
  type MenuItemConstructorOptions,
} from 'electron';
import { join } from 'node:path';

import type { GatewayStatus } from '../gateway/manager';
import type { MorpheusDesktopControls } from './ipc-handlers';
import type { PermissionProfile } from '@shared/morpheus/permission-types';

export type MorpheusTrayOptions = {
  getGatewayStatus(): GatewayStatus;
  controls: MorpheusDesktopControls;
  showQuickCommand(): void;
  showVoiceCommand(): void;
};

let tray: Tray | null = null;
let activeWindow: BrowserWindow | null = null;
let activeOptions: MorpheusTrayOptions | null = null;

function getIconsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icons')
    : join(__dirname, '../../resources/icons');
}

function showWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
}

function showRoute(mainWindow: BrowserWindow, route: string): void {
  showWindow(mainWindow);
  mainWindow.webContents.send('navigate', route);
}

function gatewayLabel(status: GatewayStatus): string {
  if (status.state === 'running' && status.gatewayReady !== false) return 'OpenClaw runtime · Ready';
  if (status.state === 'running') return 'OpenClaw runtime · Starting';
  if (status.state === 'starting' || status.state === 'reconnecting') return 'OpenClaw runtime · Starting';
  if (status.state === 'error') return 'OpenClaw runtime · Error';
  return 'OpenClaw runtime · Stopped';
}

function profileLabel(profile: PermissionProfile): string {
  return profile[0].toUpperCase() + profile.slice(1);
}

function runAndRefresh(operation: () => Promise<unknown>): void {
  void operation()
    .catch((error) => console.error('[Morpheus] Tray action failed', error))
    .finally(() => refreshTray());
}

export function buildTrayMenuTemplate(
  mainWindow: BrowserWindow,
  options: MorpheusTrayOptions,
): MenuItemConstructorOptions[] {
  const gateway = options.getGatewayStatus();
  const runtime = options.controls.runtimeControl();
  const profile = options.controls.permissionProfile();
  const voice = options.controls.voicePresence();
  const profiles: PermissionProfile[] = ['strict', 'balanced', 'autonomous'];

  return [
    {
      label: 'Show Morpheus',
      click: () => showRoute(mainWindow, '/'),
    },
    {
      label: 'Quick Command',
      accelerator: 'CommandOrControl+Shift+Space',
      click: () => {
        showWindow(mainWindow);
        options.showQuickCommand();
      },
    },
    {
      label: 'Voice Command',
      accelerator: 'CommandOrControl+Alt+Space',
      click: () => {
        showWindow(mainWindow);
        options.showVoiceCommand();
      },
    },
    {
      label: voice.ambientEnabled
        ? `Ambient voice · ${voice.state[0].toUpperCase()}${voice.state.slice(1)}`
        : 'Ambient voice · Off',
      type: 'checkbox',
      checked: voice.ambientEnabled,
      click: () => runAndRefresh(() => options.controls.setAmbientVoiceEnabled(!voice.ambientEnabled)),
    },
    { type: 'separator' },
    {
      label: gatewayLabel(gateway),
      enabled: false,
    },
    {
      label: 'Pause new Morpheus work',
      type: 'checkbox',
      checked: runtime.paused,
      click: () => runAndRefresh(() => options.controls.setRuntimePaused(!runtime.paused)),
    },
    {
      label: `Permission profile · ${profileLabel(profile)}`,
      submenu: profiles.map((candidate) => ({
        label: profileLabel(candidate),
        type: 'radio' as const,
        checked: candidate === profile,
        click: () => runAndRefresh(() => options.controls.setPermissionProfile(candidate)),
      })),
    },
    { type: 'separator' },
    {
      label: 'Command Center',
      click: () => showRoute(mainWindow, '/'),
    },
    {
      label: 'Chat',
      click: () => showRoute(mainWindow, '/chat'),
    },
    {
      label: 'Settings',
      click: () => showRoute(mainWindow, '/settings'),
    },
    { type: 'separator' },
    {
      label: 'Quit Morpheus',
      click: () => app.quit(),
    },
  ];
}

export function refreshTray(): void {
  if (!tray || !activeWindow || activeWindow.isDestroyed() || !activeOptions) return;
  const gateway = activeOptions.getGatewayStatus();
  const runtime = activeOptions.controls.runtimeControl();
  const profile = activeOptions.controls.permissionProfile();
  const voice = activeOptions.controls.voicePresence();
  const state = runtime.paused
    ? 'New work paused'
    : gateway.state === 'running' && gateway.gatewayReady !== false
      ? 'Ready'
      : 'Starting';
  const voiceLabel = voice.ambientEnabled ? `Voice ${voice.state}` : 'Voice asleep';
  tray.setToolTip(`Morpheus · ${state} · ${voiceLabel} · ${profileLabel(profile)}`);
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(activeWindow, activeOptions)));
}

export function createTray(mainWindow: BrowserWindow, options: MorpheusTrayOptions): Tray {
  const iconsDir = getIconsDir();
  const platformIcon = process.platform === 'win32'
    ? 'icon.ico'
    : process.platform === 'darwin'
      ? 'tray-icon-Template.png'
      : '32x32.png';
  let icon = nativeImage.createFromPath(join(iconsDir, platformIcon));
  if (icon.isEmpty()) icon = nativeImage.createFromPath(join(iconsDir, 'icon.png'));
  if (process.platform === 'darwin') icon.setTemplateImage(true);

  activeWindow = mainWindow;
  activeOptions = options;
  tray = new Tray(icon);
  refreshTray();

  tray.on('click', () => {
    if (mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else showWindow(mainWindow);
  });
  tray.on('double-click', () => showWindow(mainWindow));
  tray.on('right-click', () => refreshTray());
  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
  activeWindow = null;
  activeOptions = null;
}
