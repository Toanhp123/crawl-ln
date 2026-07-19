import type { AnalyzeNovelResult, ChapterContentResult } from '../models/crawler-contracts.js';
import { env } from '../../../../shared/config/env.js';
import { CrawlerBadRequestError } from '../errors/crawler.error.js';
import type { CrawlerEnginePort } from '../ports/crawler-engine.port.js';
import type { SourceDetectorPort } from '../ports/source-detector.port.js';
import type { HttpClientPort } from '../../domain/http/http-client.port.js';
import type {
  HtmlDocumentPort,
  HtmlNode,
  HtmlParserPort
} from '../../domain/parser/html-parser.port.js';
import type { SelectorValue } from '../../domain/source/source-profile.js';
import { absoluteUrl } from '../../domain/source/url-normalizer.js';
import {
  chapterUrlDedupKey,
  normalizeChapterUrl
} from '../../domain/url/chapter-source-url-key.js';
export { chapterUrlDedupKey } from '../../domain/url/chapter-source-url-key.js';
import { sanitizeChapterText } from './chapter-content-sanitizer.js';

function cleanText(text: string | undefined) {
  return (text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function firstText(value: string | undefined, fallback: string) {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : fallback;
}

function selectors(value: SelectorValue | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstNonEmptyText(document: HtmlDocumentPort, value: SelectorValue | undefined): string {
  for (const selector of selectors(value)) {
    const text = cleanText(document.text(selector));
    if (text.length > 0) return text;
  }
  return '';
}

function firstNonEmptyAttr(
  document: HtmlDocumentPort,
  value: SelectorValue | undefined,
  attr: string
): string | undefined {
  for (const selector of selectors(value)) {
    const result = document.attr(selector, attr);
    if (result && result.trim().length > 0) return result.trim();
  }
  return undefined;
}

export function dedupeChapterCandidates(
  candidates: Array<{ title: string; url: string }>
): Array<{ title: string; url: string }> {
  const positions = new Map<string, number>();
  const result: Array<{ title: string; url: string }> = [];
  for (const candidate of candidates) {
    const key = chapterUrlDedupKey(candidate.url);
    const position = positions.get(key);
    if (position === undefined) {
      positions.set(key, result.length);
      result.push(candidate);
      continue;
    }
    const current = result[position];
    const currentGeneric = /^(chapter|chap|chương)(?:\s+\d+)?$/i.test(current.title.trim());
    const candidateGeneric = /^(chapter|chap|chương)(?:\s+\d+)?$/i.test(candidate.title.trim());
    if (
      (currentGeneric && !candidateGeneric) ||
      candidate.title.trim().length > current.title.trim().length
    )
      result[position] = candidate;
  }
  return result;
}

function firstNonEmptyNodeText(
  document: HtmlDocumentPort,
  node: HtmlNode,
  value: SelectorValue | undefined
): string {
  for (const selector of selectors(value)) {
    const text = cleanText(document.nodeText(node, selector));
    if (text.length > 0) return text;
  }
  return cleanText(document.nodeText(node));
}

function firstMatchingNodes(document: HtmlDocumentPort, value: SelectorValue): HtmlNode[] {
  for (const selector of selectors(value)) {
    const nodes = document.queryAll(selector);
    if (nodes.length > 0) return nodes;
  }
  return [];
}

function htmlToReadableText(html: string): string {
  return cleanText(
    html
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n\n')
      .replace(/<\s*\/div\s*>/gi, '\n')
      .replace(/<\s*\/h[1-6]\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
  );
}

function firstReadableContent(document: HtmlDocumentPort, value: SelectorValue): string {
  for (const selector of selectors(value)) {
    const html = document.html(selector);
    const fromHtml = htmlToReadableText(html);
    if (fromHtml.length > 0) return fromHtml;

    const fromText = cleanText(document.text(selector));
    if (fromText.length > 0) return fromText;
  }
  return '';
}

export function selectChapterRawText(document: HtmlDocumentPort, value: SelectorValue): string {
  return firstText(firstReadableContent(document, value), cleanText(document.text('body')));
}

export class CrawlerEngineService implements CrawlerEnginePort {
  constructor(
    private readonly detector: SourceDetectorPort,
    private readonly httpClient: HttpClientPort,
    private readonly parser: HtmlParserPort
  ) {}

  async analyze(url: string): Promise<AnalyzeNovelResult> {
    const profile = await this.requireProfile(url);
    const response = await this.httpClient.get(url, {
      timeoutMs: profile.http?.timeoutMs,
      headers: profile.http?.userAgent
        ? { ...profile.http?.headers, 'User-Agent': profile.http.userAgent }
        : profile.http?.headers
    });
    const document = this.parser.load(response.data);
    const title = firstText(
      firstNonEmptyText(document, profile.selectors.title),
      new URL(url).hostname
    );
    const author = profile.selectors.author
      ? cleanText(firstNonEmptyText(document, profile.selectors.author))
      : undefined;
    const coverHref = firstNonEmptyAttr(document, profile.selectors.cover, 'src');
    const description = profile.selectors.description
      ? cleanText(firstNonEmptyText(document, profile.selectors.description))
      : undefined;

    const rawChapterCandidates: Array<{ title: string; url: string }> = [];
    for (const node of firstMatchingNodes(document, profile.selectors.chapterLinks)) {
      const href = document.nodeAttr(node, 'href');
      if (!href) continue;
      const absolute = normalizeChapterUrl(absoluteUrl(href, url));
      const chapterTitle = firstNonEmptyNodeText(document, node, profile.selectors.chapterTitle);
      rawChapterCandidates.push({
        title: firstText(chapterTitle, `Chapter ${rawChapterCandidates.length + 1}`),
        url: absolute
      });
    }
    const chapterCandidates = dedupeChapterCandidates(rawChapterCandidates);
    const orderedChapterCandidates =
      profile.chapterListOrder === 'newest-first'
        ? [...chapterCandidates].reverse()
        : chapterCandidates;
    const chapters = orderedChapterCandidates.map((item, index) => ({
      index: index + 1,
      ...item
    }));

    return {
      title,
      sourceUrl: url,
      sourceName: profile.name,
      author: author || undefined,
      coverUrl: coverHref ? absoluteUrl(coverHref, url) : undefined,
      description: description || undefined,
      chapters
    };
  }

  async fetchChapter(url: string, signal?: AbortSignal): Promise<ChapterContentResult> {
    const profile = await this.requireProfile(url);
    const response = await this.httpClient.get(url, {
      timeoutMs: profile.http?.timeoutMs,
      headers: profile.http?.userAgent
        ? { ...profile.http?.headers, 'User-Agent': profile.http.userAgent }
        : profile.http?.headers,
      signal
    });
    const document = this.parser.load(response.data);
    const title = firstText(
      firstNonEmptyText(document, profile.selectors.chapterTitle ?? profile.selectors.title),
      'Chapter'
    );
    document.remove(
      [
        'script',
        'style',
        'noscript',
        'nav',
        'header',
        'footer',
        'aside',
        'form',
        'button',
        ...(profile.selectors.remove ?? [])
      ].join(',')
    );
    const rawText = selectChapterRawText(document, profile.selectors.chapterContent);
    const normalized = sanitizeChapterText(rawText, title);
    if (normalized.length < env.minChapterContentChars) {
      throw new CrawlerBadRequestError(
        'Chapter content selector returned too little text. Check source profile chapterContent/remove selectors.',
        {
          url,
          minChapterContentChars: env.minChapterContentChars,
          actualChars: normalized.length
        }
      );
    }
    return { title, url, rawText, cleanText: normalized };
  }

  private async requireProfile(url: string) {
    const profile = await this.detector.detect(url);
    if (!profile) throw new Error(`No source profile can handle ${url}`);
    return profile;
  }
}
