import {
  defineSourcePlugin,
  SourcePluginError,
  type ChapterSummary,
  type ExternalPluginContext,
  type ExternalPluginHtmlDocument,
  type ExternalSourcePlugin,
  type NovelMetadata,
  type Page,
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
import { classifyNovelCoolPage, novelCoolChapterSelectors } from './novelcool-page-classifier.js';
import { firstAttr, firstNodeText, firstText } from './novelcool.parsers.js';
import {
  isNovelCoolContentPath,
  isNovelCoolHost,
  novelCoolChapterKey,
  novelCoolPageType
} from './novelcool-url.js';

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

function isChapterUrl(value: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(value);
    const base = new URL(baseUrl);
    return (
      isNovelCoolHost(parsed.hostname) &&
      isNovelCoolHost(base.hostname) &&
      /\/chapter\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function chapterNumber(value: string): number | undefined {
  const match = value.match(/(?:chapter|ch(?:apter)?\.?)[\s_:/-]*(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : undefined;
}

function candidateScore(candidate: { title: string; url: string }): number {
  return candidate.title.length * 10 + (/\/Chapter-[^/]+\/\d+\/?$/i.test(candidate.url) ? 1 : 0);
}

async function extractChapters(
  document: ExternalPluginHtmlDocument,
  context: ExternalPluginContext,
  finalUrl: string
): Promise<ChapterSummary[]> {
  let nodes = [] as Awaited<ReturnType<ExternalPluginHtmlDocument['all']>>;
  for (const selector of novelCoolChapterSelectors) {
    assertNotCancelled(context);
    const matches = await document.all(selector);
    if (matches.length > 0) {
      nodes = matches;
      break;
    }
  }
  if (nodes.length === 0) {
    assertNotCancelled(context);
    nodes = await document.all('a');
  }

  const positions = new Map<string, number>();
  const candidates: Array<{ title: string; url: string }> = [];
  for (const node of nodes) {
    assertNotCancelled(context);
    const href = (await node.attr('href'))?.trim();
    if (!href) continue;
    const resolved = await context.url.resolve(href, finalUrl);
    assertNotCancelled(context);
    if (!isChapterUrl(resolved, finalUrl)) continue;
    const normalized = new URL(resolved);
    normalized.hash = '';
    const candidate = {
      title: (await firstNodeText(node, ['span'])) || `Chapter ${candidates.length + 1}`,
      url: normalized.toString()
    };
    const key = novelCoolChapterKey(candidate.url);
    const position = positions.get(key);
    if (position === undefined) {
      positions.set(key, candidates.length);
      candidates.push(candidate);
      continue;
    }
    if (candidateScore(candidate) > candidateScore(candidates[position]!)) {
      candidates[position] = candidate;
    }
  }

  const first = candidates[0]
    ? chapterNumber(`${candidates[0].title} ${candidates[0].url}`)
    : undefined;
  const last = candidates.at(-1)
    ? chapterNumber(`${candidates.at(-1)!.title} ${candidates.at(-1)!.url}`)
    : undefined;
  const ordered =
    first !== undefined && last !== undefined && first > last
      ? [...candidates].reverse()
      : candidates;
  return ordered.map((chapter, index) => ({ ...chapter, index: index + 1 }));
}

export async function readNovelCoolChapterList(
  url: string,
  cursor: string | undefined,
  context: ExternalPluginContext
): Promise<PluginOperationResult<Page<ChapterSummary>>> {
  if (cursor) {
    throw new SourcePluginError('CURSOR_INVALID', 'NovelCool uses module-managed cursors');
  }

  assertNotCancelled(context);
  const response = await context.http.get(url);
  assertNotCancelled(context);
  const finalUrl = response.url || url;
  const document = context.html.load(response.data);
  const diagnostics = await classifyNovelCoolPage({ html: response.data, finalUrl, document });
  assertReadablePage(diagnostics);
  const items = await extractChapters(document, context, finalUrl);
  if (items.length === 0) {
    throw new SourcePluginError('PLUGIN_RESULT_INVALID', 'NovelCool chapter list is empty');
  }

  return {
    data: { items, hasMore: false },
    cacheHints: {
      scope: 'public',
      ttlMs: 5 * 60_000,
      staleWhileRevalidateMs: 60 * 60_000
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
    },
    async readChapterList(request, context) {
      return readNovelCoolChapterList(request.url, request.cursor, context);
    }
  });
}

export { NOVELCOOL_HOST };

const plugin = createNovelCoolPlugin();
export default plugin;
