import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Cable, Mic, Smile, CreditCard, SlidersHorizontal } from 'lucide-react';
import { ProvidersSettings } from '@/components/settings/ProvidersSettings';
import { MorpheusVoiceSetup } from '@/components/morpheus/MorpheusVoiceSetup';
import { MorpheusOnboardingSettings } from '@/components/morpheus/onboarding/MorpheusOnboardingSettings';
import { MorpheusManagedAccount } from '@/components/morpheus/MorpheusManagedAccount';
import { readMorpheusSettingsContext, morpheusAdvancedSettingsPath } from '@/lib/morpheus-settings-route';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { MorpheusProactiveSettings } from '@/components/morpheus/MorpheusProactiveSettings';
import { MorpheusAccountPlans } from '@/components/morpheus/MorpheusAccountPlans';
import { MorpheusUnrestrictedPreview } from '@/components/morpheus/MorpheusUnrestrictedPreview';
import { MorpheusModelRouting } from '@/components/morpheus/MorpheusModelRouting';

const sections = [['connections', Cable], ['voice', Mic], ['personality', Smile], ['account', CreditCard], ['advanced', SlidersHorizontal]] as const;
export function MorpheusSettings() {
  const { t } = useTranslation('dashboard');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const context = readMorpheusSettingsContext(location.search);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const returnToConversation = () => {
    navigate(context.returnTo);
    if (context.surface === 'compact') useMorpheusQuickCommandStore.getState().show();
  };
  const section = sections.some(([key]) => key === params.get('section')) ? params.get('section')! : 'connections';
  return <div data-morpheus data-testid="morpheus-settings-page" className="morpheus-settings flex h-full min-h-0 flex-col">
    <header className="morpheus-settings-header flex shrink-0 items-center gap-3 border-b border-border"><button type="button" data-testid="morpheus-settings-return" onClick={returnToConversation} className="morpheus-workspace-icon-button" aria-label={t('morpheus.experience.back')}><ArrowLeft size={18}/></button><h1 ref={heading} tabIndex={-1} className="text-lg font-medium tracking-tight outline-none">{t('morpheus.signalOs.nav.settings')}</h1></header>
    <nav aria-label={t('morpheus.signalOs.nav.settings')} className="morpheus-settings-tabs flex shrink-0 flex-wrap gap-1 border-b border-border">{sections.map(([key, Icon]) => <button type="button" key={key} data-testid={`morpheus-settings-${key}`} aria-pressed={section === key} onClick={() => setParams((prior) => { const next = new URLSearchParams(prior); next.set('section', key); return next; })} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${section === key ? 'bg-black/5 dark:bg-white/10 text-foreground' : 'text-muted-foreground hover:bg-white/5'}`}><Icon size={16}/>{t(`morpheus.experience.settings.${key}`)}</button>)}</nav>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="morpheus-settings-content mx-auto space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">{t(`morpheus.experience.settings.${section}Body`)}</p>
      {section === 'account' ? <MorpheusAccountPlans/> : null}
      {section === 'connections' ? <><MorpheusModelRouting/><ProvidersSettings/></> : section === 'voice' ? <MorpheusVoiceSetup/> : section === 'personality' ? <><MorpheusUnrestrictedPreview/><MorpheusOnboardingSettings/><details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium">{t('morpheus.proactive.settings.title')}</summary><div className="mt-4"><MorpheusProactiveSettings/></div></details></> : section === 'account' ? <MorpheusManagedAccount/> : <div className="space-y-3">
        <Link to={morpheusAdvancedSettingsPath(location.search)} data-testid="morpheus-advanced-settings" className="block rounded-xl border border-border bg-surface-input p-4 text-sm hover:bg-white/5">{t('morpheus.experience.advancedSettings')}</Link>
        <Link to="/chat" data-testid="morpheus-advanced-chat" className="block rounded-xl border border-border bg-surface-input p-4 text-sm hover:bg-white/5">{t('morpheus.experience.advancedChat')}</Link>
        <Link to="/missions" className="block rounded-xl border border-border bg-surface-input p-4 text-sm hover:bg-white/5">{t('morpheus.signalOs.nav.missions')}</Link>
      </div>}
    </div></div>
  </div>;
}
