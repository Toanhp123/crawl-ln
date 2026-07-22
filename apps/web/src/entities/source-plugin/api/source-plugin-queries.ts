import { useQuery } from '@tanstack/react-query';
import {
  getSourcePluginDiagnostics,
  getSourcePluginHealth,
  listSourcePluginPermissions,
  listSourcePlugins
} from './source-plugin-api';
import { sourcePluginKeys } from './source-plugin-keys';

export type SourcePluginQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

export function useSourcePlugins(options: SourcePluginQueryOptions = {}) {
  return useQuery({
    queryKey: sourcePluginKeys.list(),
    queryFn: ({ signal }) => listSourcePlugins(signal),
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? 30_000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useSourcePluginDiagnostics(
  pluginId: string | null | undefined,
  options: SourcePluginQueryOptions = {}
) {
  const enabled = Boolean(pluginId) && (options.enabled ?? true);
  return useQuery({
    queryKey: sourcePluginKeys.detail(pluginId ?? ''),
    queryFn: ({ signal }) => getSourcePluginDiagnostics(pluginId!, signal),
    enabled,
    staleTime: options.staleTime ?? 15_000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useSourcePluginHealth(
  pluginId: string | null | undefined,
  options: SourcePluginQueryOptions = {}
) {
  const enabled = Boolean(pluginId) && (options.enabled ?? true);
  return useQuery({
    queryKey: sourcePluginKeys.health(pluginId ?? ''),
    queryFn: ({ signal }) => getSourcePluginHealth(pluginId!, signal),
    enabled,
    staleTime: options.staleTime ?? 15_000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useSourcePluginPermissions(
  pluginId: string | null | undefined,
  options: SourcePluginQueryOptions = {}
) {
  const enabled = Boolean(pluginId) && (options.enabled ?? true);
  return useQuery({
    queryKey: sourcePluginKeys.permissions(pluginId ?? ''),
    queryFn: ({ signal }) => listSourcePluginPermissions(pluginId!, signal),
    enabled,
    staleTime: options.staleTime ?? 30_000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
