import { chapterCatalogs } from '@/entities/chapter';
import { novelCatalogs } from '@/entities/novel';
import { sourceAuthChallengeCatalogs } from '@/entities/source-auth-challenge';
import { sourceCredentialCatalogs } from '@/entities/source-credential';
import { sourceNetworkProfileCatalogs } from '@/entities/source-network-profile';
import { sourcePluginCatalogs } from '@/entities/source-plugin';
import { taskCatalogs } from '@/entities/task';
import { addNovelCatalogs } from '@/features/add-novel';
import { authenticateSourceCredentialCatalogs } from '@/features/authenticate-source-credential';
import { backupLibraryCatalogs } from '@/features/backup-library';
import { buildSourcePluginProjectCatalogs } from '@/features/build-source-plugin-project';
import { cancelTaskCatalogs } from '@/features/cancel-task';
import { configureAppearanceCatalogs } from '@/features/configure-appearance';
import { configureAppFontCatalogs } from '@/features/configure-app-font';
import { configureLanguageCatalogs } from '@/features/configure-language';
import { crawlNovelCatalogs } from '@/features/crawl-novel';
import { createSourcePluginProjectCatalogs } from '@/features/create-source-plugin-project';
import { deleteNovelCatalogs } from '@/features/delete-novel';
import { deleteSourcePluginProjectCatalogs } from '@/features/delete-source-plugin-project';
import { editSourcePluginProjectCatalogs } from '@/features/edit-source-plugin-project';
import { exportNovelCatalogs } from '@/features/export-novel';
import { exportSourcePluginProjectCatalogs } from '@/features/export-source-plugin-project';
import { inspectSourceUrlCatalogs } from '@/features/inspect-source-url';
import { importSourcePluginProjectCatalogs } from '@/features/import-source-plugin-project';
import { installSourcePluginCatalogs } from '@/features/install-source-plugin';
import { installSourcePluginProjectCatalogs } from '@/features/install-source-plugin-project';
import { manageSourceCredentialCatalogs } from '@/features/manage-source-credential';
import { manageSourceNetworkProfileCatalogs } from '@/features/manage-source-network-profile';
import { manageSourcePluginsCatalogs } from '@/features/manage-source-plugins';
import { pauseTaskCatalogs } from '@/features/pause-task';
import { readChapterCatalogs } from '@/features/read-chapter';
import { readerPreferencesCatalogs } from '@/features/reader-preferences';
import { rebuildSearchIndexCatalogs } from '@/features/rebuild-search-index';
import { resolveSourceAuthChallengeCatalogs } from '@/features/resolve-source-auth-challenge';
import { resumeTaskCatalogs } from '@/features/resume-task';
import { reviewSourcePermissionsCatalogs } from '@/features/review-source-permissions';
import { runSchedulerCatalogs } from '@/features/run-scheduler';
import { searchLibraryCatalogs } from '@/features/search-library';
import { selectChapterCatalogs } from '@/features/select-chapter';
import { testSourcePluginCatalogs } from '@/features/test-source-plugin';
import { testSourcePluginProjectCatalogs } from '@/features/test-source-plugin-project';
import { updateAutoUpdateCatalogs } from '@/features/update-auto-update';
import { updateNovelCatalogs } from '@/features/update-novel';
import { mergeCatalogs, type Catalog, type Language } from '@/shared/i18n';
import { appMessagesEn } from './app-messages.en';
import { appMessagesVi } from './app-messages.vi';

const sliceCatalogs = [
  chapterCatalogs,
  novelCatalogs,
  sourceAuthChallengeCatalogs,
  sourceCredentialCatalogs,
  sourceNetworkProfileCatalogs,
  sourcePluginCatalogs,
  taskCatalogs,
  addNovelCatalogs,
  authenticateSourceCredentialCatalogs,
  backupLibraryCatalogs,
  buildSourcePluginProjectCatalogs,
  cancelTaskCatalogs,
  configureAppearanceCatalogs,
  configureAppFontCatalogs,
  configureLanguageCatalogs,
  crawlNovelCatalogs,
  createSourcePluginProjectCatalogs,
  deleteNovelCatalogs,
  deleteSourcePluginProjectCatalogs,
  editSourcePluginProjectCatalogs,
  exportNovelCatalogs,
  exportSourcePluginProjectCatalogs,
  inspectSourceUrlCatalogs,
  importSourcePluginProjectCatalogs,
  installSourcePluginCatalogs,
  installSourcePluginProjectCatalogs,
  manageSourceCredentialCatalogs,
  manageSourceNetworkProfileCatalogs,
  manageSourcePluginsCatalogs,
  pauseTaskCatalogs,
  readChapterCatalogs,
  readerPreferencesCatalogs,
  rebuildSearchIndexCatalogs,
  resolveSourceAuthChallengeCatalogs,
  resumeTaskCatalogs,
  reviewSourcePermissionsCatalogs,
  runSchedulerCatalogs,
  searchLibraryCatalogs,
  selectChapterCatalogs,
  testSourcePluginCatalogs,
  testSourcePluginProjectCatalogs,
  updateAutoUpdateCatalogs,
  updateNovelCatalogs
] as const;

function mergeLanguage(language: Language, messages: Catalog): Catalog {
  return mergeCatalogs(messages, ...sliceCatalogs.map((catalog) => catalog[language]));
}

export const appCatalogs = {
  en: mergeLanguage('en', appMessagesEn),
  vi: mergeLanguage('vi', appMessagesVi)
} as const satisfies Record<Language, Catalog>;
