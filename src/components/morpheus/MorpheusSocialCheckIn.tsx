import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';

const LAST_CHECK_IN = 'morpheus-last-social-check-in';
const DAY_MS = 24 * 60 * 60_000;

/** A local, non-modal check-in. Silence costs no provider call and backs off. */
export function MorpheusSocialCheckIn({ activeCount }: { activeCount: number }) {
  const level = useMorpheusCompanionStore((s) => s.onboarding?.preferences.proactivityLevel ?? 'balanced');
  const settings = useMorpheusIntelligenceStore((s) => s.proactive.settings);
  if (level === 'quiet' || settings.doNotDisturb || !settings.enabled || activeCount > 0) return null;
  return <SocialCheckIn level={level} />;
}

function SocialCheckIn({ level }: { level: 'balanced' | 'talkative' }) {
  const { t } = useTranslation('dashboard');
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let lastInput = Date.now();
    const activity = () => { lastInput = Date.now(); };
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('keydown', activity);
    const timer = window.setInterval(() => {
      if (document.hidden || !document.hasFocus() || visible) return;
      const previous = Number(window.localStorage.getItem(LAST_CHECK_IN) ?? 0);
      const idleMs = level === 'talkative' ? 10 * 60_000 : 30 * 60_000;
      if (Date.now() - lastInput < idleMs || Date.now() - previous < DAY_MS) return;
      window.localStorage.setItem(LAST_CHECK_IN, String(Date.now()));
      setVisible(true);
    }, 60_000);
    return () => { window.clearInterval(timer); window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity); };
  }, [level, visible]);
  useEffect(() => {
    if (!visible) return;
    const dismissTimer = window.setTimeout(() => setVisible(false), 45_000);
    return () => { window.clearTimeout(dismissTimer); };
  }, [visible]);
  if (!visible) return null;
  return <div data-testid="morpheus-social-check-in" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#a0b6aa]" aria-live="polite">
    <span>{t('morpheus.socialCheckIn.question')}</span>
    <button type="button" onClick={() => setVisible(false)} aria-label={t('morpheus.socialCheckIn.dismiss')} className="text-[#a0b6aa] hover:text-white">×</button>
  </div>;
}
