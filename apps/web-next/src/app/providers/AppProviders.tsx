import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ReaderPreferencesProvider } from '@/features/reader-preferences';
import { queryClient } from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import { AppThemeProvider } from '@/shared/theme';
import { appCatalogs } from '../i18n/catalog';
import { interpretAppError } from '../i18n/error-catalog';
import { RealtimeProvider } from '../realtime';
import { ErrorBoundaryProvider } from './ErrorBoundaryProvider';
import { MaintenanceProvider } from './MaintenanceProvider';
import { QueryProvider } from './QueryProvider';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppThemeProvider>
      <I18nProvider catalogs={appCatalogs} interpretError={interpretAppError}>
        <QueryClientProvider client={queryClient}>
          <RealtimeProvider>
            <QueryProvider>
              <ErrorBoundaryProvider>
                <MaintenanceProvider>
                  <ReaderPreferencesProvider>
                    <BrowserRouter>{children}</BrowserRouter>
                  </ReaderPreferencesProvider>
                </MaintenanceProvider>
              </ErrorBoundaryProvider>
            </QueryProvider>
          </RealtimeProvider>
        </QueryClientProvider>
      </I18nProvider>
    </AppThemeProvider>
  );
}
