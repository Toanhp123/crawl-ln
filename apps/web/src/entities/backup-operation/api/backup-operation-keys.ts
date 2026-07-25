export const backupOperationKeys = {
  all: ['backup-operation'] as const,
  current: () => ['backup-operation', 'current'] as const,
  detail: (id: string) => ['backup-operation', 'detail', id] as const
};
