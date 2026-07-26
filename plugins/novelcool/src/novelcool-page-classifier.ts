import type { ExternalPluginHtmlDocument } from '@novel-tool/source-plugin-sdk';
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

const strongChallengeSelectors = [
  '#challenge-form',
  '.cf-challenge',
  '[id^="cf-chl"]',
  'form[action*="/cdn-cgi/"]'
] as const;

const interactiveChallengeSelectors = ['iframe[src*="captcha"]', '[data-sitekey]'] as const;

async function redactedTitle(document: ExternalPluginHtmlDocument): Promise<string> {
  return (await document.text('title')).slice(0, 160).trim();
}

export async function countNovelCoolChapterSelectors(
  document: ExternalPluginHtmlDocument
): Promise<Record<string, number>> {
  const counts = await Promise.all(
    novelCoolChapterSelectors.map(
      async (selector) => [selector, (await document.all(selector)).length] as const
    )
  );
  return Object.fromEntries(counts);
}

export async function classifyNovelCoolPage(input: {
  html: string;
  finalUrl: string;
  document: ExternalPluginHtmlDocument;
}): Promise<NovelCoolPageDiagnostics> {
  const title = cleanSourceText(await redactedTitle(input.document));
  const normalizedTitle = title.toLowerCase();
  const normalizedBody = input.html.slice(0, 200_000).toLowerCase();
  const selectorCounts = await countNovelCoolChapterSelectors(input.document);
  const hasReadableContent = Boolean(
    cleanSourceText(await input.document.text('h1.novel-title')) ||
    cleanSourceText(await input.document.text('.bookinfo h1')) ||
    cleanSourceText(await input.document.text('.chapter-title')) ||
    Object.values(selectorCounts).some((count) => count > 0)
  );
  const strongChallengeChecks = await Promise.all(
    strongChallengeSelectors.map(
      async (selector) => (await input.document.all(selector)).length > 0
    )
  );
  const interactiveChallengeChecks = await Promise.all(
    interactiveChallengeSelectors.map(
      async (selector) => (await input.document.all(selector)).length > 0
    )
  );
  const hasStrongChallengeStructure = strongChallengeChecks.some(Boolean);
  const hasInteractiveChallengeStructure =
    !hasReadableContent && interactiveChallengeChecks.some(Boolean);
  const hasChallengeTitle = challengeTitleMarkers.some((marker) =>
    normalizedTitle.includes(marker)
  );
  const hasChallengeBody =
    !hasReadableContent && challengeBodyMarkers.some((marker) => normalizedBody.includes(marker));

  let pageClassification: NovelCoolPageClassification = 'unknown';
  if (
    hasStrongChallengeStructure ||
    hasInteractiveChallengeStructure ||
    hasChallengeTitle ||
    hasChallengeBody
  ) {
    pageClassification = 'challenge';
  } else if (/\/login(?:\.html)?(?:[/?#]|$)/i.test(input.finalUrl) || /\blog\s*in\b/i.test(title)) {
    pageClassification = 'login';
  } else if (
    /\/chapter\//i.test(input.finalUrl) ||
    cleanSourceText(await input.document.text('.chapter-title'))
  ) {
    pageClassification = 'chapter';
  } else if (
    cleanSourceText(await input.document.text('h1.novel-title')) ||
    cleanSourceText(await input.document.text('.bookinfo h1')) ||
    Object.values(selectorCounts).some((count) => count > 0)
  ) {
    pageClassification = 'novel';
  }

  return { pageClassification, title, finalUrl: input.finalUrl, selectorCounts };
}
