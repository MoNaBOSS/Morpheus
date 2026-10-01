import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { hostApi } from '@/lib/host-api';
import { morpheusCitationUrl } from '@shared/morpheus/research-types';

/** Explicit public-source navigation, never a privileged inline browser. */
export function MorpheusCitationLink({ href, children }: { href?: string; children: ReactNode }) {
  const { t } = useTranslation('dashboard');
  const [failed, setFailed] = useState(false);
  const url = morpheusCitationUrl(href);
  if (!url) return <span>{children}</span>;
  const open = async () => {
    setFailed(false);
    try { await hostApi.shell.openExternal(url); } catch { setFailed(true); }
  };
  return <>
    <button type="button" data-testid="report-citation-open" onClick={() => void open()} title={url}
      className="inline break-all text-left text-primary underline underline-offset-2 focus-visible:outline focus-visible:outline-2">{children}</button>
    {failed ? <span role="alert" className="ml-1 text-xs text-red-700 dark:text-red-400">{t('morpheus.research.openFailed')}</span> : null}
  </>;
}
