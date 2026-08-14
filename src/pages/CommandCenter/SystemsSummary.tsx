import { ArrowUpRight, Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { StatusDot, type StatusTone } from '@/components/morpheus/ui';
import { useMorpheusSystemsStore } from '@/stores/morpheus-systems';
import type { MorpheusSystemStatus } from '@shared/morpheus/system-types';

function tone(status: MorpheusSystemStatus): StatusTone {
  if (status === 'active' || status === 'tested') return 'ok';
  if (status === 'invalid') return 'error';
  return 'idle';
}

export function SystemsSummary() {
  const { t } = useTranslation('dashboard');
  const systems = useMorpheusSystemsStore((state) => state.snapshot.systems);
  const active = systems.filter((system) => system.status === 'active').length;
  const tested = systems.filter((system) => system.status === 'tested').length;
  const visible = [...systems]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 2);

  return (
    <section data-testid="command-center-systems-summary" className="shrink-0 border-b border-border/50 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" />{t('morpheus.systems.title')}
        </p>
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
          {t('morpheus.systems.status.active')} {active} · {t('morpheus.systems.status.tested')} {tested}
        </span>
      </div>
      {visible.length === 0 ? <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{t('morpheus.systems.empty')}</p> : (
        <ol className="mt-2 divide-y divide-border/35">
          {visible.map((system) => (
            <li key={system.systemId} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate text-2xs text-foreground/80">{system.name}</span>
              <StatusDot tone={tone(system.status)} label={t(`morpheus.systems.status.${system.status}`)} />
            </li>
          ))}
        </ol>
      )}
      <Link to="/systems" className="mt-2 inline-flex items-center gap-1 text-[9px] text-[hsl(var(--morpheus-accent))] hover:underline">
        {t('morpheus.systems.title')}<ArrowUpRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
