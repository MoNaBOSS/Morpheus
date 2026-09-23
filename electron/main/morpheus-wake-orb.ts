import { app, BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import type { MorpheusVoicePresence } from '@shared/morpheus/voice-types';
import { wakeOrbBounds } from './morpheus-presence-layout';

/** A presentation-only window. The hidden main renderer keeps ownership of audio and tasks. */
export class MorpheusWakeOrb {
  private window: BrowserWindow | null = null;
  private presence: MorpheusVoicePresence['state'] = 'armed';
  private wantsVisible = false;
  private ready = false;

  constructor(
    private readonly onOpen: () => void,
    private readonly getWorkArea: () => Rectangle = () => screen.getPrimaryDisplay().workArea,
  ) {}

  show(): void {
    if (process.platform !== 'win32') return;
    this.wantsVisible = true;
    const existing = this.window;
    if (existing && !existing.isDestroyed()) {
      existing.setBounds(wakeOrbBounds(this.getWorkArea()));
      if (this.ready) existing.showInactive();
      return;
    }

    const window = new BrowserWindow({
      ...wakeOrbBounds(this.getWorkArea()),
      title: 'Morpheus presence',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.window = window;
    this.ready = false;
    const open = (url: string): void => {
      if (url !== 'morpheus-orb:open') return;
      this.hide();
      this.onOpen();
    };
    window.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      open(url);
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      open(url);
      return { action: 'deny' };
    });
    window.webContents.once('did-finish-load', () => {
      if (window.isDestroyed() || this.window !== window) return;
      this.ready = true;
      this.applyPresence();
      if (this.wantsVisible) window.showInactive();
    });
    window.on('closed', () => {
      if (this.window === window) {
        this.window = null;
        this.ready = false;
      }
    });
    const file = app.isPackaged
      ? join(process.resourcesPath, 'resources', 'morpheus-orb', 'orb.html')
      : join(__dirname, '../../resources/morpheus-orb/orb.html');
    void window.loadFile(file).catch(() => {
      if (!window.isDestroyed()) window.close();
    });
  }

  updatePresence(presence: MorpheusVoicePresence): void {
    this.presence = presence.state;
    if (!presence.ambientEnabled || presence.state === 'asleep') this.hide();
    else this.applyPresence();
  }

  hide(): void {
    this.wantsVisible = false;
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  dispose(): void {
    this.wantsVisible = false;
    this.ready = false;
    if (this.window && !this.window.isDestroyed()) this.window.close();
    this.window = null;
  }

  private applyPresence(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || window.webContents.isLoading()) return;
    // Only a fixed Main-owned enum enters this script; no transcript or provider data.
    const state = JSON.stringify(this.presence);
    void window.webContents.executeJavaScript(`document.documentElement.dataset.state = ${state}`, true)
      .catch(() => undefined);
  }
}
