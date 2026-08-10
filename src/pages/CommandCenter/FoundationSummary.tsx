import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bot, CalendarClock, ChevronRight, GitBranch } from 'lucide-react';

import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';

const SURFACES = [
  { key: 'agents', to: '/agent-profiles', icon: Bot },
  { key: 'workflows', to: '/workflows', icon: GitBranch },
  { key: 'schedules', to: '/schedules', icon: CalendarClock },
] as const;

export function FoundationSummary() {
  const { t } = useTranslation('dashboard');
  const agents = useMorpheusFoundationStore((state) => state.agentProfiles.length);
  const workflows = useMorpheusFoundationStore((state) => state.workflows.length);
  const schedules = useMorpheusFoundationStore((state) => state.schedules.length);
  const counts = { agents, workflows, schedules };

  return (
    <div data-testid="command-center-builder-summary" className="divide-y divide-border/60">
      {SURFACES.map(({ key, to, icon: Icon }) => (
        <Link
          key={key}
          to={to}
          data-testid={`command-center-open-${key}`}
          className="group flex items-center gap-2.5 px-1 py-1.5 text-tiny text-foreground/80 transition-colors hover:text-foreground"
        >
          <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[hsl(var(--morpheus-accent))]" />
          <span className="flex-1">{t(`morpheus.builder.${key}`)}</span>
          <span className="font-mono text-2xs text-muted-foreground">{counts[key]}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
