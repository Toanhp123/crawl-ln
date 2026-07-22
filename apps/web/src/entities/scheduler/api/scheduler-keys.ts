export const schedulerKeys = {
  all: ['scheduler'] as const,
  status: () => ['scheduler', 'status'] as const,
  diagnosticsRoot: () => ['scheduler', 'diagnostics'] as const,
  diagnostics: (novelId: string) => ['scheduler', 'diagnostics', novelId] as const
};
