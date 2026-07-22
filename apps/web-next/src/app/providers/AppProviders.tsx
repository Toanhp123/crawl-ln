import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from '../../shared/api';
import { RealtimeProvider } from '../realtime';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </RealtimeProvider>
    </QueryClientProvider>
  );
}
