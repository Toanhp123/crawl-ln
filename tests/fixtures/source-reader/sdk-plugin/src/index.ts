import type { ExternalSourcePlugin, SourcePluginManifest } from '@novel-tool/source-plugin-sdk';

export const manifest = {
  id: 'fiction-example',
  name: 'Fiction Example',
  version: '1.0.0',
  engines: { sourceReader: '^2.9.6' },
  capabilities: ['identify', 'metadata', 'chapter-list', 'chapter-content'],
  contracts: {
    identify: 1,
    metadata: 1,
    'chapter-list': 1,
    'chapter-content': 1
  },
  matchers: [{ hosts: ['fiction.example'], priority: 100 }],
  runtime: { preferredMode: 'isolated' },
  permissions: { network: { hosts: ['fiction.example'] } }
} satisfies SourcePluginManifest;

const plugin = {
  async probeCanHandle(request) {
    return request.domain === 'fiction.example';
  },
  async identify(request, context) {
    return {
      data: {
        normalizedUrl: await context.url.normalize(request.url),
        domain: 'fiction.example',
        pageType: 'novel'
      }
    };
  },
  async readMetadata(request, context) {
    const response = await context.http.get(request.url);
    const document = context.html.load(response.data);
    await context.logger.info('Reading metadata', { url: request.url });
    return {
      data: {
        title: await document.text('h1'),
        sourceUrl: response.url,
        sourceName: 'Fiction Example'
      }
    };
  },
  async readChapterList(request, context) {
    const response = await context.http.get(request.url);
    const document = context.html.load(response.data);
    const nodes = await document.all('.chapter-list a');
    const items = [];
    for (const [index, node] of nodes.entries()) {
      const href = await node.attr('href');
      if (!href) continue;
      items.push({
        index: index + 1,
        title: await node.text(),
        url: await context.url.resolve(href, response.url)
      });
    }
    return { data: { items, hasMore: false } };
  },
  async readChapterContent(request, context) {
    const response = await context.http.get(request.url);
    const document = context.html.load(response.data);
    await document.remove('.advertisement');
    const cleanText = await document.text('.chapter-content');
    return {
      data: {
        title: await document.text('h1'),
        url: response.url,
        rawText: await document.html('.chapter-content'),
        cleanText
      }
    };
  }
} satisfies ExternalSourcePlugin;

export default plugin;
