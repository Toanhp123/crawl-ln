import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryClient } from '@/shared/api/queryClient';
import { RealtimeProvider } from '@/shared/realtime';
import { ToastProvider } from '@/shared/ui';

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <ToastProvider>{children}</ToastProvider>
      </RealtimeProvider>
    </QueryClientProvider>
  );
}
