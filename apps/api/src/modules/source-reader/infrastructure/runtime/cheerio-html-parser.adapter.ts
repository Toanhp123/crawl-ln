import * as cheerio from 'cheerio';
import type {
  HtmlDocumentPort,
  HtmlNode,
  HtmlParserPort
} from '../../application/ports/runtime-support.ports.js';

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

  nodeHtml(node: HtmlNode, selector?: string) {
    const root = this.$(node as never);
    return (selector ? root.find(selector).first().html() : root.html()) ?? '';
  }

  remove(selector: string) {
    this.$(selector).remove();
  }
}

export class CheerioHtmlParserAdapter implements HtmlParserPort {
  load(html: string): HtmlDocumentPort {
    return new CheerioHtmlDocument(cheerio.load(html));
  }
}
