import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useI18n } from '@/shared/i18n';
import { ErrorState } from '@/shared/ui';

type Props = { children: ReactNode; title: string; description: string; reload: string };
type State = { error: Error | null };

class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app-error-boundary]', {
      errorClass: error.name || 'Error',
      componentStack: info.componentStack
    });
  }

  render() {
    return this.state.error ? (
      <ErrorState
        title={this.props.title}
        description={this.props.description}
        actionLabel={this.props.reload}
        onAction={() => window.location.reload()}
      />
    ) : (
      this.props.children
    );
  }
}

export function ErrorBoundaryProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <Boundary
      title={t('common.interfaceError')}
      description={t('common.errorDescription')}
      reload={t('common.reload')}
    >
      {children}
    </Boundary>
  );
}
