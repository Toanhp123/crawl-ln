import type { ReactNode } from 'react';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
export function QueryStateBoundary({
  loading,
  error,
  empty,
  loadingTitle,
  errorTitle,
  emptyState,
  children,
  onRetry
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  loadingTitle: string;
  errorTitle: string;
  emptyState: ReactNode;
  children: ReactNode;
  onRetry?: () => void;
}) {
  if (loading) return <LoadingState title={loadingTitle} />;
  if (error)
    return (
      <ErrorState
        title={errorTitle}
        description={error instanceof Error ? error.message : String(error)}
        actionLabel={onRetry ? 'Retry' : undefined}
        onAction={onRetry}
      />
    );
  if (empty) return <>{emptyState}</>;
  return <>{children}</>;
}
