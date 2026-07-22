import * as catalogSlice01 from '@/entities/source-auth-challenge';
import * as catalogSlice02 from '@/entities/source-credential';
import * as catalogSlice03 from '@/entities/source-network-profile';
import * as catalogSlice04 from '@/entities/source-plugin';
import * as catalogSlice05 from '@/features/add-novel';
import * as catalogSlice06 from '@/features/authenticate-source-credential';
import * as catalogSlice07 from '@/features/backup-library';
import * as catalogSlice08 from '@/features/cancel-task';
import * as catalogSlice09 from '@/features/configure-appearance';
import * as catalogSlice10 from '@/features/configure-language';
import * as catalogSlice11 from '@/features/crawl-novel';
import * as catalogSlice12 from '@/features/delete-novel';
import * as catalogSlice13 from '@/features/export-novel';
import * as catalogSlice14 from '@/features/inspect-source-url';
import * as catalogSlice15 from '@/features/install-source-plugin';
import * as catalogSlice16 from '@/features/manage-source-credential';
import * as catalogSlice17 from '@/features/manage-source-network-profile';
import * as catalogSlice18 from '@/features/manage-source-plugins';
import * as catalogSlice19 from '@/features/pause-task';
import * as catalogSlice20 from '@/features/read-chapter';
import * as catalogSlice21 from '@/features/reader-preferences';
import * as catalogSlice22 from '@/features/rebuild-search-index';
import * as catalogSlice23 from '@/features/resolve-source-auth-challenge';
import * as catalogSlice24 from '@/features/resume-task';
import * as catalogSlice25 from '@/features/review-source-permissions';
import * as catalogSlice26 from '@/features/run-scheduler';
import * as catalogSlice27 from '@/features/search-library';
import * as catalogSlice28 from '@/features/select-chapter';
import * as catalogSlice29 from '@/features/test-source-plugin';
import * as catalogSlice30 from '@/features/update-auto-update';
import * as catalogSlice31 from '@/features/update-novel';
import { mergeCatalogs, type Catalog, type Language } from '@/shared/i18n';
import { appMessagesEn } from './app-messages.en';
import { appMessagesVi } from './app-messages.vi';

type BilingualCatalog = Readonly<Record<Language, Catalog>>;

function isBilingualCatalog(value: unknown): value is BilingualCatalog {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<Language, unknown>>;
  return (
    candidate.en !== null &&
    typeof candidate.en === 'object' &&
    candidate.vi !== null &&
    typeof candidate.vi === 'object'
  );
}

function catalogFrom(module: object): BilingualCatalog {
  const candidates = Object.entries(module)
    .filter(([name, value]) => name.endsWith('Catalogs') && isBilingualCatalog(value))
    .map(([, value]) => value);
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one public catalog export, received ${candidates.length}`);
  }
  return candidates[0];
}

const sliceCatalogs = [
  catalogFrom(catalogSlice01),
  catalogFrom(catalogSlice02),
  catalogFrom(catalogSlice03),
  catalogFrom(catalogSlice04),
  catalogFrom(catalogSlice05),
  catalogFrom(catalogSlice06),
  catalogFrom(catalogSlice07),
  catalogFrom(catalogSlice08),
  catalogFrom(catalogSlice09),
  catalogFrom(catalogSlice10),
  catalogFrom(catalogSlice11),
  catalogFrom(catalogSlice12),
  catalogFrom(catalogSlice13),
  catalogFrom(catalogSlice14),
  catalogFrom(catalogSlice15),
  catalogFrom(catalogSlice16),
  catalogFrom(catalogSlice17),
  catalogFrom(catalogSlice18),
  catalogFrom(catalogSlice19),
  catalogFrom(catalogSlice20),
  catalogFrom(catalogSlice21),
  catalogFrom(catalogSlice22),
  catalogFrom(catalogSlice23),
  catalogFrom(catalogSlice24),
  catalogFrom(catalogSlice25),
  catalogFrom(catalogSlice26),
  catalogFrom(catalogSlice27),
  catalogFrom(catalogSlice28),
  catalogFrom(catalogSlice29),
  catalogFrom(catalogSlice30),
  catalogFrom(catalogSlice31)
] as const;

function mergeLanguage(language: Language, messages: Catalog): Catalog {
  return mergeCatalogs(messages, ...sliceCatalogs.map((catalog) => catalog[language]));
}

export const appCatalogs = {
  en: mergeLanguage('en', appMessagesEn),
  vi: mergeLanguage('vi', appMessagesVi)
} as const satisfies Record<Language, Catalog>;
