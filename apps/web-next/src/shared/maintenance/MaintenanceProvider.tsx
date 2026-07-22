import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useI18n } from '../i18n';
import { Card, LoadingState, Text } from '../ui';

type MaintenanceOptions = { reloadOnSuccess?: boolean };
type MaintenanceContextValue = {
  active: boolean;
  runMaintenance<T>(
    label: string,
    operation: () => Promise<T>,
    options?: MaintenanceOptions
  ): Promise<T>;
};

const MaintenanceContext = createContext<MaintenanceContextValue | null>(null);

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [label, setLabel] = useState<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!label) return;
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [label]);

  const runMaintenance = useCallback(
    async <T,>(
      operationLabel: string,
      operation: () => Promise<T>,
      options?: MaintenanceOptions
    ) => {
      if (runningRef.current) throw new Error(t('maintenance.busy'));
      runningRef.current = true;
      setLabel(operationLabel);
      try {
        const result = await operation();
        if (options?.reloadOnSuccess) window.location.reload();
        return result;
      } finally {
        if (!options?.reloadOnSuccess) {
          runningRef.current = false;
          setLabel(null);
        }
      }
    },
    [t]
  );

  const value = useMemo(
    () => ({ active: Boolean(label), runMaintenance }),
    [label, runMaintenance]
  );

  return (
    <MaintenanceContext.Provider value={value}>
      {children}
      {label ? (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/55 p-6">
          <Card
            role="status"
            aria-live="assertive"
            elevation="floating"
            padding="lg"
            className="w-full max-w-sm space-y-4 text-center"
          >
            <LoadingState />
            <Text variant="label">{label}</Text>
          </Card>
        </div>
      ) : null}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenanceOperation(): MaintenanceContextValue {
  const context = useContext(MaintenanceContext);
  if (!context) throw new Error('useMaintenanceOperation must be used inside MaintenanceProvider');
  return context;
}
