export function normalizedHost(input: string) {
  return new URL(input).hostname.toLowerCase().replace(/^www\./, '');
}

export function hostMatches(host: string, allowedHost: string) {
  const normalizedAllowed = allowedHost.toLowerCase().replace(/^www\./, '');
  return host === normalizedAllowed || host.endsWith(`.${normalizedAllowed}`);
}
