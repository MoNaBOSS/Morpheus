import { app, BrowserWindow, screen, type Rectangle, type WebContents } from 'electron';
import { join } from 'node:path';
import type { MorpheusVoicePresence } from '@shared/morpheus/voice-types';
import { wakeOrbBounds, wakeOrbHoverBounds } from './morpheus-presence-layout';

/** A narrow native companion surface. Main owns draft/turn admission and the hidden renderer owns execution. */
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

  getWebContents(): WebContents | null {
    return this.window && !this.window.isDestroyed() ? this.window.webContents : null;
  }

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
        preload: join(__dirname, '../orb-preload/morpheus-orb.js'),
      },
    });
    this.window = window;
    this.ready = false;
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.once('did-finish-load', () => {
      if (window.isDestroyed() || this.window !== window) return;
      this.ready = true;
      this.applyPresence();
      this.applyHover();
      if (this.wantsVisible) {
        this.shapeWindow();
        window.showInactive();
      }
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
    // Ambient microphone availability is independent of the typed companion.
    this.applyPresence();
  }

  present(action: 'hover' | 'collapse' | 'open' | 'focus'): void {
    const window = this.window;
    if (!this.wantsVisible || !window || window.isDestroyed()) return;
    if (action === 'open') {
      this.hide();
      this.onOpen();
      return;
    }
    if (action === 'hover' || action === 'focus') {
      this.hovered = true;
      window.setBounds(wakeOrbHoverBounds(this.getWorkArea()));
      this.shapeWindow();
      this.applyHover();
      if (action === 'focus') {
        window.show();
        window.focus();
      }
      return;
    }
    this.hovered = false;
    this.applyHover();
    window.setBounds(wakeOrbBounds(this.getWorkArea()));
    this.shapeWindow();
  }

  hide(): void {
    this.wantsVisible = false;
    this.hovered = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
      this.window.setBounds(wakeOrbBounds(this.getWorkArea()));
      this.shapeWindow();
      this.applyHover();
    }
  }

  reposition(): void {
    const window = this.window;
    if (!this.wantsVisible || !window || window.isDestroyed()) return;
    const workArea = this.getWorkArea();
    window.setBounds(this.hovered ? wakeOrbHoverBounds(workArea) : wakeOrbBounds(workArea));
    this.shapeWindow();
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

  private shapeWindow(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || process.platform !== 'win32') return;
    const bounds = window.getBounds();
    const orbSize = Math.min(100, bounds.width, bounds.height);
    const orbX = Math.max(0, bounds.width - orbSize);
    const orbY = Math.max(0, bounds.height - orbSize);
    // Rectangular bands approximate the circular hit area and preserve the artwork's glow.
    const strips: Rectangle[] = [];
    for (let y = 0; y < orbSize; y += 10) {
      const center = y + 5 - orbSize / 2;
      const half = Math.sqrt(Math.max(0, (orbSize / 2) ** 2 - center ** 2));
      strips.push({ x: orbX + Math.max(0, Math.floor(orbSize / 2 - half)), y: orbY + y,
        width: Math.min(orbSize, Math.ceil(half * 2)), height: Math.min(10, orbSize - y) });
    }
    const shapes = this.hovered
      ? [{ x: Math.max(0, bounds.width - 352), y: Math.max(0, bounds.height - 163),
        width: Math.min(344, bounds.width), height: Math.min(55, bounds.height) }, ...strips]
      : strips;
    window.setShape?.(shapes);
  }
}
