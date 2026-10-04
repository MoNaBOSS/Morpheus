import { app, BrowserWindow, screen, type Rectangle, type WebContents } from 'electron';
import { join } from 'node:path';
import type { MorpheusVoicePresence } from '@shared/morpheus/voice-types';
import { clampPresenceBounds, wakeOrbBounds, wakeOrbHoverBounds } from './morpheus-presence-layout';
import type { MorpheusOrbPlacement, OrbPresentationAction } from '@shared/morpheus/orb-presentation';
import { normalizeMorpheusAppearance, type MorpheusAppearance } from '@shared/morpheus/appearance-types';

/** A narrow native companion surface. Main owns draft/turn admission and the hidden renderer owns execution. */
export class MorpheusWakeOrb {
  private window: BrowserWindow | null = null;
  private presence: MorpheusVoicePresence['state'] = 'armed';
  private wantsVisible = false;
  private ready = false;
  private hovered = false;
  private appearance: MorpheusAppearance = 'green';
  private presentationLevel = 0;
  private lastLevelAt = Number.NEGATIVE_INFINITY;
  private pendingLevelTimer: ReturnType<typeof setTimeout> | null = null;
  private caption: string | null = null;
  private captionTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private placement: MorpheusOrbPlacement | null = null;
  private dragging = false;
  private dragOrigin: { x: number; y: number; anchor: Rectangle } | null = null;

  restorePlacement(value: MorpheusOrbPlacement | null): void {
    if (value && Number.isSafeInteger(value.displayId) && Number.isFinite(value.x) && Number.isFinite(value.y)
      && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1) this.placement = value;
  }

  updateAppearance(value: unknown): void {
    this.appearance = normalizeMorpheusAppearance(value);
    this.applyAppearance();
  }

  private workArea(): Rectangle {
    return (this.placement && screen.getAllDisplays().find((display) => display.id === this.placement?.displayId)?.workArea) || this.getWorkArea();
  }

  anchorBounds(): Rectangle {
    const area = this.workArea();
    const initial = wakeOrbBounds(area);
    if (!this.placement) return initial;
    return clampPresenceBounds(area, { ...initial, x: area.x + this.placement.x * Math.max(0, area.width - initial.width), y: area.y + this.placement.y * Math.max(0, area.height - initial.height) });
  }

  private moveAnchor(bounds: Rectangle): void {
    const display = screen.getDisplayMatching(bounds);
    const anchor = clampPresenceBounds(display.workArea, bounds);
    this.placement = { displayId: display.id,
      x: (anchor.x - display.workArea.x) / Math.max(1, display.workArea.width - anchor.width),
      y: (anchor.y - display.workArea.y) / Math.max(1, display.workArea.height - anchor.height) };
    this.reposition();
  }

  private clearDismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.dismissTimer = null; this.fadeTimer = null;
  }

  private scheduleDismiss(): void {
    if (this.dismissTimer || !this.wantsVisible || this.hovered || this.dragging
      || ['listening', 'transcribing', 'understanding', 'preparing-speech', 'speaking', 'waiting-for-approval'].includes(this.presence)) return;
    this.dismissTimer = setTimeout(() => {
      this.dismissTimer = null;
      const window = this.window;
      if (!window || window.isDestroyed()) return;
      void window.webContents.executeJavaScript('document.documentElement.dataset.visible = "false"', true).catch(() => undefined);
      this.fadeTimer = setTimeout(() => { this.fadeTimer = null; this.hide(); }, 180);
      this.fadeTimer.unref?.();
    }, 10_000);
    this.dismissTimer.unref?.();
  }

  constructor(
    private readonly onOpen: () => void,
    private readonly getWorkArea: () => Rectangle = () => screen.getPrimaryDisplay().workArea,
    private readonly savePlacement?: (placement: MorpheusOrbPlacement | null) => void,
  ) {}

  getWebContents(): WebContents | null {
    return this.window && !this.window.isDestroyed() ? this.window.webContents : null;
  }

  isAvailableForSocial(): boolean {
    return this.wantsVisible && this.ready && !this.hovered
      && ['idle', 'asleep', 'armed'].includes(this.presence)
      && Boolean(this.window && !this.window.isDestroyed());
  }

  showCaption(text: string | null): void {
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = null;
    this.caption = this.isAvailableForSocial() && text ? text.slice(0, 240) : null;
    if (this.caption) this.captionTimer = setTimeout(() => this.showCaption(null), 45_000);
    this.reposition();
    const window = this.window;
    if (window && !window.isDestroyed() && this.ready) {
      void window.webContents.executeJavaScript(`document.querySelector('#orb-social-caption').textContent = ${JSON.stringify(this.caption ?? '')}; document.documentElement.dataset.social = ${JSON.stringify(String(Boolean(this.caption)))}`, true).catch(() => undefined);
    }
  }

  show(): void {
    if (process.platform !== 'win32') return;
    this.wantsVisible = true;
    this.hovered = false;
    this.clearDismiss();
    this.scheduleDismiss();
    const existing = this.window;
    if (existing && !existing.isDestroyed()) {
      this.reposition();
      this.applyVisibility();
      this.applyHover();
      this.applyLevel();
      if (this.ready) existing.showInactive();
      return;
    }

    const window = new BrowserWindow({
      ...this.anchorBounds(),
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
    window.webContents.on('did-finish-load', () => {
      if (window.isDestroyed() || this.window !== window) return;
      this.ready = true;
      this.applyAppearance();
      this.applyPresence();
      this.applyVisibility();
      this.applyLevel();
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
    const changed = this.presence !== presence.state;
    this.presence = presence.state;
    if (changed) { this.clearDismiss(); this.applyVisibility(); this.scheduleDismiss(); }
    if (this.caption && ['listening', 'working', 'error'].includes(this.presence)) this.showCaption(null);
    if (this.presence !== 'listening' && this.presence !== 'speaking') this.updateLevel(0);
    // Ambient microphone availability is independent of the typed companion.
    this.applyPresence();
  }

  /** A normalized visual signal only; Main coalesces positive updates to 20/s. */
  updateLevel(level: number): void {
    if (!Number.isFinite(level) || level < 0 || level > 1) return;
    if (level > 0 && this.presence !== 'listening' && this.presence !== 'speaking') return;
    if (level === this.presentationLevel && !this.pendingLevelTimer) return;
    this.presentationLevel = level;
    if (level === 0) {
      if (this.pendingLevelTimer) clearTimeout(this.pendingLevelTimer);
      this.pendingLevelTimer = null;
      this.lastLevelAt = Number.NEGATIVE_INFINITY;
      this.applyLevel();
      return;
    }
    const now = Date.now();
    const waitMs = 50 - (now - this.lastLevelAt);
    if (waitMs <= 0) {
      if (this.pendingLevelTimer) clearTimeout(this.pendingLevelTimer);
      this.pendingLevelTimer = null;
      this.lastLevelAt = now;
      this.applyLevel();
    } else if (!this.pendingLevelTimer) {
      this.pendingLevelTimer = setTimeout(() => {
        this.pendingLevelTimer = null;
        this.lastLevelAt = Date.now();
        this.applyLevel();
      }, waitMs);
    }
  }

  present(action: OrbPresentationAction): void | Promise<void> {
    this.showCaption(null);
    const window = this.window;
    if (!this.wantsVisible || !window || window.isDestroyed()) return;
    if (action === 'drag-start') {
      this.clearDismiss();
      this.dragging = true;
      this.dragOrigin = { ...screen.getCursorScreenPoint(), anchor: this.anchorBounds() };
      this.hovered = false;
      this.reposition();
      return this.applyHover();
    }
    if (action === 'drag-move' || action === 'drag-end') {
      if (!this.dragging || !this.dragOrigin) return;
      const cursor = screen.getCursorScreenPoint(), origin = this.dragOrigin;
      this.moveAnchor({ ...origin.anchor, x: origin.anchor.x + cursor.x - origin.x, y: origin.anchor.y + cursor.y - origin.y });
      if (action === 'drag-end') { this.dragging = false; this.dragOrigin = null; this.savePlacement?.(this.placement); this.scheduleDismiss(); }
      return;
    }
    if (action.startsWith('move-')) {
      const anchor = this.anchorBounds();
      this.moveAnchor({ ...anchor, x: anchor.x + (action === 'move-left' ? -16 : action === 'move-right' ? 16 : 0), y: anchor.y + (action === 'move-up' ? -16 : action === 'move-down' ? 16 : 0) });
      this.savePlacement?.(this.placement);
      this.clearDismiss(); this.scheduleDismiss();
      return;
    }
    if (action === 'reset-position') { this.placement = null; this.savePlacement?.(null); this.reposition(); this.clearDismiss(); this.scheduleDismiss(); return; }
    if (this.dragging) return;
    if (action === 'open') {
      this.hide();
      this.onOpen();
      return;
    }
    if (action === 'hover' || action === 'focus') {
      this.clearDismiss();
      this.hovered = true;
      window.setBounds(wakeOrbHoverBounds(this.workArea(), this.anchorBounds()));
      this.shapeWindow();
      if (action === 'focus') {
        window.show();
        window.focus();
      }
      // The renderer focuses its input after the IPC acknowledgement. Do not
      // acknowledge while the composer is still inert in the other process.
      return this.applyHover();
    }
    this.hovered = false;
    this.scheduleDismiss();
    window.setBounds(this.anchorBounds());
    this.shapeWindow();
    return this.applyHover();
  }

  hide(): void {
    this.clearDismiss();
    this.showCaption(null);
    this.wantsVisible = false;
    this.hovered = false;
    this.dragging = false;
    this.dragOrigin = null;
    this.updateLevel(0);
    if (this.window && !this.window.isDestroyed()) {
      this.applyVisibility();
      this.window.hide();
      this.window.setBounds(this.anchorBounds());
      this.shapeWindow();
      this.applyHover();
    }
  }

  reposition(): void {
    const window = this.window;
    if (!this.wantsVisible || !window || window.isDestroyed()) return;
    const workArea = this.workArea();
    window.setBounds(this.hovered || this.caption ? wakeOrbHoverBounds(workArea, this.anchorBounds()) : this.anchorBounds());
    this.shapeWindow();
  }

  dispose(): void {
    this.clearDismiss();
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = null;
    this.caption = null;
    this.wantsVisible = false;
    this.ready = false;
    this.hovered = false;
    if (this.pendingLevelTimer) clearTimeout(this.pendingLevelTimer);
    this.pendingLevelTimer = null;
    if (this.window && !this.window.isDestroyed()) this.window.close();
    this.window = null;
  }

  private applyPresence(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.ready) return;
    // Only a fixed Main-owned enum enters this script; no transcript or provider data.
    const state = JSON.stringify(this.presence);
    void window.webContents.executeJavaScript(`document.documentElement.dataset.state = ${state}`, true)
      .catch(() => undefined);
  }

  private applyAppearance(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.ready) return;
    // A validated enum only. No account, personality or execution data enters.
    const appearance = JSON.stringify(this.appearance);
    void window.webContents.executeJavaScript(
      `document.documentElement.dataset.morpheusAppearance = ${appearance}; document.querySelector('.orb').dataset.appearance = ${appearance}`,
      true,
    ).catch(() => undefined);
  }

  private applyHover(): void | Promise<void> {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.ready) return;
    return window.webContents.executeJavaScript(
      `document.documentElement.dataset.hover = ${JSON.stringify(String(this.hovered))}; document.querySelector('.hover-composer').inert = ${!this.hovered}`,
      true,
    ).catch(() => undefined);
  }

  private applyVisibility(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.ready) return;
    // BrowserWindow.hide() does not always update document.hidden in Electron.
    void window.webContents.executeJavaScript(
      `document.documentElement.dataset.windowVisible = '${String(this.wantsVisible)}'; document.documentElement.dataset.visible = '${String(this.wantsVisible)}'`,
      true,
    ).catch(() => undefined);
  }

  private applyLevel(): void {
    const window = this.window;
    if (!this.wantsVisible || !window || window.isDestroyed() || !this.ready) return;
    const level = this.presentationLevel.toFixed(3);
    void window.webContents.executeJavaScript(
      `document.querySelector('.orb')?.style.setProperty('--morpheus-audio-level', '${level}')`,
      true,
    ).catch(() => undefined);
  }

  private shapeWindow(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || process.platform !== 'win32') return;
    const bounds = window.getBounds();
    const orbSize = Math.min(56, bounds.width, bounds.height);
    const anchor = this.anchorBounds();
    const orbX = Math.max(0, anchor.x - bounds.x);
    const orbY = Math.max(0, anchor.y - bounds.y);
    const panelY = Math.max(0, Math.min(bounds.height - 55, orbY >= 64 ? orbY - 64 : orbY + 64));
    if (this.ready) void window.webContents.executeJavaScript(
      `document.documentElement.style.setProperty('--orb-x', '${orbX}px'); document.documentElement.style.setProperty('--orb-y', '${orbY}px'); document.documentElement.style.setProperty('--panel-y', '${panelY}px')`, true,
    ).catch(() => undefined);
    // Rectangular bands approximate the circular hit area and preserve the artwork's glow.
    const strips: Rectangle[] = [];
    for (let y = 0; y < orbSize; y += 10) {
      const center = y + 5 - orbSize / 2;
      const half = Math.sqrt(Math.max(0, (orbSize / 2) ** 2 - center ** 2));
      strips.push({ x: orbX + Math.max(0, Math.floor(orbSize / 2 - half)), y: orbY + y,
        width: Math.min(orbSize, Math.ceil(half * 2)), height: Math.min(10, orbSize - y) });
    }
    const shapes = this.hovered || this.caption
      ? [{ x: Math.max(0, bounds.width - 352), y: panelY,
        width: Math.min(344, bounds.width), height: Math.min(55, bounds.height) }, ...strips]
      : strips;
    window.setShape?.(shapes);
  }
}
