import * as cheerio from 'cheerio';
import type { HtmlDocumentPort, HtmlNode, HtmlParserPort } from '../../ports/html-parser.port.js';

function decodeJavaScriptStringLiteral(literal: string): string {
  if (literal.startsWith('"')) {
    try {
      return JSON.parse(literal) as string;
    } catch {
      return '';
    }
  }

  const body = literal.slice(1, -1);
  return body
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function materializeDocumentWrites(html: string): string {
  return html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (scriptTag, scriptBody: string) => {
    const writes = [...scriptBody.matchAll(/document\.write\s*\(([\s\S]*?)\)\s*;?/g)];
    if (writes.length === 0) return scriptTag;

    const emitted = writes
      .map((write) => {
        const expression = write[1] ?? '';
        const literals = expression.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g) ?? [];
        return literals.map(decodeJavaScriptStringLiteral).join('');
      })
      .join('')
      .replace(/"(?=(?:class|id|style|offset_left|data-[\w-]+)=)/g, '" ');

    return emitted || scriptTag;
  });
}

function cleanText(value: string) {
  return value
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export class CheerioHtmlDocument implements HtmlDocumentPort {
  constructor(private readonly $: cheerio.CheerioAPI) {}

  text(selector: string) {
    return cleanText(this.$(selector).first().text());
  }

  attr(selector: string, name: string) {
    return this.$(selector).first().attr(name);
  }

  html(selector: string) {
    return this.$(selector).first().html() ?? '';
  }

  queryAll(selector: string): HtmlNode[] {
    return this.$(selector).toArray();
  }

  nodeText(node: HtmlNode, selector?: string) {
    const root = this.$(node as never);
    return cleanText(selector ? root.find(selector).first().text() : root.text());
  }

  nodeAttr(node: HtmlNode, name: string) {
    return this.$(node as never).attr(name);
  }

  remove(selector: string) {
    this.$(selector).remove();
  }
}

export class CheerioHtmlParserAdapter implements HtmlParserPort {
  load(html: string): HtmlDocumentPort {
    return new CheerioHtmlDocument(cheerio.load(materializeDocumentWrites(html)));
  }
}
