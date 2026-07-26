import {
  defineSourcePlugin,
  SourcePluginError,
  type ExternalPluginContext,
  type ExternalSourcePlugin,
  type NovelMetadata,
  type PluginOperationResult,
  type SourceIdentity
} from '@novel-tool/source-plugin-sdk';
import {
  NOVELCOOL_AUTHOR_SELECTORS,
  NOVELCOOL_COVER_SELECTORS,
  NOVELCOOL_DESCRIPTION_SELECTORS,
  NOVELCOOL_HOST,
  NOVELCOOL_METADATA_TITLE_SELECTORS
} from './novelcool.config.js';
import { classifyNovelCoolPage } from './novelcool-page-classifier.js';
import { firstAttr, firstText } from './novelcool.parsers.js';
import { isNovelCoolContentPath, isNovelCoolHost, novelCoolPageType } from './novelcool-url.js';

export interface NovelCoolPluginOptions {
  minimumChapterContentChars?: number;
}

function assertNotCancelled(context: ExternalPluginContext): void {
  if (context.signal.aborted) {
    throw new SourcePluginError('SOURCE_READER_CANCELLED', 'Request cancelled');
  }
}

export function canHandleNovelCool(normalizedUrl: string, domain: string): boolean {
  return isNovelCoolHost(domain) && isNovelCoolContentPath(normalizedUrl);
}

export async function identifyNovelCool(
  url: string,
  context: ExternalPluginContext
): Promise<PluginOperationResult<SourceIdentity>> {
  assertNotCancelled(context);
  const normalizedUrl = await context.url.normalize(url);
  const parsed = new URL(normalizedUrl);
  return {
    data: {
      normalizedUrl,
      domain: parsed.hostname,
      pageType: novelCoolPageType(normalizedUrl)
    }
  };
}

function assertReadablePage(diagnostics: Awaited<ReturnType<typeof classifyNovelCoolPage>>): void {
  if (
    diagnostics.pageClassification === 'challenge' ||
    diagnostics.pageClassification === 'login'
  ) {
    throw new SourcePluginError(
      'UPSTREAM_CHALLENGE_DETECTED',
      'NovelCool returned an access challenge instead of readable content'
    );
  }
}

export async function readNovelCoolMetadata(
  url: string,
  context: ExternalPluginContext,
  _options: NovelCoolPluginOptions = {}
): Promise<PluginOperationResult<NovelMetadata>> {
  assertNotCancelled(context);
  const response = await context.http.get(url);
  assertNotCancelled(context);
  const finalUrl = response.url || url;
  const document = context.html.load(response.data);
  const diagnostics = await classifyNovelCoolPage({ html: response.data, finalUrl, document });
  assertReadablePage(diagnostics);

  const title = await firstText(document, NOVELCOOL_METADATA_TITLE_SELECTORS);
  if (title.length < 2) {
    throw new SourcePluginError('PLUGIN_RESULT_INVALID', 'NovelCool title was not found');
  }

  const cover = await firstAttr(document, NOVELCOOL_COVER_SELECTORS, 'src');
  return {
    data: {
      title,
      sourceUrl: await context.url.normalize(finalUrl),
      sourceName: 'NovelCool',
      author: (await firstText(document, NOVELCOOL_AUTHOR_SELECTORS)) || undefined,
      coverUrl: cover ? await context.url.resolve(cover, finalUrl) : undefined,
      description: (await firstText(document, NOVELCOOL_DESCRIPTION_SELECTORS)) || undefined
    },
    cacheHints: {
      scope: 'public',
      ttlMs: 30 * 60_000,
      staleWhileRevalidateMs: 6 * 60 * 60_000
    }
  };
}

export function createNovelCoolPlugin(options: NovelCoolPluginOptions = {}): ExternalSourcePlugin {
  return defineSourcePlugin({
    async initialize() {},
    async healthCheck() {
      return { status: 'healthy' as const };
    },
    async shutdown() {},
    async probeCanHandle(request) {
      return canHandleNovelCool(request.normalizedUrl, request.domain);
    },
    async identify(request, context) {
      return identifyNovelCool(request.url, context);
    },
    async readMetadata(request, context) {
      return readNovelCoolMetadata(request.url, context, options);
    }
  });
}

export { NOVELCOOL_HOST };

const plugin = createNovelCoolPlugin();
export default plugin;
