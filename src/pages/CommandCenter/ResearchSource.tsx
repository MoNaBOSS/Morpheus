import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hostApi } from '@/lib/host-api';
import { morpheusCitationUrl } from '@shared/morpheus/research-types';

/** Plain source content, never page markup or embedded navigation. */
export function ResearchSource({ data }: { data: Record<string, string | number> }) {
  const { t } = useTranslation('dashboard');
  const [failed, setFailed] = useState(false);
  const url = morpheusCitationUrl(data.finalUrl ?? data.url);
  const open = async () => {
    if (!url) return;
    setFailed(false);
    try { await hostApi.shell.openExternal(url); } catch { setFailed(true); }
  };
  return <article data-testid="research-source-result" className="space-y-2 break-words">
    <h4 className="text-base font-semibold text-[#edf5ef]">{data.title}</h4>
    {url ? <button type="button" data-testid="research-source-open" onClick={() => void open()} className="block max-w-full break-all text-left text-xs text-[#53edb4] underline underline-offset-4 focus-visible:outline focus-visible:outline-2" aria-label={t('morpheus.research.openSource', { title: data.title })}>{new URL(url).hostname}</button> : null}
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#d8e7dd]">{String(data.excerpt ?? '').slice(0, 2400)}</p>
    {data.truncated === 1 || String(data.excerpt ?? '').length > 2400 ? <p className="text-xs text-[#a0b6aa]">{t('morpheus.research.boundedExcerpt')}</p> : null}
    {failed ? <p role="alert" className="text-xs text-[#edaa85]">{t('morpheus.research.openFailed')}</p> : null}
  </article>;
}
