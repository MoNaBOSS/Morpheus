import { app, BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import type { MorpheusVoicePresence } from '@shared/morpheus/voice-types';
import { wakeOrbBounds, wakeOrbHoverBounds } from './morpheus-presence-layout';

/** A presentation-only window. The hidden main renderer keeps ownership of audio and tasks. */
export class MorpheusWakeOrb {
  private window: BrowserWindow | null = null;
  private presence: MorpheusVoicePresence['state'] = 'armed';
  private wantsVisible = false;
  private ready = false;
  private hovered = false;

  constructor(
    private readonly onOpen: () => void,
    private readonly getWorkArea: () => Rectangle = () => screen.getPrimaryDisplay().workArea,
  ) {}

  show(): void {
    if (process.platform !== 'win32') return;
    this.wantsVisible = true;
    const existing = this.window;
    if (existing && !existing.isDestroyed()) {
      this.hovered = false;
      this.reposition();
      this.applyHover();
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
    const handleAction = (url: string): void => {
      if (url === 'morpheus-orb:open') {
        this.hide();
        this.onOpen();
      } else if (url === 'morpheus-orb:hover' && this.wantsVisible) {
        this.hovered = true;
        window.setBounds(wakeOrbHoverBounds(this.getWorkArea()));
        this.applyHover();
      } else if (url === 'morpheus-orb:collapse' && this.wantsVisible) {
        this.hovered = false;
        this.applyHover();
        window.setBounds(wakeOrbBounds(this.getWorkArea()));
      }
    };
    window.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      handleAction(url);
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      handleAction(url);
      return { action: 'deny' };
    });
    window.webContents.once('did-finish-load', () => {
      if (window.isDestroyed() || this.window !== window) return;
      this.ready = true;
      this.applyPresence();
      this.applyHover();
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
    this.hovered = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
      this.window.setBounds(wakeOrbBounds(this.getWorkArea()));
      this.applyHover();
    }
  }

  reposition(): void {
    const window = this.window;
    if (!this.wantsVisible || !window || window.isDestroyed()) return;
    const workArea = this.getWorkArea();
    window.setBounds(this.hovered ? wakeOrbHoverBounds(workArea) : wakeOrbBounds(workArea));
  }

  dispose(): void {
    this.wantsVisible = false;
    this.ready = false;
    this.hovered = false;
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

  private applyHover(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || window.webContents.isLoading()) return;
    void window.webContents.executeJavaScript(
      `document.documentElement.dataset.hover = ${JSON.stringify(String(this.hovered))}; document.querySelector('.hover-composer').inert = ${!this.hovered}`,
      true,
    ).catch(() => undefined);
  }
}
