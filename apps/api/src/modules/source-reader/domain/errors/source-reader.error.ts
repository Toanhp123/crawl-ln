export type SourceReaderErrorCode =
  | 'SOURCE_NOT_SUPPORTED'
  | 'CAPABILITY_NOT_SUPPORTED'
  | 'PLUGIN_UNAVAILABLE'
  | 'PLUGIN_DISABLED'
  | 'PLUGIN_QUARANTINED'
  | 'PLUGIN_CONTRACT_INCOMPATIBLE'
  | 'PLUGIN_PERMISSION_DENIED'
  | 'PLUGIN_NETWORK_PERMISSION_DENIED'
  | 'PLUGIN_RESULT_INVALID'
  | 'PLUGIN_PACKAGE_INVALID'
  | 'EXTERNAL_RUNTIME_UNSUPPORTED'
  | 'PLUGIN_SANDBOX_START_FAILED'
  | 'PLUGIN_SANDBOX_POLICY_VIOLATION'
  | 'PLUGIN_RPC_PROTOCOL_INVALID'
  | 'PLUGIN_LIFECYCLE_FAILED'
  | 'PLUGIN_RUNTIME_INCOMPATIBLE'
  | 'PLUGIN_CAPABILITY_CONTRACT_UNSUPPORTED'
  | 'PLUGIN_EXTENSION_CONTRACT_UNSUPPORTED'
  | 'PLUGIN_EXTENSION_SCHEMA_INVALID'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'CREDENTIAL_NOT_CONFIGURED'
  | 'CREDENTIAL_UNAVAILABLE'
  | 'SESSION_EXPIRED'
  | 'SESSION_NETWORK_MISMATCH'
  | 'SESSION_BINDING_MISMATCH'
  | 'SESSION_UNAVAILABLE'
  | 'AUTH_CHALLENGE_REQUIRED'
  | 'AUTH_CHALLENGE_EXPIRED'
  | 'NETWORK_ROUTE_REQUIRED'
  | 'NETWORK_REGION_UNAVAILABLE'
  | 'NETWORK_ROUTE_OFFLINE'
  | 'NETWORK_ROUTE_UNAVAILABLE'
  | 'NETWORK_ROUTE_UNSUPPORTED'
  | 'NETWORK_ROUTE_TEST_FAILED'
  | 'NETWORK_ACCESS_BLOCKED'
  | 'NETWORK_CREDENTIAL_UNAVAILABLE'
  | 'SOURCE_REQUEST_TIMEOUT'
  | 'SOURCE_RESPONSE_TOO_LARGE'
  | 'SOURCE_RATE_LIMITED'
  | 'SOURCE_TEMPORARILY_UNAVAILABLE'
  | 'CACHE_SCOPE_IDENTITY_MISSING'
  | 'CURSOR_INVALID'
  | 'CURSOR_INVALIDATED'
  | 'SECRET_VAULT_UNAVAILABLE'
  | 'SOURCE_READER_CANCELLED'
  | 'SOURCE_READER_INTERNAL_ERROR';

export interface SourceReaderErrorOptions {
  retryable: boolean;
  fallbackAllowed: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class SourceReaderError extends Error {
  readonly code: SourceReaderErrorCode;
  readonly retryable: boolean;
  readonly fallbackAllowed: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: SourceReaderErrorCode, message: string, options: SourceReaderErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'SourceReaderError';
    this.code = code;
    this.retryable = options.retryable;
    this.fallbackAllowed = options.fallbackAllowed;
    this.details = options.details;
  }
}
