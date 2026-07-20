export type HtmlNode = unknown;

export interface HtmlDocumentPort {
  text(selector: string): string;
  attr(selector: string, name: string): string | undefined;
  html(selector: string): string;
  queryAll(selector: string): HtmlNode[];
  nodeText(node: HtmlNode): string;
  nodeText(node: HtmlNode, selector: string): string;
  nodeAttr(node: HtmlNode, name: string): string | undefined;
  nodeHtml(node: HtmlNode, selector?: string): string;
  remove(selector: string): void;
}

export interface HtmlParserPort {
  load(html: string): HtmlDocumentPort;
}
