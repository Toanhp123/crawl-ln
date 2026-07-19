import type { SourceDetectorPort } from '../ports/source-detector.port.js';
import type {
  SourceProfile,
  SourceProfileRepositoryPort
} from '../../domain/source/source-profile.js';

export class SourceDetectorService implements SourceDetectorPort {
  constructor(private readonly profiles: SourceProfileRepositoryPort) {}

  async detect(url: string): Promise<SourceProfile | null> {
    return this.profiles.findByUrl(url);
  }
}
