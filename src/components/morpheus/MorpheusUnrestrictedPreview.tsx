import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settings';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { MorpheusFluidOrb } from './MorpheusFluidOrb';
import { resolveMorpheusSignalState } from './signal/signal-state';
import type { MorpheusAppearance } from '@shared/morpheus/appearance-types';
import './morpheus-appearance.css';

const copy = 'morpheus.experience.unrestrictedPreview';

export function MorpheusUnrestrictedPreview() {
  const { t } = useTranslation('dashboard');
  const appearance = useSettingsStore((state) => state.morpheusAppearance);
  const saveAppearance = useSettingsStore((state) => state.setMorpheusAppearance);
  const voicePhase = useMorpheusVoiceStore((state) => state.phase);
  const voicePresence = useMorpheusVoiceStore((state) => state.presence?.state);
  const objectiveState = useMorpheusCommandStore((state) => state.objectiveRun?.state);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const choose = async (value: MorpheusAppearance) => {
    if (busy || value === appearance) return;
    setBusy(true); setFailed(false);
    try { await saveAppearance(value); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <section className="morpheus-appearance-settings" data-testid="morpheus-unrestricted-preview" aria-labelledby="morpheus-appearance-title">
    <div className="morpheus-appearance-heading">
      <div><h2 id="morpheus-appearance-title">{t(`${copy}.title`)}</h2><p>{t(`${copy}.description`)}</p></div>
      <MorpheusFluidOrb state={resolveMorpheusSignalState({ voicePhase, voicePresence, objectiveState })} className="morpheus-appearance-orb" label={t('morpheus.title')} />
    </div>
    <fieldset disabled={busy} className="morpheus-appearance-options">
      <legend className="sr-only">{t(`${copy}.title`)}</legend>
      {(['green', 'unrestricted-preview'] as const).map((value) => <label key={value} data-selected={appearance === value} className="morpheus-appearance-choice">
        <input type="radio" name="morpheus-appearance" value={value} checked={appearance === value} onChange={() => void choose(value)} data-testid={`morpheus-appearance-${value}`} />
        <span><strong>{t(`${copy}.${value === 'green' ? 'green' : 'red'}`)}</strong><span>{t(`${copy}.${value === 'green' ? 'greenBody' : 'redBody'}`)}</span></span>
      </label>)}
    </fieldset>
    <p className="morpheus-appearance-boundary" data-testid="morpheus-appearance-boundary">{t(`${copy}.boundary`)}</p>
    {busy ? <p role="status">{t(`${copy}.saving`)}</p> : null}
    {failed ? <p role="alert">{t(`${copy}.failed`)}</p> : null}
  </section>;
}
