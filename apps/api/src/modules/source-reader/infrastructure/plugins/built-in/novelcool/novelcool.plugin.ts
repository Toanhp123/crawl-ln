import { env } from '../../../../../../shared/config/env.js';
import { sanitizeChapterText } from '../../../../../crawler/application/services/chapter-content-sanitizer.js';
import { SourceReaderError } from '../../../../domain/errors/source-reader.error.js';
import type { SourceReaderPlugin } from '../../../../domain/plugin/source-plugin.js';
import { novelCoolManifest } from './novelcool.manifest.js';
import { chapterContent, cleanSourceText, firstAttr, firstText } from './novelcool.parsers.js';

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
    const document = context.html.load(response.data);
    const title = firstText(document, ['h1.novel-title', 'h1', '.bookinfo h1']);
    if (title.length < 2) {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'NovelCool title was not found', {
        retryable: false,
        fallbackAllowed: true,
        details: { url }
      });
    }

    const cover = firstAttr(document, ['img.book-cover', '.bookinfo img', '.cover img'], 'src');
    return {
      data: {
        title,
        sourceUrl: context.url.normalize(url),
        sourceName: 'NovelCool',
        author: firstText(document, ['.author', '.bookinfo .author']) || undefined,
        coverUrl: cover ? context.url.resolve(cover, url) : undefined,
        description: firstText(document, ['.summary', '.description', '#summary']) || undefined
      },
      cacheHints: {
        scope: 'public',
        ttlMs: 30 * 60_000,
        staleWhileRevalidateMs: 6 * 60 * 60_000
      }
    };
  },

  async readChapterList({ url, cursor, limit }, context) {
    if (cursor) {
      throw new SourceReaderError('CURSOR_INVALID', 'NovelCool uses module-managed cursors', {
        retryable: false,
        fallbackAllowed: false
      });
    }

    const response = await context.http.get(url);
    const document = context.html.load(response.data);
    const candidates = document
      .all('.chapter-list a, .chapter-list li a, #chapter-list a')
      .map((node, index) => ({
        index,
        title:
          cleanSourceText(node.text('span')) ||
          cleanSourceText(node.text()) ||
          `Chapter ${index + 1}`,
        url: node.attr('href') ? context.url.resolve(node.attr('href')!, url) : ''
      }))
      .filter((chapter) => chapter.url.length > 0)
      .reverse()
      .map((chapter, index) => ({ ...chapter, index: index + 1 }));
    if (candidates.length === 0) {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'NovelCool chapter list is empty', {
        retryable: false,
        fallbackAllowed: true,
        details: { url }
      });
    }

    const items = candidates.slice(0, limit);
    return {
      data: { items, hasMore: candidates.length > items.length },
      cacheHints: {
        scope: 'public',
        ttlMs: 5 * 60_000,
        staleWhileRevalidateMs: 60 * 60_000
      }
    };
  },

  async readChapterContent({ url }, context) {
    const response = await context.http.get(url);
    const document = context.html.load(response.data);
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
            minChapterContentChars: env.minChapterContentChars,
            actualChars: cleanText.length
          }
        }
      );
    }

    return {
      data: { title, url: context.url.normalize(url), rawText, cleanText },
      cacheHints: { scope: 'public', ttlMs: 30 * 24 * 60 * 60_000, immutable: true }
    };
  }
};
