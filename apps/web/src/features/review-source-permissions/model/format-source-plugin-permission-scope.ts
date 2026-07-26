export function formatSourcePluginPermissionScope(scope: unknown): string {
  if (typeof scope === 'string') return scope;
  if (scope === null || scope === undefined) return '';

  if (Array.isArray(scope)) {
    return scope.filter((value): value is string => typeof value === 'string').join(', ');
  }

  if (typeof scope === 'object' && 'hosts' in scope && Array.isArray(scope.hosts)) {
    return scope.hosts.filter((value): value is string => typeof value === 'string').join(', ');
  }

  const serialized = JSON.stringify(scope);
  return serialized === '{}' ? '' : serialized;
}
