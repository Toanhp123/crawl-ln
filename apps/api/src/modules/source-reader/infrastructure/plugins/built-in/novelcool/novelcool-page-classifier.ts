import type { PluginHtmlDocument } from '../../../../domain/plugin/source-plugin.js';
import { cleanSourceText } from './novelcool.parsers.js';

export const novelCoolChapterSelectors = [
  '.chapter-list a',
  '#chapter-list a',
  '.list-chapter a',
  '.chapter-list-page a',
  '.list-chapter-item a',
  'a.chapter-name'
] as const;

export type NovelCoolPageClassification = 'challenge' | 'login' | 'novel' | 'chapter' | 'unknown';

export interface NovelCoolPageDiagnostics {
  pageClassification: NovelCoolPageClassification;
  title: string;
  finalUrl: string;
  selectorCounts: Record<string, number>;
}

const challengeTitleMarkers = [
  'verify you are human',
  'checking your browser',
  'just a moment',
  'attention required',
  'access denied',
  'temporarily blocked'
];

const challengeBodyMarkers = [
  'verify you are human',
  'checking your browser before accessing',
  'enable javascript and cookies to continue',
  'complete the security check',
  'cf-chl-widget'
];

const challengeSelectors = [
  '#challenge-form',
  '.cf-challenge',
  '[id^="cf-chl"]',
  'form[action*="/cdn-cgi/"]',
  'iframe[src*="captcha"]',
  '[data-sitekey]'
] as const;

function redactedTitle(document: PluginHtmlDocument): string {
  return cleanSourceText(document.text('title')).slice(0, 160);
}

export function countNovelCoolChapterSelectors(
  document: PluginHtmlDocument
): Record<string, number> {
  return Object.fromEntries(
    novelCoolChapterSelectors.map((selector) => [selector, document.all(selector).length])
  );
}

export function classifyNovelCoolPage(input: {
  html: string;
  finalUrl: string;
  document: PluginHtmlDocument;
}): NovelCoolPageDiagnostics {
  const title = redactedTitle(input.document);
  const normalizedTitle = title.toLowerCase();
  const normalizedBody = input.html.slice(0, 200_000).toLowerCase();
  const finalUrl = input.finalUrl;
  const selectorCounts = countNovelCoolChapterSelectors(input.document);
  const hasReadableContent =
    Boolean(cleanSourceText(input.document.text('h1.novel-title'))) ||
    Boolean(cleanSourceText(input.document.text('.bookinfo h1'))) ||
    Boolean(cleanSourceText(input.document.text('.chapter-title'))) ||
    Object.values(selectorCounts).some((count) => count > 0);
  const hasChallengeStructure = challengeSelectors.some(
    (selector) => input.document.all(selector).length > 0
  );
  const hasChallengeTitle = challengeTitleMarkers.some((marker) =>
    normalizedTitle.includes(marker)
  );
  const hasChallengeBody =
    !hasReadableContent && challengeBodyMarkers.some((marker) => normalizedBody.includes(marker));

  let pageClassification: NovelCoolPageClassification = 'unknown';
  if (hasChallengeStructure || hasChallengeTitle || hasChallengeBody) {
    pageClassification = 'challenge';
  } else if (/\/login(?:\.html)?(?:[/?#]|$)/i.test(finalUrl) || /\blog\s*in\b/i.test(title)) {
    pageClassification = 'login';
  } else if (
    /\/chapter\//i.test(finalUrl) ||
    cleanSourceText(input.document.text('.chapter-title'))
  ) {
    pageClassification = 'chapter';
  } else if (
    cleanSourceText(input.document.text('h1.novel-title')) ||
    cleanSourceText(input.document.text('.bookinfo h1')) ||
    Object.values(selectorCounts).some((count) => count > 0)
  ) {
    pageClassification = 'novel';
  }

  return { pageClassification, title, finalUrl, selectorCounts };
}
