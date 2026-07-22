import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeEvent } from '@novel-tool/shared';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren
} from 'react';
import { API_BASE_URL } from '../../shared/config';
import { createBatchQueue, createEventStream, type ConnectionState } from '../../shared/realtime';
import {
  createRealtimeInvalidationRegistry,
  decodeRealtimeEvent,
  getRealtimeErrorMetadata,
  routeRealtimeEvents
} from './event-router';

const RealtimeStatusContext = createContext<ConnectionState>('disconnected');
const invalidationRegistry = createRealtimeInvalidationRegistry();

export function RealtimeProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const connectedOnce = useRef(false);

  useEffect(() => {
    const queue = createBatchQueue<RealtimeEvent>(
      (events) => routeRealtimeEvents(events, invalidationRegistry, queryClient),
      { windowMs: 150 }
    );
    const stream = createEventStream({
      url: `${API_BASE_URL}/api/events`,
      decoder: decodeRealtimeEvent,
      onValue: queue.enqueue,
      onStatus(nextStatus) {
        setStatus(nextStatus);
        if (nextStatus !== 'connected') return;
        if (connectedOnce.current) {
          void queryClient.invalidateQueries({ type: 'active' });
        }
        connectedOnce.current = true;
      },
      onError(error) {
        console.warn('[realtime-event]', getRealtimeErrorMetadata(error));
      }
    });

    const reconcileVisibleQueries = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ type: 'active' });
      }
    };
    document.addEventListener('visibilitychange', reconcileVisibleQueries);

    return () => {
      document.removeEventListener('visibilitychange', reconcileVisibleQueries);
      queue.dispose();
      stream.close();
    };
  }, [queryClient]);

  return <RealtimeStatusContext.Provider value={status}>{children}</RealtimeStatusContext.Provider>;
}

export function useRealtimeStatus(): ConnectionState {
  return useContext(RealtimeStatusContext);
}
