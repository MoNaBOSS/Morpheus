/** Fixed presentation bridge for the sandboxed Windows orb. */
import { contextBridge, ipcRenderer } from 'electron';

type DraftUpdate = {
  conversationId: string;
  expectedRevision: number;
  text: string;
};

type TurnAdmission = {
  conversationId: string;
  clientRequestId: string;
  text: string;
  source: 'orb';
};

contextBridge.exposeInMainWorld('morpheusOrb', {
  snapshot: (): Promise<unknown> => ipcRenderer.invoke('morpheus-orb:snapshot'),
  updateDraft: (payload: DraftUpdate): Promise<unknown> => ipcRenderer.invoke('morpheus-orb:update-draft', payload),
  admitTurn: (payload: TurnAdmission): Promise<unknown> => ipcRenderer.invoke('morpheus-orb:admit-turn', payload),
  present: (action: 'hover' | 'collapse' | 'open' | 'focus'): Promise<unknown> => (
    ipcRenderer.invoke('morpheus-orb:present', action)
  ),
});
