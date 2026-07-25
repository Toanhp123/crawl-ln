import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import { BACKUP_SETTINGS_APPLIED_EVENT } from '../../../shared/events/backup-settings';
import {
  applyReaderPreferences,
  readReaderPreferences,
  writeReaderPreferences,
  type ReaderPreferences
} from './preferences';

export interface ReaderPreferencesValue {
  preferences: ReaderPreferences;
  setPreferences: Dispatch<SetStateAction<ReaderPreferences>>;
}

const ReaderPreferencesContext = createContext<ReaderPreferencesValue | null>(null);

export function ReaderPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<ReaderPreferences>(readReaderPreferences);

  useEffect(() => {
    applyReaderPreferences(preferences);
    writeReaderPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const reloadBackupReaderSettings = () => setPreferences(readReaderPreferences());
    window.addEventListener(BACKUP_SETTINGS_APPLIED_EVENT, reloadBackupReaderSettings);
    return () =>
      window.removeEventListener(BACKUP_SETTINGS_APPLIED_EVENT, reloadBackupReaderSettings);
  }, []);

  const value = useMemo(() => ({ preferences, setPreferences }), [preferences]);
  return (
    <ReaderPreferencesContext.Provider value={value}>{children}</ReaderPreferencesContext.Provider>
  );
}

export function useReaderPreferences(): ReaderPreferencesValue {
  const value = useContext(ReaderPreferencesContext);
  if (!value) {
    throw new Error('useReaderPreferences must be used inside ReaderPreferencesProvider');
  }
  return value;
}
