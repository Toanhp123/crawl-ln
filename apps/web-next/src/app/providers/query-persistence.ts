export function shouldPersistAppQueryKey(queryKey: readonly unknown[]): boolean {
  const [root, scope] = queryKey;
  if (root === 'novels' && scope === 'list') return true;
  return (
    queryKey.length === 2 &&
    ((root === 'tasks' && scope === 'summary') ||
      (root === 'scheduler' && scope === 'status') ||
      (root === 'source-reader' && scope === 'plugins'))
  );
}
