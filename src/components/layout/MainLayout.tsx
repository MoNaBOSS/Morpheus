/**
 * Main Layout Component
 * Platform-aware application shell.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { MAC_SIDEBAR_CHROME_HEIGHT } from '@shared/sidebar-layout';
import { cn } from '@/lib/utils';
import { WebBrowserHost } from '@/components/web-browser/WebBrowserHost';
import { MorpheusProductNav } from '@/components/morpheus/signal/MorpheusProductNav';
import { motion, useReducedMotion } from 'framer-motion';

export function MainLayout() {
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const platform = window.electron?.platform;
  const isMac = platform === 'darwin';
  const isWin = platform === 'win32';
  const isMorpheusProductSurface = [
    '/', '/missions', '/systems', '/projects', '/goals', '/agent-profiles',
    '/workflows', '/schedules', '/activity',
  ].includes(location.pathname);

  return (
    <div
      data-testid="main-layout"
      data-platform={platform}
      className={cn(
        'flex h-screen overflow-hidden',
        isWin ? 'bg-surface-sidebar' : 'bg-background',
        isMac ? 'flex-row' : 'flex-col',
      )}
    >
      <TitleBar />

      <div className="flex min-h-0 flex-1 overflow-hidden bg-surface-sidebar">
        {isMorpheusProductSurface ? <MorpheusProductNav /> : <Sidebar />}
        <main
          data-testid="main-content"
          className={cn(
            'relative min-h-0 flex-1 bg-background',
            isMorpheusProductSurface ? 'overflow-hidden p-0' : 'overflow-auto p-6',
            !isMorpheusProductSurface && 'rounded-tl-2xl border-l border-border/60',
            !isWin && 'border-t border-border/60',
          )}
        >
          {isMac && (
            <div
              data-testid="mac-main-drag-region"
              aria-hidden="true"
              className="drag-region absolute inset-x-0 top-0 z-10"
              style={{ height: MAC_SIDEBAR_CHROME_HEIGHT }}
            />
          )}
          {isMorpheusProductSurface ? (
            <motion.div key={location.pathname} className="h-full min-h-0" initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.24 }}>
              <Outlet />
            </motion.div>
          ) : <Outlet />}
        </main>
        <WebBrowserHost />
      </div>
    </div>
  );
}
