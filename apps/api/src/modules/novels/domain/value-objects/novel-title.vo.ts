import { NovelDomainValidationError } from '../errors/novel-domain.error.js';

export class NovelTitle {
  private constructor(private readonly value: string) {}

  static create(input: string): NovelTitle {
    const value = input.trim();
    if (!value) throw new NovelDomainValidationError('Novel title is required');
    if (value.length > 300) throw new NovelDomainValidationError('Novel title is too long');
    return new NovelTitle(value);
  }

  toString() {
    return this.value;
  }
}
