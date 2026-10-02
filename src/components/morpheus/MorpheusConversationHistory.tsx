import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { useChatStore } from '@/stores/chat';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';

/** Projects the existing catalog; selection stays with the original Main owner. */
export function MorpheusConversationHistory({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('dashboard');
  const sessions = useChatStore((s) => s.sessions);
  const labels = useChatStore((s) => s.sessionLabels);
  const load = useChatStore((s) => s.loadSessions);
  const create = useChatStore((s) => s.newSession);
  const selected = useMorpheusConversationStore((s) => s.snapshot?.selectedConversationId);
  const select = useMorpheusConversationStore((s) => s.selectConversation);
  useEffect(() => { void load(); }, [load]);
  return <aside data-testid="morpheus-conversation-history" className="absolute inset-y-12 left-0 z-40 flex w-[min(320px,90vw)] flex-col border-r border-border bg-surface-sidebar p-4 shadow-2xl" aria-label={t('morpheus.experience.history')}>
    <div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-lg font-normal tracking-tight">{t('morpheus.experience.history')}</h2><button type="button" onClick={onClose} aria-label={t('morpheus.workspace.close')} className="morpheus-workspace-icon-button"><X size={18}/></button></div>
    <button type="button" data-testid="morpheus-new-conversation" onClick={() => { create(); onClose(); }} className="mb-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5"><Plus size={16}/>{t('morpheus.experience.newConversation')}</button>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">{sessions.map((s) => <button type="button" key={s.key} data-testid="morpheus-history-entry" aria-current={s.key === selected ? 'true' : undefined} onClick={() => { void select(s.key); onClose(); }} className={`block w-full truncate rounded-lg px-3 py-3 text-left text-sm ${s.key === selected ? 'bg-black/5 dark:bg-white/10' : 'hover:bg-white/5'}`}>{labels[s.key] || s.label || s.displayName || t('morpheus.experience.conversation')}</button>)}</div>
  </aside>;
}
