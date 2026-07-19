import type {
  SourceProfile,
  SourceProfileRepositoryPort
} from '../../../domain/source/source-profile.js';

export class ListSourceProfilesUseCase {
  constructor(private readonly profiles: SourceProfileRepositoryPort) {}

  async execute(): Promise<Array<Omit<SourceProfile, 'selectors'>>> {
    const profiles = await this.profiles.list();
    return profiles.map(({ selectors: _selectors, ...profile }) => profile);
  }
}
