import { useState } from 'react';
import { PanelBottomClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hostApi } from '@/lib/host-api';
import { stopMorpheusSpeech } from '@/lib/morpheus-speech-player';

export function MorpheusTrayChoice({ onTransferred }: { onTransferred: () => void }) {
  const { t } = useTranslation('dashboard');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const transfer = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    stopMorpheusSpeech();
    try {
      await hostApi.window.hideToTray();
      onTransferred();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return <div>
    <button type="button" data-testid="morpheus-tray-transfer" disabled={busy} onClick={() => void transfer()} className="morpheus-fluid-button morpheus-fluid-button-secondary">
      <PanelBottomClose size={17} />{t(busy ? 'morpheus.arrival.transferring' : 'morpheus.arrival.tray')}
    </button>
    {failed ? <p role="alert" data-testid="morpheus-tray-error" className="mt-3 max-w-sm text-xs text-[hsl(var(--morpheus-warn))]">{t('morpheus.arrival.trayUnavailable')}</p> : null}
  </div>;
}
