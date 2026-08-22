import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useMorpheusOperatorStore } from '@/stores/morpheus-operator';

/** Routes Ask/Auto conversation decisions into the existing OpenClaw Chat. */
export function MorpheusOperatorNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const pending = useMorpheusOperatorStore((state) => state.pendingConversation);

  useEffect(() => {
    if (pending && location.pathname !== '/chat') navigate('/chat');
  }, [location.pathname, navigate, pending]);

  return null;
}
