import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeEvent } from '@novel-tool/shared';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import { API_BASE_URL } from '../../shared/config';
import {
  createBatchQueue,
  createEventStream,
  setConnectionStatus,
  useConnectionStatus,
  type ConnectionState
} from '../../shared/realtime';
import {
  createRealtimeInvalidationRegistry,
  decodeRealtimeEvent,
  getRealtimeErrorMetadata,
  realtimeInvalidationOptions,
  routeRealtimeEvents
} from './event-router';

const invalidationRegistry = createRealtimeInvalidationRegistry();

export function RealtimeProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
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
        setConnectionStatus(nextStatus);
        if (nextStatus !== 'connected') return;
        if (connectedOnce.current) {
          void queryClient.invalidateQueries({ type: 'active' }, realtimeInvalidationOptions);
        }
        connectedOnce.current = true;
      },
      onError(error) {
        console.warn('[realtime-event]', getRealtimeErrorMetadata(error));
      }
    });

    const reconcileVisibleQueries = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ type: 'active' }, realtimeInvalidationOptions);
      }
    };
    document.addEventListener('visibilitychange', reconcileVisibleQueries);

    return () => {
      setConnectionStatus('disconnected');
      document.removeEventListener('visibilitychange', reconcileVisibleQueries);
      queue.dispose();
      stream.close();
    };
  }, [queryClient]);

  return children;
}

export function useRealtimeStatus(): ConnectionState {
  return useConnectionStatus();
}
