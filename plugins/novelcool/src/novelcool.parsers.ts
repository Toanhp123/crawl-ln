import type {
  ExternalPluginHtmlDocument,
  ExternalPluginHtmlNode
} from '@novel-tool/source-plugin-sdk';

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

export async function firstText(
  document: ExternalPluginHtmlDocument,
  selectors: readonly string[]
): Promise<string> {
  for (const selector of selectors) {
    const value = cleanSourceText(await document.text(selector));
    if (value) return value;
  }
  return '';
}

export async function firstAttr(
  document: ExternalPluginHtmlDocument,
  selectors: readonly string[],
  attribute: string
): Promise<string | undefined> {
  for (const selector of selectors) {
    const value = (await document.attr(selector, attribute))?.trim();
    if (value) return value;
  }
  return undefined;
}

export async function firstNodeText(
  node: ExternalPluginHtmlNode,
  selectors: readonly string[]
): Promise<string> {
  for (const selector of selectors) {
    const value = cleanSourceText(await node.text(selector));
    if (value) return value;
  }
  return cleanSourceText(await node.text());
}
