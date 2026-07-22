import type { Query } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { QueryPersistenceOptions } from '@/shared/api';
import { ToastProvider } from '@/shared/ui';
import { shouldPersistAppQueryKey } from './query-persistence';

export function shouldPersistAppQuery(query: Query): boolean {
  return shouldPersistAppQueryKey(query.queryKey);
}

export { shouldPersistAppQueryKey } from './query-persistence';

export const appQueryPersistenceOptions: QueryPersistenceOptions = {
  buster: 'v3-app-shell-v1',
  maxAgeMs: 12 * 60 * 60 * 1000,
  shouldPersist: shouldPersistAppQuery
};

export function QueryProvider({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
