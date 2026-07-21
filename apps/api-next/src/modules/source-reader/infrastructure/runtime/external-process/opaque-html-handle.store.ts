import { randomUUID } from 'node:crypto';
import type { PluginHtmlDocument, PluginHtmlNode } from '../../../domain/plugin/source-plugin.js';

const MAX_DOCUMENTS_PER_REQUEST = 32;
const MAX_NODES_PER_REQUEST = 2_048;

export class OpaqueHtmlHandleStore {
  private readonly documents = new Map<string, PluginHtmlDocument>();
  private readonly nodes = new Map<string, PluginHtmlNode>();

  constructor(private readonly htmlService: { load(source: string): PluginHtmlDocument }) {}

  load(source: string): string {
    if (this.documents.size >= MAX_DOCUMENTS_PER_REQUEST) {
      throw new Error('Sandbox HTML document limit exceeded');
    }
    const id = randomUUID();
    this.documents.set(id, this.htmlService.load(source));
    return id;
  }

  text(documentId: string, selector: string): string {
    return this.document(documentId).text(selector);
  }

  attr(documentId: string, selector: string, name: string): string | undefined {
    return this.document(documentId).attr(selector, name);
  }

  html(documentId: string, selector: string): string {
    return this.document(documentId).html(selector);
  }

  all(documentId: string, selector: string): string[] {
    const selected = this.document(documentId).all(selector);
    if (this.nodes.size + selected.length > MAX_NODES_PER_REQUEST) {
      throw new Error('Sandbox HTML node limit exceeded');
    }
    return selected.map((node) => {
      const id = randomUUID();
      this.nodes.set(id, node);
      return id;
    });
  }

  remove(documentId: string, selector: string): void {
    this.document(documentId).remove(selector);
  }

  nodeText(nodeId: string, selector?: string): string {
    return this.node(nodeId).text(selector);
  }

  nodeAttr(nodeId: string, name: string): string | undefined {
    return this.node(nodeId).attr(name);
  }

  nodeHtml(nodeId: string, selector?: string): string {
    return this.node(nodeId).html(selector);
  }

  release(): void {
    this.documents.clear();
    this.nodes.clear();
  }

  private document(id: string): PluginHtmlDocument {
    const document = this.documents.get(id);
    if (!document) throw new Error('Unknown or expired HTML document handle');
    return document;
  }

  private node(id: string): PluginHtmlNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error('Unknown or expired HTML node handle');
    return node;
  }
}
