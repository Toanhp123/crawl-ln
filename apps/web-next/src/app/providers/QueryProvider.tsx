import type { Query } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { QueryPersistenceOptions } from '@/shared/api';
import { ToastProvider } from '@/shared/ui';

export function shouldPersistAppQuery(query: Query): boolean {
  const [root, scope] = query.queryKey;
  return (
    (root === 'novels' && scope === 'list') ||
    (root === 'tasks' && scope === 'summary') ||
    (root === 'scheduler' && scope === 'status') ||
    (root === 'source-reader' && scope === 'plugins')
  );
}

export const appQueryPersistenceOptions: QueryPersistenceOptions = {
  buster: 'v3-app-shell-v1',
  maxAgeMs: 12 * 60 * 60 * 1000,
  shouldPersist: shouldPersistAppQuery
};

export function QueryProvider({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
