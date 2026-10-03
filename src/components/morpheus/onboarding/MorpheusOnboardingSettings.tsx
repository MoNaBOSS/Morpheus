import { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MorpheusFluidOrb } from '@/components/morpheus/MorpheusFluidOrb';
import { useMorpheusCompanionStore } from '@/stores/morpheus-companion';
import type { MorpheusHumorStyle, MorpheusProactivityLevel } from '@shared/morpheus/onboarding-types';

/** Existing users can revisit the scene or edit personality without resetting providers or grants. */
export function MorpheusOnboardingSettings() {
  const { t } = useTranslation('dashboard');
  const onboarding = useMorpheusCompanionStore((s) => s.onboarding);
  const load = useMorpheusCompanionStore((s) => s.loadOnboarding);
  const update = useMorpheusCompanionStore((s) => s.updateProfile);
  const error = useMorpheusCompanionStore((s) => s.error);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('');
  const [interests, setInterests] = useState('');
  const [humorStyle, setHumorStyle] = useState<MorpheusHumorStyle>('cheeky');
  const [proactivityLevel, setProactivityLevel] = useState<MorpheusProactivityLevel>('balanced');
  useEffect(() => { void load(); }, [load]);
  const toggleEditor = () => {
    if (!onboarding) return;
    if (!editing) {
      setName(onboarding.preferences.preferredName);
      setInterests(onboarding.preferences.interests ?? '');
      setHumorStyle(onboarding.preferences.humorStyle ?? 'cheeky');
      setProactivityLevel(onboarding.preferences.proactivityLevel ?? 'balanced');
    }
    setEditing(!editing); setSaved(false);
  };
  const save = async () => {
    setSaving(true);
    const ok = await update({ preferredName: name.trim(), interests: interests.trim(), humorStyle, proactivityLevel });
    setSaving(false); setSaved(ok);
    if (ok) setEditing(false);
  };
  return <section data-testid="settings-morpheus-activation" className="rounded-xl border border-border/60 bg-surface-modal p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{t('morpheus.activationV2.profileTitle')}</p><p className="mt-1 text-xs text-muted-foreground">{t('morpheus.activationV2.profileDescription')}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" data-testid="settings-edit-companion-profile" disabled={!onboarding} onClick={toggleEditor}>{t('morpheus.common.edit')}</Button><Button variant="outline" size="sm" data-testid="settings-replay-activation" onClick={() => setPreview(true)} className="gap-2"><RotateCcw size={14} />{t('morpheus.activationV2.preview')}</Button></div></div>
    {editing ? <div data-testid="settings-companion-profile" className="mt-5 max-w-xl border-t border-white/10 pt-4">
      <label className="block text-xs text-muted-foreground">{t('morpheus.activationV2.nameQuestion')}<input data-testid="settings-companion-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] px-3 text-sm text-foreground" /></label>
      <label className="mt-4 block text-xs text-muted-foreground">{t('morpheus.activationV2.interests')}<input data-testid="settings-companion-interests" value={interests} maxLength={240} onChange={(event) => setInterests(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-[hsl(var(--morpheus-surface-2))] px-3 text-sm text-foreground" /></label>
      <p className="mt-4 text-xs text-muted-foreground">{t('morpheus.activationV2.humor')}</p><div className="mt-2 flex gap-2">{(['gentle', 'cheeky', 'unfiltered'] as const).map((style) => <button key={style} type="button" data-selected={humorStyle === style} onClick={() => setHumorStyle(style)} className="morpheus-setup-choice">{t(`morpheus.activationV2.humorStyles.${style}`)}</button>)}</div>
      <p className="mt-3 text-sm italic text-muted-foreground">{t(`morpheus.experience.personality.${humorStyle}`)}</p>
      <p className="mt-4 text-xs text-muted-foreground">{t('morpheus.activationV2.checkIns')}</p><div className="mt-2 flex gap-2">{(['quiet', 'balanced', 'talkative'] as const).map((level) => <button key={level} type="button" data-selected={proactivityLevel === level} onClick={() => setProactivityLevel(level)} className="morpheus-setup-choice">{t(`morpheus.activationV2.proactivity.${level}`)}</button>)}</div>
      <Button data-testid="settings-save-companion-profile" size="sm" disabled={saving} onClick={() => void save()} className="mt-5">{t('morpheus.common.save')}</Button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div> : null}
    {saved ? <p role="status" className="mt-3 text-xs text-[hsl(var(--morpheus-accent))]">{t('morpheus.activationV2.saved')}</p> : null}
    <Dialog.Root open={preview} onOpenChange={setPreview}><Dialog.Portal><Dialog.Content data-morpheus data-testid="morpheus-intro-preview" className="morpheus-opening fixed inset-0 z-[9999] flex items-center justify-center" aria-describedby="morpheus-preview-description">
      <Dialog.Close data-testid="morpheus-intro-preview-close" aria-label={t('morpheus.activationV2.close')} className="morpheus-opening-skip"><X size={18} /></Dialog.Close>
      <div className="morpheus-opening-copy"><MorpheusFluidOrb state="ready" identity="arrival" className="morpheus-opening-identity" label={t('morpheus.title')} />
        <Dialog.Title asChild><h1>{t('morpheus.experience.opening.title')}</h1></Dialog.Title>
        <Dialog.Description id="morpheus-preview-description" className="morpheus-opening-subtitle">{t('morpheus.experience.opening.subtitle')}</Dialog.Description>
        <button type="button" onClick={() => setPreview(false)} className="morpheus-fluid-button mt-7">{t('morpheus.experience.opening.begin')}</button>
      </div><p className="morpheus-opening-footer">{t('morpheus.experience.opening.footer')}</p>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
