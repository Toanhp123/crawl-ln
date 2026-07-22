import { QueryClient } from '@tanstack/react-query';
import { getErrorMessage } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 0,
      onError(error) {
        console.error('[mutation-error]', getErrorMessage(error), error);
      }
    }
  }
});
