import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hostApi } from '@/lib/host-api';
import type { ManagedAccountSnapshot, ManagedAuthResult } from '@shared/morpheus/managed-types';

export function MorpheusManagedAccount() {
  const { t, i18n } = useTranslation('settings');
  const [snapshot, setSnapshot] = useState<ManagedAccountSnapshot | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const reload = useCallback(async () => {
    try { setSnapshot(await hostApi.managedAccount.status()); }
    catch { setError(true); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const browserPending = snapshot?.authState === 'browser';
  useEffect(() => {
    if (!browserPending) return;
    const timer = window.setInterval(() => { void reload(); }, 2000);
    return () => window.clearInterval(timer);
  }, [browserPending, reload]);
  const perform = async (action: () => Promise<ManagedAuthResult>) => {
    setBusy(true); setError(false);
    try {
      const result = await action(); setError(!result.success);
      if (result.success) setCode('');
      await reload();
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  const cancel = () => perform(async () => { await hostApi.managedAccount.cancelSignIn(); return { success: true }; });
  const account = snapshot?.access.account;
  const amount = (value: number) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value / 1_000_000);
  return <section className="space-y-4" data-testid="morpheus-managed-account" aria-labelledby="managed-account-heading">
    <div>
      <h2 id="managed-account-heading" className="font-serif text-xl font-normal tracking-tight">{t('managedAccount.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('managedAccount.description')}</p>
    </div>
    {!snapshot && <p role="status">{t('managedAccount.loading')}</p>}
    {snapshot && !snapshot.configured && <p data-testid="managed-account-unconfigured" className="text-sm text-muted-foreground">{t('managedAccount.notConfigured')}</p>}
    {snapshot && <div className="space-y-2" data-testid="managed-service-mode">
      <p className="text-sm">{t('managedAccount.modeLabel')} {t(snapshot.serviceMode === 'managed' ? 'managedAccount.useManaged' : 'managedAccount.ownProviders')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || snapshot.serviceMode !== 'managed'} onClick={() => void perform(async () => { setSnapshot(await hostApi.managedAccount.setMode('byok')); return { success: true }; })}>{t('managedAccount.ownProviders')}</Button>
        <Button variant="outline" disabled={busy || !snapshot.runtimeReady || snapshot.serviceMode === 'managed' || !snapshot.configured || !snapshot.signedIn || !account?.enabled} onClick={() => void perform(async () => { setSnapshot(await hostApi.managedAccount.setMode('managed')); return { success: true }; })}>{t('managedAccount.useManaged')}</Button>
      </div>
      {snapshot.serviceMode === 'managed' && <p className="text-sm text-muted-foreground">{t('managedAccount.noSilentFallback')}</p>}
    </div>}
    {snapshot?.configured && <>
      {snapshot.signedIn ? <div className="space-y-3">
        <p>{t('managedAccount.signedIn')}</p>
        {account ? <div className="space-y-1 text-sm" data-testid="managed-account-allowance">
          <p>{t('managedAccount.plan', { plan: t(`managedAccount.tiers.${account.tier}`) })}</p>
          <p>{t('managedAccount.remaining', { amount: amount(account.allowance.available) })}</p>
          <p>{t('managedAccount.reserved', { amount: amount(account.allowance.reserved) })}</p>
          {!account.enabled && <p>{t('managedAccount.noAccess')}</p>}
        </div> : <p className="text-sm text-muted-foreground">{t(`managedAccount.access.${snapshot.access.state}`)}</p>}
        <Button variant="outline" disabled={busy} onClick={() => void perform(() => hostApi.managedAccount.signOut())}>{t('managedAccount.signOut')}</Button>
      </div> : browserPending ? <div className="space-y-3">
        <p role="status">{t('managedAccount.browser')}</p>
        <Button variant="outline" disabled={busy} onClick={() => void cancel()}>{t('managedAccount.cancel')}</Button>
      </div> : snapshot.authState === 'email-code' ? <form className="max-w-sm space-y-3" onSubmit={(event) => {
        event.preventDefault(); void perform(() => hostApi.managedAccount.verifyEmailCode(code));
      }}>
        <Label htmlFor="managed-email-code">{t('managedAccount.code')}</Label>
        <Input id="managed-email-code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} pattern="[0-9]{6}" required onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
        <div className="flex gap-2"><Button type="submit" disabled={busy || code.length !== 6}>{t('managedAccount.verify')}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void cancel()}>{t('managedAccount.cancel')}</Button></div>
      </form> : <div className="max-w-sm space-y-4">
        <Button variant="outline" disabled={busy} onClick={() => void perform(() => hostApi.managedAccount.googleSignIn())}>{t('managedAccount.google')}</Button>
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void perform(() => hostApi.managedAccount.requestEmailCode(email)); }}>
          <Label htmlFor="managed-email">{t('managedAccount.email')}</Label>
          <Input id="managed-email" type="email" autoComplete="email" maxLength={254} value={email} required onChange={(event) => setEmail(event.target.value)} />
          <Button type="submit" disabled={busy || !email.trim()}>{t('managedAccount.sendCode')}</Button>
        </form>
      </div>}
      <p className="text-sm text-muted-foreground">{t('managedAccount.billingLater')}</p>
    </>}
    {(error || snapshot?.authState === 'error') && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t('managedAccount.error')}</p>}
    <Button variant="ghost" disabled={busy} onClick={() => void reload()}>{t('managedAccount.refresh')}</Button>
  </section>;
}
