import { useSyncExternalStore } from 'react';
import type { ConnectionState } from './connection-status';

let currentStatus: ConnectionState = 'disconnected';
const listeners = new Set<() => void>();

export function getConnectionStatus(): ConnectionState {
  return currentStatus;
}

export function setConnectionStatus(nextStatus: ConnectionState): void {
  if (nextStatus === currentStatus) return;
  currentStatus = nextStatus;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConnectionStatus(): ConnectionState {
  return useSyncExternalStore(subscribe, getConnectionStatus, getConnectionStatus);
}
