import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from '@/app/router/AppRouter';
import { QueryProvider } from '@/app/providers/QueryProvider';
import { ErrorBoundaryProvider } from '@/app/providers/ErrorBoundaryProvider';
import { I18nProvider } from '@/shared/i18n/I18nProvider';
import { ThemeProvider } from '@/shared/theme/runtime/ThemeProvider';
import { MaintenanceProvider } from '@/shared/maintenance/MaintenanceProvider';
import { queryClient } from '@/shared/api/queryClient';
import { restoreQueryCache, startQueryCachePersistence } from '@/shared/api/queryPersistence';
import '@/app/styles/index.css';

await restoreQueryCache(queryClient);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <QueryProvider>
          <ErrorBoundaryProvider>
            <MaintenanceProvider>
              <BrowserRouter>
                <AppRouter />
              </BrowserRouter>
            </MaintenanceProvider>
          </ErrorBoundaryProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);

startQueryCachePersistence(queryClient);
