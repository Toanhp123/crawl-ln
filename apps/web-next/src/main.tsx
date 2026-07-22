import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProviders } from '@/app/providers/AppProviders';
import { appQueryPersistenceOptions } from '@/app/providers/QueryProvider';
import { AppRouter } from '@/app/router/AppRouter';
import { queryClient, restoreQueryCache, startQueryCachePersistence } from '@/shared/api';
import '@/app/styles/index.css';

await restoreQueryCache(queryClient, appQueryPersistenceOptions);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </React.StrictMode>
);

startQueryCachePersistence(queryClient, appQueryPersistenceOptions);
