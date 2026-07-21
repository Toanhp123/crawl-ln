import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type {
  ExecutableSourceCapability,
  SourceReaderCandidate,
  SourceReaderCandidateRegistryPort,
  SourceReaderMatcher
} from '../source-reader.ports.js';

export function normalizeSourceReaderUrl(value: string): string {
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

export function sourceReaderMatcherAccepts(
  matcher: SourceReaderMatcher,
  request: { url: string; capability: ExecutableSourceCapability }
): boolean {
  const url = new URL(normalizeSourceReaderUrl(request.url));
  if (!matcher.hosts.some((host) => hostMatches(url.hostname, host))) return false;
  if (matcher.capabilities && !matcher.capabilities.includes(request.capability)) return false;
  if (matcher.exclude?.some((pattern) => globMatches(url.pathname, pattern))) return false;
  if (matcher.include && !matcher.include.some((pattern) => globMatches(url.pathname, pattern))) {
    return false;
  }
  return true;
}

export class CandidateResolver {
  constructor(private readonly registry: SourceReaderCandidateRegistryPort) {}

  async resolve(input: {
    url: string;
    capability: ExecutableSourceCapability;
  }): Promise<SourceReaderCandidate[]> {
    const candidates = (await this.registry.listCandidates(input))
      .filter(
        (candidate) => !candidate.matcher || sourceReaderMatcherAccepts(candidate.matcher, input)
      )
      .map((candidate) => ({
        ...candidate,
        normalizedUrl: normalizeSourceReaderUrl(candidate.normalizedUrl || input.url)
      }))
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          Number(right.trustLevel === 'built-in') - Number(left.trustLevel === 'built-in') ||
          left.pluginId.localeCompare(right.pluginId)
      );
    if (candidates.length > 0) return candidates;

    const supported = await this.registry.hasAnyCandidate?.(input.url);
    throw new SourceReaderError(
      supported ? 'CAPABILITY_NOT_SUPPORTED' : 'SOURCE_NOT_SUPPORTED',
      supported
        ? `No plugin supports ${input.capability} for ${input.url}`
        : `No plugin supports ${input.url}`,
      { retryable: false, fallbackAllowed: false }
    );
  }
}
