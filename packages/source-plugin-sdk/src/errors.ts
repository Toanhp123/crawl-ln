export const SOURCE_PLUGIN_ERROR_CODES = [
  'AUTHENTICATION_REQUIRED',
  'AUTHENTICATION_FAILED',
  'NETWORK_ACCESS_BLOCKED',
  'SOURCE_RESPONSE_TOO_LARGE',
  'SOURCE_RATE_LIMITED',
  'SOURCE_TEMPORARILY_UNAVAILABLE',
  'UPSTREAM_CHALLENGE_DETECTED',
  'CURSOR_INVALID',
  'PLUGIN_RESULT_INVALID',
  'SOURCE_READER_CANCELLED'
] as const;

export type SourcePluginErrorCode = (typeof SOURCE_PLUGIN_ERROR_CODES)[number];

export class SourcePluginError extends Error {
  readonly code: SourcePluginErrorCode;

  constructor(code: SourcePluginErrorCode, message: string) {
    super(message);
    this.name = 'SourcePluginError';
    this.code = code;
  }
}
