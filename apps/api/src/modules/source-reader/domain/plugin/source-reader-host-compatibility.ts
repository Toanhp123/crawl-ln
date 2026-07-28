import type { SourceCapability } from '@novel-tool/source-plugin-sdk';

export interface CompatibilityIssue {
  code:
    | 'PLUGIN_RUNTIME_INCOMPATIBLE'
    | 'PLUGIN_CAPABILITY_CONTRACT_UNSUPPORTED'
    | 'PLUGIN_EXTENSION_CONTRACT_UNSUPPORTED'
    | 'PLUGIN_EXTENSION_SCHEMA_INVALID'
    | 'PLUGIN_PERMISSION_DENIED';
  path: string;
  severity: 'warning' | 'fatal';
  message: string;
}

export interface CompatibilityReport {
  compatible: boolean;
  issues: CompatibilityIssue[];
  activatedExtensions: Record<string, { version: number; schema: string; required: boolean }>;
}

export interface SourceReaderHostCompatibility {
  runtimeVersion: string;
  sandboxProtocolVersion: number;
  capabilityContracts: Record<SourceCapability, readonly number[]>;
  extensionContracts: Record<string, readonly number[]>;
  permissions: readonly string[];
}

export const SOURCE_READER_HOST_COMPATIBILITY: SourceReaderHostCompatibility = {
  runtimeVersion: '1.0.0',
  sandboxProtocolVersion: 1,
  capabilityContracts: {
    identify: [1],
    metadata: [1],
    'chapter-list': [1],
    'chapter-content': [1],
    search: [1],
    'latest-updates': [1],
    authentication: [1]
  },
  extensionContracts: {
    'source-reader/form-login': [1]
  },
  permissions: ['network', 'browser', 'authentication', 'persistentCache', 'externalAssets']
};
