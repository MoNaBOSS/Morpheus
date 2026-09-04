import type { BrowserWindow } from 'electron';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { syncMacTrafficLightPosition } from '../main/traffic-light-layout';
import { hideWindowToTray } from '../main/tray';

export function createWindowApi(mainWindow: BrowserWindow): CompleteHostServiceRegistry['window'] {
  return {
    syncTrafficLightPosition: (payload) => {
      syncMacTrafficLightPosition(mainWindow, payload.sidebarCollapsed);
    },
    minimize: () => {
      mainWindow.minimize();
    },
    maximize: () => {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    },
    close: () => {
      mainWindow.close();
    },
    hideToTray: () => hideWindowToTray(mainWindow),
    isMaximized: () => mainWindow.isMaximized(),
  };
}
