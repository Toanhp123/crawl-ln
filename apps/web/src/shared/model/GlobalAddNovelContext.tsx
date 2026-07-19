import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface GlobalAddNovelValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const GlobalAddNovelContext = createContext<GlobalAddNovelValue | null>(null);

export function GlobalAddNovelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(
    () => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false) }),
    [isOpen]
  );
  return <GlobalAddNovelContext.Provider value={value}>{children}</GlobalAddNovelContext.Provider>;
}

export function useGlobalAddNovel() {
  const value = useContext(GlobalAddNovelContext);
  if (!value) throw new Error('useGlobalAddNovel must be used inside GlobalAddNovelProvider');
  return value;
}
