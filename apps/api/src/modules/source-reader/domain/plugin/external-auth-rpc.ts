import type { SourceCapability } from '../../public/source-reader.models.js';

export interface ExternalProbeRequest {
  normalizedUrl: string;
  domain: string;
  capability: SourceCapability;
}

export interface ExternalLoginRequest {
  strategy: 'custom';
  fields: Record<string, string>;
  routeIdentity: string;
}

export interface ExternalResumeChallengeRequest {
  challengeType: string;
  response: Record<string, string>;
  opaqueState: Record<string, unknown>;
  routeIdentity: string;
}
