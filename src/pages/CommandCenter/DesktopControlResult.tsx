import { useTranslation } from 'react-i18next';
import { isMorpheusApplicationKey } from '@shared/morpheus/actions/registry';

/** Only observed typed effects become a short human confirmation. No native
 * identifiers or internal verification flags belong on the companion surface. */
export function DesktopControlResult({ data }: { data: Readonly<Record<string, string | number>> }) {
  const { t } = useTranslation('dashboard');
  if (data.observed !== 1) return null;
  const volume = data.controlKind === 'volume' && typeof data.level === 'number'
    && Number.isInteger(data.level) && data.level >= 0 && data.level <= 100;
  const application = typeof data.applicationKey === 'string' && isMorpheusApplicationKey(data.applicationKey)
    ? t(`morpheus.applications.${data.applicationKey}`) : null;
  const operation = typeof data.operation === 'string' && ['focus', 'minimize', 'restore', 'play', 'pause'].includes(data.operation) ? data.operation : null;
  if (!volume && (!application || !operation)) return null;
  return <p data-testid="desktop-control-result" className="break-words text-sm leading-relaxed text-[#d8e7dd]">
    {volume ? t('morpheus.controlResults.volume', { level: data.level }) : t(`morpheus.controlResults.${operation}`, { application })}
  </p>;
}
