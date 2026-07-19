import type { CredentialHandle } from './credential.repository.js';
import type { NetworkProfileHandle } from './network-profile.repository.js';
import type { SessionHandle } from './session.repository.js';
import type { SourcePluginManifest } from '../../domain/plugin/source-plugin.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

export interface ResolvedRuntimeContext {
  credential?: CredentialHandle;
  session?: SessionHandle;
  networkRoute?: NetworkProfileHandle;
  executionMode: 'in-process' | 'isolated';
  browserRequired: boolean;
  cacheIdentity: {
    authScope: string;
    networkScope: string;
  };
}

export interface RuntimeContextResolverPort {
  resolve(input: {
    userId?: string;
    pluginId: string;
    pluginVersion: string;
    domain: string;
    capability: SourceCapability;
    credentialProfileId?: string;
    networkProfileId?: string;
    executionMode?: 'in-process' | 'isolated';
    runtimeRequirements?: SourcePluginManifest['runtimeRequirements'];
  }): Promise<ResolvedRuntimeContext>;
}
