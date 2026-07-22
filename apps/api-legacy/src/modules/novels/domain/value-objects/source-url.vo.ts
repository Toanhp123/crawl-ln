import { NovelDomainValidationError } from '../errors/novel-domain.error.js';
export class SourceUrl {
  private constructor(readonly value: string) {}
  static create(input: string): SourceUrl {
    try {
      const url = new URL(input);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return new SourceUrl(url.toString());
    } catch {
      throw new NovelDomainValidationError('Invalid source URL');
    }
  }
}
