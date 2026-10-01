import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { hostApi } from '@/lib/host-api';
import type { MorpheusPublicationError, MorpheusPublicationPreview, MorpheusPublicationResult, MorpheusPublicationSource, MorpheusPublicationState } from '@shared/morpheus/publication-types';

export function PublicationDialog({ source, onClose }: { source: MorpheusPublicationSource; onClose: () => void }) {
  const { t } = useTranslation('dashboard');
  const label = (key: string) => t(`morpheus.publication.${key}`);
  const [state, setState] = useState<MorpheusPublicationState | null>(null);
  const [preview, setPreview] = useState<MorpheusPublicationPreview | null>(null);
  const [error, setError] = useState<MorpheusPublicationError | null>(null);
  const [busy, setBusy] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [owner, setOwner] = useState('');
  const [repository, setRepository] = useState('');
  const [slug, setSlug] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => {
    let active = true;
    void hostApi.morpheus.publicationStatus().then((result) => {
      if (!active) return;
      if (result.ok) setState(result.value); else setError(result.code);
    }, () => { if (active) setError('failed'); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  const run = async <T,>(work: () => Promise<MorpheusPublicationResult<T>>, complete: (value: T) => void) => {
    setBusy(true); setError(null);
    try { const result = await work(); if (result.ok) complete(result.value); else setError(result.code); }
    catch { setError('failed'); }
    finally { setBusy(false); }
  };
  const connection = state?.connection;
  const receipt = state?.receipts.find((item) => item.target.url === connection?.url && item.target.accountId === connection.accountId && item.target.repositoryId === connection.repositoryId);
  const choosePreview = (value: MorpheusPublicationPreview) => { setPreview(value); setAgreed(false); };
  const updateReceipt = (value: NonNullable<typeof receipt>) => {
    setPreview(null); setAgreed(false);
    setState((current) => current ? { ...current, receipts: [value, ...current.receipts.filter((item) => item.receiptId !== value.receiptId)] } : current);
  };
  const inputClass = 'w-full rounded-lg border bg-surface-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent data-testid="publication-dialog" className="morpheus-publication-dialog max-h-[88vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl border bg-surface-modal p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <DialogTitle className="font-serif text-xl font-normal tracking-tight">{label(preview?.operation === 'rollback' ? 'rollbackTitle' : 'title')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{label('description')}</DialogDescription>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={label('close')} onClick={onClose}><X className="h-4 w-4" aria-hidden /></Button>
      </div>
      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{label(`errors.${error}`)}</p> : null}
      {!state && busy ? <p role="status" className="mt-4 text-sm text-muted-foreground">{label('working')}</p> : null}
      {state && !connection ? <form className="mt-5 space-y-4" autoComplete="off" onSubmit={(event) => {
        event.preventDefault(); const credentials = { owner: owner.trim(), repository: repository.trim(), slug: slug.trim(), token: token.trim() }; setToken('');
        void run(() => hostApi.morpheus.publicationConnect(credentials), setState);
      }}>
        <p className="text-sm text-muted-foreground">{label('setup')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">{label('owner')}<input data-testid="publication-owner" required maxLength={39} className={inputClass} value={owner} onChange={(e) => setOwner(e.target.value)} spellCheck={false} disabled={busy} /></label>
          <label className="space-y-1 text-sm">{label('repository')}<input data-testid="publication-repository" required maxLength={100} className={inputClass} value={repository} onChange={(e) => setRepository(e.target.value)} spellCheck={false} disabled={busy} /></label>
        </div>
        <label className="block space-y-1 text-sm">{label('slug')}<input data-testid="publication-slug" required maxLength={48} pattern="[a-z0-9][a-z0-9-]*" className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value)} spellCheck={false} disabled={busy} /></label>
        <label className="block space-y-1 text-sm">{label('token')}<input data-testid="publication-token" type="password" required maxLength={260} className={inputClass} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" spellCheck={false} disabled={busy} /></label>
        <p className="text-xs text-muted-foreground">{label('tokenHelp')}</p>
        <Button type="submit" disabled={busy} data-testid="publication-connect">{label(busy ? 'working' : 'connect')}</Button>
      </form> : null}
      {connection ? <div className="mt-5 space-y-4">
        <div className="rounded-lg border bg-surface-input p-3 text-sm">
          <p className="font-medium">{connection.accountLogin} · {connection.owner}/{connection.repository}</p>
          <p className="mt-1 break-all text-muted-foreground" data-testid="publication-address">{connection.url}</p>
        </div>
        {preview ? <>
          <div className="space-y-2">
            <p className="text-sm font-medium">{label('files')}</p>
            {preview.files.map((file) => <details key={file.path} className="rounded-md border bg-surface-input text-xs">
              <summary className="cursor-pointer px-3 py-2 focus-visible:outline focus-visible:outline-2">{file.path} · {file.bytes.toLocaleString()} B</summary>
              <pre className="max-h-48 overflow-auto border-t p-3 text-xs" tabIndex={0}>{file.content}</pre>
            </details>)}
            <p className="break-all font-mono text-xs text-muted-foreground">{label('revision')}: {preview.sourceRevision.slice(0, 12)}</p>
            <p className="text-xs text-muted-foreground">{label('expiry')}</p>
          </div>
          <label className="flex items-start gap-2 text-sm"><input data-testid="publication-agree" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={busy} className="mt-1 shrink-0" />{label('agree')}</label>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="publication-confirm" disabled={busy || !agreed} onClick={() => void run(() => hostApi.morpheus.publicationConfirm({ approvalId: preview.approvalId }), updateReceipt)}>{label(busy ? 'working' : preview.operation === 'rollback' ? 'restore' : 'publish')}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setPreview(null); setAgreed(false); }}>{label('back')}</Button>
          </div>
        </> : <>
          {receipt ? <div className="space-y-3 rounded-lg border p-3" data-testid="publication-receipt" data-status={receipt.status}>
            <p role="status" className="text-sm">{label(`statuses.${receipt.status}`)}</p>
            <p className="break-all font-mono text-xs text-muted-foreground">{label('revision')}: {receipt.sourceRevision.slice(0, 12)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} data-testid="publication-check" onClick={() => void run(() => hostApi.morpheus.publicationCheck({ receiptId: receipt.receiptId }), updateReceipt)}>{label('check')}</Button>
              {receipt.status === 'published' ? <Button size="sm" variant="outline" data-testid="publication-open" onClick={() => void hostApi.shell.openExternal(receipt.target.url).catch(() => setError('failed'))}>{label('open')}</Button> : null}
              {receipt.canRollback ? <Button size="sm" variant="ghost" disabled={busy} data-testid="publication-rollback" onClick={() => void run(() => hostApi.morpheus.publicationPrepareRollback({ receiptId: receipt.receiptId }), choosePreview)}>{label('rollback')}</Button> : null}
            </div>
          </div> : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} data-testid="publication-prepare" onClick={() => void run(() => hostApi.morpheus.publicationPrepare(source), choosePreview)}>{label(busy ? 'working' : 'review')}</Button>
            <Button variant="ghost" disabled={busy} data-testid="publication-disconnect" onClick={() => void run(() => hostApi.morpheus.publicationDisconnect(), () => { setState((current) => current ? { ...current, connection: null } : current); setPreview(null); setToken(''); })}>{label('disconnect')}</Button>
          </div>
        </>}
        {busy ? <p className="text-xs text-muted-foreground" role="status">{label('background')}</p> : null}
      </div> : null}
    </DialogContent>
  </Dialog>;
}
