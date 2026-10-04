import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Check, CreditCard, Flame, KeyRound, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { morpheusSettingsPath, readMorpheusSettingsContext } from '@/lib/morpheus-settings-route';
import './morpheus-account-plans.css';

const plans = [
  { id: 'basic', Icon: KeyRound, features: ['ownApi', 'includedVoice', 'existingTools'] },
  { id: 'premium', Icon: Sparkles, features: ['hostedModels', 'supportedVoice', 'managedUsage'] },
  { id: 'unrestricted', Icon: Flame, features: ['premiumFeatures', 'redAppearance', 'futureNerdgpt'] },
] as const;
const methods = ['stripe', 'usdt', 'usdc'] as const;
type Method = typeof methods[number];

/** Presentation only. This component cannot create checkout, accept funds or grant access. */
export function MorpheusAccountPlans() {
  const { t } = useTranslation('dashboard');
  const location = useLocation();
  const context = readMorpheusSettingsContext(location.search);
  const [method, setMethod] = useState<Method>('stripe');
  const text = (key: string) => t(`morpheus.experience.payments.${key}`);
  const destination = (section: 'connections' | 'personality') => morpheusSettingsPath(section, context.returnTo, context.surface);
  return <section className="morpheus-account-plans space-y-5" aria-label={text('title')}>
    <div data-testid="morpheus-plan-comparison" className="morpheus-account-plan-grid">
      {plans.map(({ id, Icon, features }) => <article key={id} data-plan={id} className="morpheus-account-plan">
        <div className="morpheus-account-plan-heading">
          <span className="morpheus-account-plan-icon"><Icon size={19} aria-hidden="true" /></span>
          <h2 className="font-serif text-xl font-normal tracking-tight">{t(`morpheus.experience.plans.${id}`)}</h2>
        </div>
        <p className="morpheus-account-plan-status">{t(id === 'basic' ? 'morpheus.experience.plans.available' : 'morpheus.experience.plans.planned')}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{t(`morpheus.experience.plans.${id}Body`)}</p>
        <ul className="morpheus-account-plan-features">
          {features.map(feature => <li key={feature}><Check size={14} aria-hidden="true" /><span>{text(`features.${feature}`)}</span></li>)}
        </ul>
        <div className="morpheus-account-plan-footer">
          {id === 'basic' ? <Link data-testid="morpheus-plan-connect" to={destination('connections')} className="morpheus-account-plan-action">{text('connect')}<ArrowUpRight size={15} aria-hidden="true" /></Link>
            : id === 'unrestricted' ? <Link data-testid="morpheus-plan-appearance" to={destination('personality')} className="morpheus-account-plan-action">{text('previewAppearance')}<ArrowUpRight size={15} aria-hidden="true" /></Link>
              : <span className="text-xs text-muted-foreground">{text('pricingLater')}</span>}
        </div>
      </article>)}
    </div>
    <section data-testid="morpheus-payment-options" className="morpheus-payment-options" aria-labelledby="morpheus-payment-heading">
      <div className="morpheus-payment-heading">
        <div><h2 id="morpheus-payment-heading" className="font-serif text-xl font-normal tracking-tight">{text('title')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text('description')}</p></div>
        <span data-testid="morpheus-payment-unavailable" className="morpheus-payment-availability">{text('unavailable')}</span>
      </div>
      <div className="morpheus-payment-methods" role="group" aria-label={text('methodsLabel')}>
        {methods.map(id => <button key={id} type="button" data-testid={`morpheus-payment-${id}`}
          aria-pressed={method === id} aria-controls="morpheus-payment-details" onClick={() => setMethod(id)}>
          {id === 'stripe' ? <CreditCard size={20} aria-hidden="true" /> : <Wallet size={20} aria-hidden="true" />}
          <span><strong>{text(`methods.${id}.label`)}</strong><small>{text(`methods.${id}.hint`)}</small></span>
        </button>)}
      </div>
      <div id="morpheus-payment-details" data-testid="morpheus-payment-details" className="morpheus-payment-details" aria-live="polite" aria-atomic="true">
        <ShieldCheck size={20} aria-hidden="true" />
        <div><h3 className="text-sm font-medium">{text(`methods.${method}.title`)}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text(`methods.${method}.body`)}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text('availabilityNote')}</p></div>
      </div>
    </section>
  </section>;
}
