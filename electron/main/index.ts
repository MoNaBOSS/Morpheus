/**
 * Electron Main Process Entry
 * Manages window creation, system tray, and IPC handlers
 */
import { app, BrowserWindow, globalShortcut, nativeImage, screen, session, shell, type Session } from 'electron';
import { join } from 'path';
import { pathToFileURL } from 'node:url';
import { GatewayManager } from '../gateway/manager';
import { registerOpenClawConfigCoordinator } from '../gateway/config-delivery';
import { registerIpcHandlers } from './ipc-handlers';
import { HostApiRegistry } from './ipc/host-invoke';
import { createTray, refreshTray } from './tray';
import { createMenu } from './menu';
import { registerZoomShortcuts } from './zoom-shortcuts';

import { appUpdater, registerUpdateHandlers } from './updater';
import { logger } from '../utils/logger';
import { warmupNetworkOptimization } from '../utils/uv-env';
import { initTelemetry } from '../utils/telemetry';

import { ClawHubService } from '../gateway/clawhub';
import { extensionRegistry } from '../extensions/registry';
import { loadExtensionsFromManifest } from '../extensions/loader';
import { registerAllBuiltinExtensions } from '../extensions/builtin';
import { loadExternalMainExtensions } from '../extensions/_ext-bridge.generated';
import {
  ensureClawXContext,
  ensureClawXDefaultIdentity,
  repairClawXOnlyBootstrapFiles,
} from '../utils/openclaw-workspace';
import { autoInstallCliIfNeeded, generateCompletionCache, installCompletionToProfile } from '../utils/openclaw-cli';
import { isQuitting, setQuitting } from './app-state';
import { getMacTrafficLightPosition, syncMacTrafficLightPosition } from './traffic-light-layout';
import { getSetting } from '../utils/store';
import { applyProxySettings } from './proxy';
import { syncLaunchAtStartupSettingFromStore } from './launch-at-startup';
import { WebBrowserGuestRegistry, installWebBrowserGuestPolicy } from './web-browser-policy';
import { configureWebBrowserSession } from './web-browser-session';
import {
  clearPendingSecondInstanceFocus,
  consumeMainWindowReady,
  createMainWindowFocusState,
  requestSecondInstanceFocus,
} from './main-window-focus';
import {
  createQuitLifecycleState,
  markQuitCleanupCompleted,
  requestQuitLifecycleAction,
} from './quit-lifecycle';
import { createSignalQuitHandler } from './signal-quit';
import { acquireProcessInstanceFileLock } from './process-instance-lock';
import { readCliIntegrationState } from './cli-integration-consent';
import { migrateClawXProfile, resolveLegacyClawXUserData } from '../services/morpheus/migration';
import { ensureBuiltinSkillsInstalled, ensurePreinstalledSkillsInstalled, trimBundledOpenClawSkillsAndConfigs } from '../utils/skill-config';

import { deviceOAuthManager } from '../utils/device-oauth';
import { browserOAuthManager } from '../utils/browser-oauth';
import { whatsAppLoginManager } from '../utils/whatsapp-login';
import { syncAllProviderAuthToRuntime } from '../services/providers/provider-runtime-sync';
import { HOST_EVENT_CHANNELS } from '@shared/host-events/contract';
import { createMorpheusQuickCommandRegistration } from './morpheus-quick-command';
import { createMorpheusVoiceCommandRegistration } from './morpheus-voice-command';
import { installMorpheusMediaPermissionPolicy } from './morpheus-media-permissions';
import { classifyMainNavigation } from './navigation-policy';
import { createMorpheusCompanionSurfaceController } from './morpheus-companion-surface';

const WINDOWS_APP_USER_MODEL_ID = 'app.morpheus.desktop';
const isE2EMode = process.env.CLAWX_E2E === '1';
const requestedUserDataDir = process.env.CLAWX_USER_DATA_DIR?.trim();
const requestedRemoteDebuggingPort = process.env.CLAWX_REMOTE_DEBUGGING_PORT?.trim();

if (requestedRemoteDebuggingPort) {
  app.commandLine.appendSwitch('remote-debugging-port', requestedRemoteDebuggingPort);
}

if (isE2EMode && requestedUserDataDir) {
  app.setPath('userData', requestedUserDataDir);
}

// On Linux, set CHROME_DESKTOP so Chromium can find the correct .desktop file.
// On Wayland this maps the running window to morpheus.desktop (→ icon + app grouping);
// on X11 it supplements the StartupWMClass matching.
// Must be called before app.whenReady() / before any window is created.
if (process.platform === 'linux') {
  const linuxApp = app as typeof app & { setDesktopName?: (desktopName: string) => void };
  linuxApp.setDesktopName?.('morpheus.desktop');
}

// Prevent multiple instances of the app from running simultaneously.
// Without this, two instances each spawn their own gateway process on the
// same port, then each treats the other's gateway as "orphaned" and kills
// it — creating an infinite kill/restart loop on Windows.
// The losing process must exit immediately so it never reaches Gateway startup.
const gotElectronLock = isE2EMode ? true : app.requestSingleInstanceLock();
if (!gotElectronLock) {
  console.info('[Morpheus] Another instance already holds the single-instance lock; exiting duplicate process');
  app.exit(0);
}
let releaseProcessInstanceFileLock: () => void = () => {};
let gotFileLock = true;
if (gotElectronLock && !isE2EMode) {
  try {
    const fileLock = acquireProcessInstanceFileLock({
      userDataDir: app.getPath('userData'),
      lockName: 'clawx',
      force: true, // Electron lock already guarantees exclusivity; force-clean orphan/recycled-PID locks
    });
    gotFileLock = fileLock.acquired;
    releaseProcessInstanceFileLock = fileLock.release;
    if (!fileLock.acquired) {
      const ownerDescriptor = fileLock.ownerPid
        ? `${fileLock.ownerFormat ?? 'legacy'} pid=${fileLock.ownerPid}`
        : fileLock.ownerFormat === 'unknown'
          ? 'unknown lock format/content'
          : 'unknown owner';
      console.info(
        `[Morpheus] Another instance already holds process lock (${fileLock.lockPath}, ${ownerDescriptor}); exiting duplicate process`,
      );
      app.exit(0);
    }
  } catch (error) {
    console.warn('[Morpheus] Failed to acquire process instance file lock; continuing with Electron single-instance lock only', error);
  }
}
const gotTheLock = gotElectronLock && gotFileLock;

// Global references
let mainWindow: BrowserWindow | null = null;
let shouldStartHidden = false;
let gatewayManager!: GatewayManager;
let clawHubService!: ClawHubService;
const hostApiRegistry = new HostApiRegistry();
const webBrowserGuestRegistry = new WebBrowserGuestRegistry();
let webBrowserSession!: Session;
const mainWindowFocusState = createMainWindowFocusState();
const quitLifecycleState = createQuitLifecycleState();
const companionSurfaceController = createMorpheusCompanionSurfaceController({
  getWorkArea: (bounds) => screen.getDisplayMatching(bounds).workArea,
});
const quickCommandRegistration = createMorpheusQuickCommandRegistration({
  shortcuts: globalShortcut,
  getMainWindow: () => mainWindow,
  prepareSurface: (window) => {
    companionSurfaceController.show(window, 'global-shortcut');
  },
  emit: (window) => window.webContents.send(
    HOST_EVENT_CHANNELS.morpheus.quickCommand,
    { trigger: 'global-shortcut' },
  ),
});
const voiceCommandRegistration = createMorpheusVoiceCommandRegistration({
  shortcuts: globalShortcut,
  getMainWindow: () => mainWindow,
  prepareSurface: (window) => {
    companionSurfaceController.show(window, 'global-shortcut');
  },
  emit: (window) => window.webContents.send(
    HOST_EVENT_CHANNELS.morpheus.voiceCommand,
    { trigger: 'global-shortcut' },
  ),
});

function sendMainWindowEvent(channel: string, payload: unknown): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

/**
 * Resolve the icons directory path (works in both dev and packaged mode)
 */
function getIconsDir(): string {
  if (app.isPackaged) {
    // Packaged: icons are in extraResources → process.resourcesPath/resources/icons
    return join(process.resourcesPath, 'resources', 'icons');
  }
  // Development: relative to dist-electron/main/
  return join(__dirname, '../../resources/icons');
}

/**
 * Get the app icon for the current platform
 */
function getAppIcon(): Electron.NativeImage | undefined {
  if (process.platform === 'darwin') return undefined; // macOS uses the app bundle icon

  const iconsDir = getIconsDir();
  const iconPath =
    process.platform === 'win32'
      ? join(iconsDir, 'icon.ico')
      : join(iconsDir, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

/**
 * Create the main application window
 */
function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';
  const useCustomTitleBar = isWindows;
  const win = new BrowserWindow({
    title: 'Morpheus',
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true, // Enable <webview> for embedding OpenClaw Control UI
    },
    titleBarStyle: isMac ? 'hiddenInset' : useCustomTitleBar ? 'hidden' : 'default',
    trafficLightPosition: isMac
      ? getMacTrafficLightPosition(false)
      : undefined,
    frame: isMac || !useCustomTitleBar,
    show: false,
  });

  installMorpheusMediaPermissionPolicy({
    targetSession: win.webContents.session,
    getMainWebContents: () => mainWindow?.webContents ?? null,
  });

  installWebBrowserGuestPolicy(win.webContents, {
    browserSession: webBrowserSession,
    registry: webBrowserGuestRegistry,
  });

  registerZoomShortcuts(win);

  // Handle external links — only allow safe protocols to prevent arbitrary
  // command execution via shell.openExternal() (e.g. file://, ms-msdt:, etc.)
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url);
      } else {
        logger.warn(`Blocked openExternal for disallowed protocol: ${parsed.protocol}`);
      }
    } catch {
      logger.warn(`Blocked openExternal for malformed URL: ${url}`);
    }
    return { action: 'deny' };
  });

  const rendererUrls = [
    ...(process.env.VITE_DEV_SERVER_URL ? [process.env.VITE_DEV_SERVER_URL] : []),
    pathToFileURL(join(__dirname, '../../dist/index.html')).toString(),
  ];
  const guardTopLevelNavigation = (event: Electron.Event, url: string): void => {
    const decision = classifyMainNavigation(url, rendererUrls);
    if (decision === 'allow') return;
    event.preventDefault();
    if (decision === 'external') {
      void shell.openExternal(url).catch((error) => {
        logger.warn(`Failed to open external navigation: ${String(error)}`);
      });
      return;
    }
    logger.warn(`Blocked top-level navigation from Morpheus renderer: ${url}`);
  };
  win.webContents.on('will-navigate', guardTopLevelNavigation);
  win.webContents.on('will-redirect', guardTopLevelNavigation);

  return win;
}

/**
 * Whether the Morpheus boot sequence should play for this launch.
 *
 * A normal launch plays it. E2E suppresses it so the ~49 existing specs keep
 * their current first-paint behaviour, unless a spec explicitly opts in with
 * `--morpheus-boot=on` (which reaches process.argv through the Playwright
 * fixture's `additionalArgs`).
 */
function shouldPlayMorpheusBoot(): boolean {
  if (!isE2EMode) return true;
  return process.argv.includes('--morpheus-boot=on');
}

/** Normal launches may show the one-time activation. E2E opts in explicitly. */
function shouldShowMorpheusOnboarding(): boolean {
  if (!isE2EMode) return true;
  return process.argv.includes('--morpheus-onboarding=on');
}

function loadMainWindow(win: BrowserWindow): void {
  const shouldSkipSetupForE2E = process.env.CLAWX_E2E_SKIP_SETUP === '1';
  const morpheusBoot = shouldPlayMorpheusBoot() ? 'on' : 'off';
  const morpheusOnboarding = shouldShowMorpheusOnboarding() ? 'on' : 'off';

  if (process.env.VITE_DEV_SERVER_URL) {
    const rendererUrl = new URL(process.env.VITE_DEV_SERVER_URL);
    if (shouldSkipSetupForE2E) {
      rendererUrl.searchParams.set('e2eSkipSetup', '1');
    }
    rendererUrl.searchParams.set('morpheusBoot', morpheusBoot);
    rendererUrl.searchParams.set('morpheusOnboarding', morpheusOnboarding);
    win.loadURL(rendererUrl.toString());
    if (!isE2EMode) {
      win.webContents.openDevTools();
    }
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'), {
      query: shouldSkipSetupForE2E
        ? { e2eSkipSetup: '1', morpheusBoot, morpheusOnboarding }
        : { morpheusBoot, morpheusOnboarding },
    });
  }
}

function focusWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }

  if (companionSurfaceController.status().mode === 'compact') {
    companionSurfaceController.expand(win);
    return;
  }

  if (win.isMinimized()) {
    win.restore();
  }

  win.show();
  win.focus();
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  clearPendingSecondInstanceFocus(mainWindowFocusState);
  focusWindow(mainWindow);
}

function createMainWindow(): BrowserWindow {
  const win = createWindow();

  win.once('ready-to-show', () => {
    if (mainWindow !== win) {
      return;
    }

    if (process.platform === 'darwin') {
      void getSetting('sidebarCollapsed').then((sidebarCollapsed) => {
        syncMacTrafficLightPosition(win, sidebarCollapsed);
      });
    }

    const action = consumeMainWindowReady(mainWindowFocusState);
    if (action === 'focus') {
      focusWindow(win);
      return;
    }

    if (!shouldStartHidden) win.show();
  });

  win.on('close', (event) => {
    if (!isQuitting() && !isE2EMode) {
      event.preventDefault();
      companionSurfaceController.dismiss(win);
      win.hide();
    }
  });

  win.on('closed', () => {
    companionSurfaceController.reset(win);
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  mainWindow = win;
  return win;
}

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  // Initialize logger first
  logger.init();
  logger.info('=== Morpheus Application Starting ===');

  // Import an existing ClawX profile exactly once. Changing the application id
  // moved userData, so without this an existing user would see an empty
  // profile. The source is only ever read; the marker prevents re-import.
  if (!isE2EMode) {
    try {
      const morpheusUserData = app.getPath('userData');
      const legacyDir = resolveLegacyClawXUserData(morpheusUserData);
      if (legacyDir) {
        const outcome = migrateClawXProfile({
          sourceDir: legacyDir,
          destinationDir: morpheusUserData,
        });
        logger.info(`[Migration] ${outcome.status}`, JSON.stringify(outcome));
      }
    } catch (error) {
      // A failed import must never prevent startup.
      logger.warn('[Migration] Profile import failed; continuing with a fresh profile:', error);
    }
  }
  logger.debug(
    `Runtime: platform=${process.platform}/${process.arch}, electron=${process.versions.electron}, node=${process.versions.node}, packaged=${app.isPackaged}, pid=${process.pid}, ppid=${process.ppid}`
  );

  webBrowserSession = configureWebBrowserSession({
    registry: webBrowserGuestRegistry,
    getMainWindow: () => mainWindow,
  });

  if (!isE2EMode) {
    // Warm up network optimization (non-blocking)
    void warmupNetworkOptimization();

    // Initialize Telemetry early
    await initTelemetry();

    // Apply persisted proxy settings before creating windows or network requests.
    await applyProxySettings();
    await syncLaunchAtStartupSettingFromStore();
    shouldStartHidden = Boolean(await getSetting('startMinimized'));
  } else {
    logger.info('Running in E2E mode: startup side effects minimized');
  }

  // Set application menu
  await createMenu();

  // Create the main window
  const window = createMainWindow();

  // Override security headers ONLY for the OpenClaw Gateway Control UI.
  // The URL filter ensures this callback only fires for gateway requests,
  // avoiding unnecessary overhead on every other HTTP response.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1:18789/*', 'http://localhost:18789/*'] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers['X-Frame-Options'];
      delete headers['x-frame-options'];
      if (headers['Content-Security-Policy']) {
        headers['Content-Security-Policy'] = headers['Content-Security-Policy'].map(
          (csp) => csp.replace(/frame-ancestors\s+'none'/g, "frame-ancestors 'self' *")
        );
      }
      if (headers['content-security-policy']) {
        headers['content-security-policy'] = headers['content-security-policy'].map(
          (csp) => csp.replace(/frame-ancestors\s+'none'/g, "frame-ancestors 'self' *")
        );
      }
      callback({ responseHeaders: headers });
    },
  );

  // Register IPC handlers
  const morpheusControls = registerIpcHandlers(
    gatewayManager,
    clawHubService,
    window,
    hostApiRegistry,
    webBrowserSession,
    webBrowserGuestRegistry,
    {
      status: () => companionSurfaceController.status(),
      dismiss: () => companionSurfaceController.dismiss(window),
      expand: () => companionSurfaceController.expand(window),
    },
  );

  loadMainWindow(window);

  if (!isE2EMode) {
    const registered = quickCommandRegistration.start();
    logger.info(`[Quick Command] Global shortcut ${registered ? 'registered' : 'unavailable'}`);
    const voiceRegistered = voiceCommandRegistration.start();
    logger.info(`[Voice Command] Global shortcut ${voiceRegistered ? 'registered' : 'unavailable'}`);
  }

  // Create system tray
  if (!isE2EMode) {
    createTray(window, {
      getGatewayStatus: () => gatewayManager.getStatus(),
      controls: morpheusControls,
      showQuickCommand: () => {
        companionSurfaceController.show(window, 'tray');
        window.webContents.send(HOST_EVENT_CHANNELS.morpheus.quickCommand, { trigger: 'tray' });
      },
      showVoiceCommand: () => {
        companionSurfaceController.show(window, 'tray');
        window.webContents.send(HOST_EVENT_CHANNELS.morpheus.voiceCommand, { trigger: 'tray' });
      },
    });
  }

  // Initialize extension system
  await extensionRegistry.initialize({
    gatewayManager,
    getMainWindow: () => mainWindow,
    hostApi: {
      register: (extensionId, contributions) => (
        hostApiRegistry.registerExtensionContributions(extensionId, contributions)
      ),
    },
  });

  // Wire marketplace provider to ClawHubService if an extension provides one
  const marketplaceProvider = extensionRegistry.getMarketplaceProvider();
  if (marketplaceProvider) {
    clawHubService.setMarketplaceProvider(marketplaceProvider);
  }

  // Register update handlers
  registerUpdateHandlers(appUpdater, window);

  // Note: Auto-check for updates is driven by the renderer (update store init)
  // so it respects the user's "Auto-check for updates" setting.

  // Seed a stable default IDENTITY.md before the Gateway initializes the
  // workspace so ClawX desktop sessions skip OpenClaw's chat-first bootstrap.
  if (!isE2EMode) {
    void ensureClawXDefaultIdentity().catch((error) => {
      logger.warn('Failed to seed default ClawX identity:', error);
    });
  }

  // Repair any bootstrap files that only contain ClawX markers (no OpenClaw
  // template content). This fixes a race condition where ensureClawXContext()
  // previously created the file before the gateway could seed the full template.
  if (!isE2EMode) {
    void repairClawXOnlyBootstrapFiles().catch((error) => {
      logger.warn('Failed to repair bootstrap files:', error);
    });
  }

  // Pre-deploy built-in skills (feishu-doc, feishu-drive, feishu-perm, feishu-wiki)
  // to ~/.openclaw/skills/ so they are immediately available without manual install.
  if (!isE2EMode) {
    void ensureBuiltinSkillsInstalled().catch((error) => {
      logger.warn('Failed to install built-in skills:', error);
    });
  }

  // Keep community builds aligned with Clawx-biz by physically trimming
  // bundled OpenClaw consumer skills on startup (dev + packaged), keeping only
  // `skill-creator`. This also prunes stale openclaw.json entries for trimmed
  // bundled skills so we do not keep `enabled: false` config for skills that no
  // longer exist.
  if (!isE2EMode) {
    void trimBundledOpenClawSkillsAndConfigs().then(({ removed, removedConfigs, kept }) => {
      if (removed > 0 || removedConfigs > 0) {
        logger.info(
          `Trimmed bundled OpenClaw skills: removed ${removed}, pruned configs ${removedConfigs}, kept ${kept.join(', ')}`,
        );
      }
    });
  }

  // Pre-deploy bundled third-party skills from resources/preinstalled-skills.
  // This installs full skill directories (not only SKILL.md) in an idempotent,
  // non-destructive way and never blocks startup.
  if (!isE2EMode) {
    void ensurePreinstalledSkillsInstalled().catch((error) => {
      logger.warn('Failed to install preinstalled skills:', error);
    });
  }

  // Plugin installation is now configuration-driven:
  // - When a channel is added via UI: ensureXxxPluginInstalled() in IPC handlers
  // - When Gateway starts: ensureConfiguredPluginsUpgraded() in config-sync.ts
  // No need to pre-install all bundled plugins at app startup.

  // Bridge gateway and host-side events before any auto-start logic runs, so
  // renderer subscribers observe the full startup lifecycle.
  gatewayManager.on('status', (status: { state: string }) => {
    sendMainWindowEvent('gateway:status-changed', status);
    if (!isE2EMode) refreshTray();
    if (status.state === 'running' && !isE2EMode) {
      void ensureClawXContext().catch((error) => {
        logger.warn('Failed to re-merge ClawX context after gateway reconnect:', error);
      });
    }
  });

  gatewayManager.on('error', (error) => {
    sendMainWindowEvent('gateway:error', { message: error.message });
  });

  gatewayManager.on('notification', (notification) => {
    sendMainWindowEvent('gateway:notification', notification);
  });

  gatewayManager.on('gateway:health', (data) => {
    sendMainWindowEvent('gateway:health-changed', data);
  });

  gatewayManager.on('gateway:presence', (data) => {
    sendMainWindowEvent('gateway:presence-changed', data);
  });

  gatewayManager.on('chat:message', (data) => {
    sendMainWindowEvent('gateway:chat-message', data);
  });

  gatewayManager.on('chat:runtime-event', (data) => {
    sendMainWindowEvent('chat:runtime-event', data);
  });

  gatewayManager.on('channel:status', (data) => {
    sendMainWindowEvent('gateway:channel-status', data);
  });

  gatewayManager.on('exit', (code) => {
    sendMainWindowEvent('gateway:exit', { code });
  });

  deviceOAuthManager.on('oauth:code', (payload) => {
    sendMainWindowEvent('oauth:code', payload);
  });

  deviceOAuthManager.on('oauth:success', (payload) => {
    sendMainWindowEvent('oauth:success', { ...payload, success: true });
  });

  deviceOAuthManager.on('oauth:error', (error) => {
    sendMainWindowEvent('oauth:error', error);
  });

  browserOAuthManager.on('oauth:code', (payload) => {
    sendMainWindowEvent('oauth:code', payload);
  });

  browserOAuthManager.on('oauth:success', (payload) => {
    sendMainWindowEvent('oauth:success', { ...payload, success: true });
  });

  browserOAuthManager.on('oauth:error', (error) => {
    sendMainWindowEvent('oauth:error', error);
  });

  whatsAppLoginManager.on('qr', (data) => {
    sendMainWindowEvent('channel:whatsapp-qr', data);
  });

  whatsAppLoginManager.on('success', (data) => {
    sendMainWindowEvent('channel:whatsapp-success', data);
  });

  whatsAppLoginManager.on('error', (error) => {
    sendMainWindowEvent('channel:whatsapp-error', error);
  });

  // Start Gateway automatically (this seeds missing bootstrap files with full templates)
  const gatewayAutoStart = await getSetting('gatewayAutoStart');
  if (!isE2EMode && gatewayAutoStart) {
    try {
      await syncAllProviderAuthToRuntime();
      logger.debug('Auto-starting Gateway...');
      await gatewayManager.start();
      logger.info('Gateway auto-start succeeded');
    } catch (error) {
      logger.error('Gateway auto-start failed:', error);
      mainWindow?.webContents.send('gateway:error', String(error));
    }
  } else if (isE2EMode) {
    logger.info('Gateway auto-start skipped in E2E mode');
  } else {
    logger.info('Gateway auto-start disabled in settings');
  }

  // Merge ClawX context snippets into the workspace bootstrap files.
  // The gateway seeds workspace files asynchronously after its HTTP server
  // is ready, so ensureClawXContext will retry until the target files appear.
  if (!isE2EMode) {
    void ensureClawXContext().catch((error) => {
      logger.warn('Failed to merge ClawX context into workspace:', error);
    });
  }

  // CLI integration is an explicit, one-time user choice — never a silent
  // per-launch mutation of the user's HKCU PATH. Until the user opts in from
  // Setup or Settings, this does nothing at all.
  // See electron/main/cli-integration-consent.ts.
  if (!isE2EMode) {
    const cliConsent = readCliIntegrationState(app.getPath('userData'));
    if (cliConsent.choice === 'enabled') {
      void autoInstallCliIfNeeded((installedPath) => {
        mainWindow?.webContents.send('openclaw:cli-installed', installedPath);
      }).then(() => {
        generateCompletionCache();
        installCompletionToProfile();
      }).catch((error) => {
        logger.warn('CLI integration failed:', error);
      });
    } else {
      logger.info(`[CLI] Integration ${cliConsent.choice}; PATH left untouched.`);
    }
  }
}

if (gotTheLock) {
  const requestQuitOnSignal = createSignalQuitHandler({
    logInfo: (message) => logger.info(message),
    requestQuit: () => app.quit(),
  });

  process.on('exit', () => {
    releaseProcessInstanceFileLock();
  });

  process.once('SIGINT', () => requestQuitOnSignal('SIGINT'));
  process.once('SIGTERM', () => requestQuitOnSignal('SIGTERM'));

  app.on('will-quit', () => {
    quickCommandRegistration.stop();
    voiceCommandRegistration.stop();
    releaseProcessInstanceFileLock();
  });

  if (process.platform === 'win32') {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }

  gatewayManager = new GatewayManager();
  registerOpenClawConfigCoordinator(gatewayManager);
  clawHubService = new ClawHubService();

  // Register builtin extensions and load manifest
  registerAllBuiltinExtensions();
  loadExternalMainExtensions();
  void loadExtensionsFromManifest().catch((err) => {
    logger.warn('Failed to load extensions from manifest:', err);
  });

  // When a second instance is launched, focus the existing window instead.
  app.on('second-instance', () => {
    logger.info('Second Morpheus instance detected; redirecting to the existing window');

    const focusRequest = requestSecondInstanceFocus(
      mainWindowFocusState,
      Boolean(mainWindow && !mainWindow.isDestroyed()),
    );

    if (focusRequest === 'focus-now') {
      focusMainWindow();
      return;
    }

    logger.debug('Main window is not ready yet; deferring second-instance focus until ready-to-show');
  });

  // Application lifecycle
  app.whenReady().then(async () => {
    try {
      await initialize();
    } catch (error) {
      logger.error('Application initialization failed:', error);
      return;
    }

    // Register only after initialization so activation cannot race the initial
    // window or claim the single browser guest before host handlers are ready.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        loadMainWindow(createMainWindow());
      } else {
        focusMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || isE2EMode) {
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    setQuitting();
    const action = requestQuitLifecycleAction(quitLifecycleState);

    if (action === 'allow-quit') {
      return;
    }

    event.preventDefault();

    if (action === 'cleanup-in-progress') {
      logger.debug('Quit requested while cleanup already in progress; waiting for shutdown task to finish');
      return;
    }

    void extensionRegistry.teardownAll();

    const stopPromise = gatewayManager.stop().catch((err) => {
      logger.warn('gatewayManager.stop() error during quit:', err);
    });
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), 5000);
    });

    void Promise.race([stopPromise.then(() => 'stopped' as const), timeoutPromise]).then((result) => {
      if (result === 'timeout') {
        logger.warn('Gateway shutdown timed out during app quit; proceeding with forced quit');
        void gatewayManager.forceTerminateOwnedProcessForQuit().then((terminated) => {
          if (terminated) {
            logger.warn('Forced gateway process termination completed after quit timeout');
          }
        }).catch((err) => {
          logger.warn('Forced gateway termination failed after quit timeout:', err);
        });
      }
      markQuitCleanupCompleted(quitLifecycleState);
      app.quit();
    });
  });

  // Best-effort Gateway cleanup on unexpected crashes.
  // These handlers attempt to terminate the Gateway child process within a
  // short timeout before force-exiting, preventing orphaned processes.
  const emergencyGatewayCleanup = (reason: string, error: unknown): void => {
    logger.error(`${reason}:`, error);
    try {
      void gatewayManager?.stop().catch(() => { /* ignore */ });
    } catch {
      // ignore — stop() may not be callable if state is corrupted
    }
    // Give Gateway stop a brief window, then force-exit.
    setTimeout(() => {
      process.exit(1);
    }, 3000).unref();
  };

  process.on('uncaughtException', (error) => {
    emergencyGatewayCleanup('Uncaught exception in main process', error);
  });

  process.on('unhandledRejection', (reason) => {
    emergencyGatewayCleanup('Unhandled promise rejection in main process', reason);
  });
}

// Export for testing
export { mainWindow, gatewayManager };
