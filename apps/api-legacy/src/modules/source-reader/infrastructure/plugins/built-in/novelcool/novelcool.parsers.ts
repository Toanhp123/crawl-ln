import type { PluginHtmlDocument } from '../../../../domain/plugin/source-plugin.js';

export function cleanSourceText(value: string | undefined): string {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function firstText(document: PluginHtmlDocument, selectors: string[]): string {
  for (const selector of selectors) {
    const value = cleanSourceText(document.text(selector));
    if (value) return value;
  }
  return '';
}

export function firstAttr(
  document: PluginHtmlDocument,
  selectors: string[],
  attribute: string
): string | undefined {
  for (const selector of selectors) {
    const value = document.attr(selector, attribute)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function chapterContent(document: PluginHtmlDocument): string {
  for (const selector of [
    '.overflow-hidden:has(.chapter-start-mark)',
    '.chapter-content',
    '#chapter-content',
    '.reading-content'
  ]) {
    const value = cleanSourceText(document.text(selector));
    if (value) return value;
  }
  return '';
}
