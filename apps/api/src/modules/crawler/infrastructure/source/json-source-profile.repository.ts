import { existsSync, readFileSync } from 'node:fs';
import { env } from '../../../../shared/config/env.js';
import type {
  SourceProfile,
  SourceProfileRepositoryPort
} from '../../domain/source/source-profile.js';
import {
  parseSourceProfiles,
  sourceProfileSchema
} from '../../domain/source/source-profile-schema.js';
import { hostMatches, normalizedHost } from '../../domain/source/url-normalizer.js';

type LegacyProfile = {
  name: string;
  hosts: string[];
  novelTitle: string;
  chapterLinks: string;
  chapterTitle?: string;
  chapterContent: string;
  remove?: string[];
};

function isLegacyProfile(value: unknown): value is LegacyProfile {
  const profile = value as Partial<LegacyProfile>;
  return Boolean(
    profile.name &&
    Array.isArray(profile.hosts) &&
    profile.novelTitle &&
    profile.chapterLinks &&
    profile.chapterContent
  );
}

function normalizeLegacy(value: LegacyProfile): SourceProfile {
  return {
    id:
      value.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'legacy-source',
    name: value.name,
    hosts: value.hosts,
    selectors: {
      title: value.novelTitle,
      chapterLinks: value.chapterLinks,
      chapterTitle: value.chapterTitle,
      chapterContent: value.chapterContent,
      remove: value.remove
    }
  };
}

function normalizeRawProfiles(parsed: unknown): SourceProfile[] {
  const rawItems = Array.isArray(parsed) ? parsed : [];
  const normalized = rawItems.map((item) => (isLegacyProfile(item) ? normalizeLegacy(item) : item));
  return parseSourceProfiles(normalized);
}

export class JsonSourceProfileRepository implements SourceProfileRepositoryPort {
  private profiles: SourceProfile[] | null = null;

  async list() {
    return this.loadProfiles();
  }

  async findById(id: string) {
    const profiles = await this.loadProfiles();
    return profiles.find((profile) => profile.enabled !== false && profile.id === id) ?? null;
  }

  async findByUrl(url: string) {
    const host = normalizedHost(url);
    const profiles = await this.loadProfiles();
    return (
      profiles.find(
        (profile) =>
          profile.enabled !== false && profile.hosts.some((allowed) => hostMatches(host, allowed))
      ) ?? null
    );
  }

  private loadProfiles() {
    if (this.profiles) return this.profiles;
    if (!env.sourceProfilesFile || !existsSync(env.sourceProfilesFile)) {
      this.profiles = [];
      return this.profiles;
    }

    const parsed = JSON.parse(readFileSync(env.sourceProfilesFile, 'utf8')) as unknown;
    const profiles = normalizeRawProfiles(parsed);
    const duplicateIds = profiles
      .map((profile) => profile.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      throw new Error(`Duplicate source profile id(s): ${[...new Set(duplicateIds)].join(', ')}`);
    }

    for (const profile of profiles) sourceProfileSchema.parse(profile);
    this.profiles = profiles;
    return this.profiles;
  }
}
