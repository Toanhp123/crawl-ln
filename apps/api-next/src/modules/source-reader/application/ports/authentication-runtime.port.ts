import type {
  AuthExecutionResult,
  AuthenticationStrategy
} from '../../domain/auth/authentication.js';
import type { CredentialHandle } from './credential.repository.js';
import type { NetworkProfileHandle } from './network-profile.repository.js';

export interface AuthenticationRuntimePort {
  authenticate(input: {
    pluginId: string;
    pluginVersion: string;
    userId?: string;
    credential: CredentialHandle;
    networkRoute?: NetworkProfileHandle;
    strategy: AuthenticationStrategy;
    configuration: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<AuthExecutionResult>;
}
