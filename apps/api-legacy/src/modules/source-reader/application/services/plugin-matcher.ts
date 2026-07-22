import type { PluginMatcher } from '../../domain/plugin/source-plugin.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

export function normalizeSourceUrl(value: string): string {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  return url.toString();
}

function hostMatches(host: string, pattern: string): boolean {
  const normalized = pattern.toLowerCase().replace(/^www\./, '');
  if (normalized.startsWith('*.')) {
    const suffix = normalized.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === normalized || host.endsWith(`.${normalized}`);
}

function globMatches(pathname: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '___DOUBLE_STAR___')
    .replaceAll('*', '[^/]*')
    .replaceAll('___DOUBLE_STAR___', '.*');
  return new RegExp(`^${escaped}$`).test(pathname);
}

export function matcherAccepts(
  matcher: PluginMatcher,
  request: { url: string; capability: SourceCapability }
): boolean {
  const normalizedUrl = normalizeSourceUrl(request.url);
  const url = new URL(normalizedUrl);
  if (!matcher.hosts.some((host) => hostMatches(url.hostname, host))) return false;
  if (matcher.capabilities && !matcher.capabilities.includes(request.capability)) return false;
  if (matcher.exclude?.some((pattern) => globMatches(url.pathname, pattern))) return false;
  if (matcher.include && !matcher.include.some((pattern) => globMatches(url.pathname, pattern))) {
    return false;
  }
  return true;
}
