import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface AddNovelOverlayValue {
  isOpen: boolean;
  open(): void;
  close(): void;
}

const AddNovelOverlayContext = createContext<AddNovelOverlayValue | null>(null);

export function AddNovelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo<AddNovelOverlayValue>(
    () => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false) }),
    [isOpen]
  );
  return (
    <AddNovelOverlayContext.Provider value={value}>{children}</AddNovelOverlayContext.Provider>
  );
}

export function useAddNovelOverlay(): AddNovelOverlayValue {
  const value = useContext(AddNovelOverlayContext);
  if (!value) throw new Error('useAddNovelOverlay must be used inside AddNovelProvider');
  return value;
}
