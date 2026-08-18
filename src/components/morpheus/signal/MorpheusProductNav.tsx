import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import {
  Activity, Bot, Boxes, CalendarClock, ChevronRight, CircleGauge, FolderKanban,
  Clock3, Cpu, Goal, MessageSquare, MoreHorizontal, Network, Radio, Settings,
  Sparkles, Workflow,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { MorpheusSignal } from './MorpheusSignal';

const PRIMARY = [
  { to: '/', key: 'command', icon: CircleGauge, legacyTestId: 'sidebar-nav-command-center' },
  { to: '/missions', key: 'missions', icon: Sparkles, legacyTestId: 'sidebar-nav-missions' },
  { to: '/systems', key: 'systems', icon: Network, legacyTestId: 'sidebar-nav-systems' },
  { to: '/projects', key: 'library', icon: FolderKanban, legacyTestId: 'sidebar-nav-projects' },
  { to: '/chat', key: 'chat', icon: MessageSquare, legacyTestId: 'sidebar-nav-chat' },
] as const;

const ADVANCED = [
  { to: '/goals', key: 'goals', icon: Goal, legacyTestId: 'sidebar-nav-goals' },
  { to: '/agent-profiles', key: 'agentProfiles', icon: Bot, legacyTestId: 'sidebar-nav-agent-profiles' },
  { to: '/workflows', key: 'workflows', icon: Workflow, legacyTestId: 'sidebar-nav-workflows' },
  { to: '/schedules', key: 'schedules', icon: CalendarClock, legacyTestId: 'sidebar-nav-schedules' },
  { to: '/activity', key: 'activity', icon: Activity, legacyTestId: 'sidebar-nav-activity' },
  { to: '/models', key: 'models', icon: Cpu, legacyTestId: 'sidebar-nav-models' },
  { to: '/agents', key: 'agents', icon: Bot, legacyTestId: 'sidebar-nav-agents' },
  { to: '/channels', key: 'channels', icon: Radio, legacyTestId: 'sidebar-nav-channels' },
  { to: '/skills', key: 'skills', icon: Boxes, legacyTestId: 'sidebar-nav-skills' },
  { to: '/cron', key: 'cron', icon: Clock3, legacyTestId: 'sidebar-nav-cron' },
] as const;

export function MorpheusProductNav() {
  const { t } = useTranslation('dashboard');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const showQuickCommand = useMorpheusQuickCommandStore((state) => state.show);

  return (
    <aside data-testid="morpheus-product-nav" className="morpheus-product-nav relative z-30 flex w-[76px] shrink-0 flex-col border-r border-white/[0.07] bg-[hsl(var(--morpheus-surface-1))]">
      <NavLink to="/" aria-label={t('morpheus.title')} className="drag-region flex h-[76px] items-center justify-center border-b border-white/[0.06]">
        <MorpheusSignal state="ready" compact className="h-10 w-10 text-[hsl(var(--morpheus-accent))]" />
      </NavLink>

      <nav aria-label={t('morpheus.signalOs.navigation')} className="flex flex-1 flex-col items-center gap-1.5 px-2 py-4">
        {PRIMARY.map(({ to, key, icon: Icon, legacyTestId }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            data-testid={`signal-nav-${key}`}
            className={({ isActive }) => cn(
              'group flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[9px] text-muted-foreground transition-colors',
              'hover:bg-white/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--morpheus-accent-dim))]',
              isActive && 'bg-white/[0.055] text-foreground',
            )}
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-[18px] w-[18px]', isActive && 'text-[hsl(var(--morpheus-accent))]')} strokeWidth={1.6} />
                <span data-testid={legacyTestId}>{t(`morpheus.signalOs.nav.${key}`)}</span>
              </>
            )}
          </NavLink>
        ))}

        <button
          type="button"
          data-testid="signal-nav-presence"
          onClick={() => showQuickCommand()}
          className="mt-2 flex w-full flex-col items-center gap-1 rounded-lg border border-[hsl(var(--morpheus-accent-dim))]/60 bg-[hsl(var(--morpheus-accent))]/5 px-1 py-2 text-[9px] text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/10"
        >
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.6} />
          <span data-testid="sidebar-quick-command">{t('morpheus.signalOs.nav.invoke')}</span>
        </button>
      </nav>

      <div className="relative border-t border-white/[0.06] p-2">
        {advancedOpen ? (
          <div data-testid="signal-nav-advanced-menu" className="absolute bottom-2 left-[68px] z-50 w-56 overflow-hidden rounded-xl border border-white/10 bg-[hsl(var(--morpheus-surface-2))] p-2 shadow-2xl shadow-black/60">
            <p className="px-2 pb-2 pt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{t('morpheus.signalOs.advanced')}</p>
            {ADVANCED.map(({ to, key, icon: Icon, legacyTestId }) => (
              <NavLink key={to} to={to} onClick={() => setAdvancedOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
                <Icon className="h-4 w-4" strokeWidth={1.6} />
                <span data-testid={legacyTestId} className="flex-1">{t(`morpheus.signalOs.nav.${key}`)}</span>
                <ChevronRight className="h-3 w-3 opacity-40" />
              </NavLink>
            ))}
          </div>
        ) : null}
        <button type="button" data-testid="signal-nav-advanced" aria-expanded={advancedOpen} aria-label={t('morpheus.signalOs.advanced')} onClick={() => setAdvancedOpen((value) => !value)} className="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[9px] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground">
          <MoreHorizontal className="h-[18px] w-[18px]" />
          <span>{t('morpheus.signalOs.more')}</span>
        </button>
        <NavLink to="/settings" data-testid="signal-nav-settings" className="mt-1 flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[9px] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground">
          <Settings className="h-[18px] w-[18px]" />
          <span data-testid="sidebar-nav-settings">{t('morpheus.signalOs.nav.settings')}</span>
        </NavLink>
      </div>
    </aside>
  );
}
