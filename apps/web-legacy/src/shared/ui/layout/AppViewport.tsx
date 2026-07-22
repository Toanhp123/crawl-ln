import type { ReactNode } from 'react';

export function AppViewport({ children }: { children: ReactNode }) {
  return <div className="flex h-svh w-full flex-col overflow-hidden bg-bg">{children}</div>;
}
