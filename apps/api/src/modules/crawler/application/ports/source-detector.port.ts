import type { SourceProfile } from '../../domain/source/source-profile.js';

export interface SourceDetectorPort {
  detect(url: string): Promise<SourceProfile | null>;
}
