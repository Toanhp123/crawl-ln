import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/shared/config/api';
import {
  createRealtimeInvalidationQueue,
  isRealtimeEvent,
  type RealtimeStatus
} from './realtimeInvalidation';

const RealtimeStatusContext = createContext<RealtimeStatus>('disconnected');

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const connectedOnce = useRef(false);

  useEffect(() => {
    const invalidations = createRealtimeInvalidationQueue(queryClient);
    const source = new EventSource(`${API_BASE_URL}/api/events`);

    source.onopen = () => {
      setStatus('connected');
      if (connectedOnce.current) {
        void queryClient.invalidateQueries({ type: 'active' });
      }
      connectedOnce.current = true;
    };
    source.onmessage = (message) => {
      try {
        const value: unknown = JSON.parse(message.data);
        if (isRealtimeEvent(value)) invalidations.enqueue(value);
      } catch (error) {
        console.warn('[realtime-event]', error);
      }
    };
    source.onerror = () => setStatus('disconnected');

    const reconcileVisibleQueries = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ type: 'active' });
      }
    };
    document.addEventListener('visibilitychange', reconcileVisibleQueries);

    return () => {
      document.removeEventListener('visibilitychange', reconcileVisibleQueries);
      invalidations.dispose();
      source.close();
    };
  }, [queryClient]);

  return <RealtimeStatusContext.Provider value={status}>{children}</RealtimeStatusContext.Provider>;
}

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeStatusContext);
}
