import { env } from '../../../../../../shared/config/env.js';
import { sanitizeChapterText } from '../../../../../../shared/text/chapter-content-sanitizer.js';
import { SourceReaderError } from '../../../../domain/errors/source-reader.error.js';
import type {
  PluginContext,
  PluginHtmlDocument,
  SourceReaderPlugin
} from '../../../../domain/plugin/source-plugin.js';
import { novelCoolManifest } from './novelcool.manifest.js';
import {
  classifyNovelCoolPage,
  novelCoolChapterSelectors,
  type NovelCoolPageDiagnostics
} from './novelcool-page-classifier.js';
import { chapterContent, cleanSourceText, firstAttr, firstText } from './novelcool.parsers.js';

function normalizedHost(value: string): string {
  return value.toLowerCase().replace(/^www\./, '');
}

function isChapterUrl(value: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(value);
    const base = new URL(baseUrl);
    return (
      normalizedHost(parsed.hostname) === normalizedHost(base.hostname) &&
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

function assertUsablePage(diagnostics: NovelCoolPageDiagnostics, url: string): void {
  if (
    diagnostics.pageClassification !== 'challenge' &&
    diagnostics.pageClassification !== 'login'
  ) {
    return;
  }
  throw new SourceReaderError(
    'UPSTREAM_CHALLENGE_DETECTED',
    'NovelCool returned an access challenge instead of readable content',
    {
      retryable: true,
      fallbackAllowed: true,
      details: { url, ...diagnostics }
    }
  );
}

function extractChapters(
  document: PluginHtmlDocument,
  context: PluginContext,
  finalUrl: string
): Array<{ index: number; title: string; url: string }> {
  let nodes = [] as ReturnType<PluginHtmlDocument['all']>;
  for (const selector of novelCoolChapterSelectors) {
    const matches = document.all(selector);
    if (matches.length > 0) {
      nodes = matches;
      break;
    }
  }
  if (nodes.length === 0) nodes = document.all('a');

  const seen = new Set<string>();
  const candidates: Array<{ title: string; url: string }> = [];
  for (const node of nodes) {
    const href = node.attr('href')?.trim();
    if (!href) continue;
    const resolved = context.url.resolve(href, finalUrl);
    if (!isChapterUrl(resolved, finalUrl)) continue;
    const normalized = new URL(resolved);
    normalized.hash = '';
    const normalizedUrl = normalized.toString();
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    candidates.push({
      title:
        cleanSourceText(node.text('span')) ||
        cleanSourceText(node.text()) ||
        `Chapter ${candidates.length + 1}`,
      url: normalizedUrl
    });
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

export const novelCoolPlugin: SourceReaderPlugin = {
  manifest: novelCoolManifest,

  async identify({ url }) {
    const normalized = new URL(url);
    normalized.hostname = normalized.hostname.toLowerCase().replace(/^www\./, '');
    return {
      data: {
        normalizedUrl: normalized.toString(),
        domain: normalized.hostname,
        pageType: normalized.pathname.includes('/chapter/') ? 'chapter' : 'novel'
      }
    };
  },

  async readMetadata({ url }, context) {
    const response = await context.http.get(url);
    const finalUrl = response.url || url;
    const document = context.html.load(response.data);
    const diagnostics = classifyNovelCoolPage({ html: response.data, finalUrl, document });
    assertUsablePage(diagnostics, url);
    const title = firstText(document, ['h1.novel-title', 'h1', '.bookinfo h1']);
    if (title.length < 2) {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'NovelCool title was not found', {
        retryable: false,
        fallbackAllowed: true,
        details: { url, ...diagnostics }
      });
    }

    const cover = firstAttr(document, ['img.book-cover', '.bookinfo img', '.cover img'], 'src');
    return {
      data: {
        title,
        sourceUrl: context.url.normalize(finalUrl),
        sourceName: 'NovelCool',
        author: firstText(document, ['.author', '.bookinfo .author']) || undefined,
        coverUrl: cover ? context.url.resolve(cover, finalUrl) : undefined,
        description: firstText(document, ['.summary', '.description', '#summary']) || undefined
      },
      cacheHints: {
        scope: 'public',
        ttlMs: 30 * 60_000,
        staleWhileRevalidateMs: 6 * 60 * 60_000
      }
    };
  },

  async readChapterList({ url, cursor }, context) {
    if (cursor) {
      throw new SourceReaderError('CURSOR_INVALID', 'NovelCool uses module-managed cursors', {
        retryable: false,
        fallbackAllowed: false
      });
    }

    const response = await context.http.get(url);
    const finalUrl = response.url || url;
    const document = context.html.load(response.data);
    const diagnostics = classifyNovelCoolPage({ html: response.data, finalUrl, document });
    assertUsablePage(diagnostics, url);
    const candidates = extractChapters(document, context, finalUrl);
    if (candidates.length === 0) {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'NovelCool chapter list is empty', {
        retryable: false,
        fallbackAllowed: true,
        details: { url, ...diagnostics }
      });
    }

    return {
      data: { items: candidates, hasMore: false },
      cacheHints: {
        scope: 'public',
        ttlMs: 5 * 60_000,
        staleWhileRevalidateMs: 60 * 60_000
      }
    };
  },

  async readChapterContent({ url }, context) {
    const response = await context.http.get(url);
    const finalUrl = response.url || url;
    const document = context.html.load(response.data);
    const diagnostics = classifyNovelCoolPage({ html: response.data, finalUrl, document });
    assertUsablePage(diagnostics, url);
    const title = firstText(document, ['h1.chapter-title', '.chapter-title', 'h1']) || 'Chapter';
    document.remove(
      'script,style,noscript,nav,header,footer,aside,form,button,.ads,.advertisement'
    );
    const rawText = chapterContent(document);
    const cleanText = sanitizeChapterText(rawText, title);
    if (cleanText.length < env.minChapterContentChars) {
      throw new SourceReaderError(
        'PLUGIN_RESULT_INVALID',
        'NovelCool chapter content is too short',
        {
          retryable: false,
          fallbackAllowed: true,
          details: {
            url,
            ...diagnostics,
            minChapterContentChars: env.minChapterContentChars,
            actualChars: cleanText.length
          }
        }
      );
    }

    return {
      data: { title, url: context.url.normalize(finalUrl), rawText, cleanText },
      cacheHints: { scope: 'public', ttlMs: 30 * 24 * 60 * 60_000, immutable: true }
    };
  }
};
