import type {
  PluginExecutionMode,
  PluginTrustLevel,
  SourcePluginManifest
} from '../../domain/plugin/source-plugin.js';

export interface VerifiedPluginPackage {
  manifest: SourcePluginManifest;
  files: Map<string, Uint8Array>;
  packageChecksum: string;
  signatureStatus: 'valid' | 'unsigned';
  trustLevel: PluginTrustLevel;
  executionMode: PluginExecutionMode;
  signerKeyId?: string;
}

export interface PluginPackageVerifierPort {
  verify(bytes: Uint8Array): Promise<VerifiedPluginPackage>;
}
