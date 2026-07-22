import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { CheerioHtmlParserAdapter } from '../../apps/api-legacy/src/shared/infrastructure/html/cheerio-html-parser.adapter.ts';
import { PluginContextFactory } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';
import { ExternalProcessSupervisor } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts';

const deadline = () => new Date(Date.now() + 10_000).toISOString();

async function createPluginFixture(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'source-reader-context-parity-'));
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(
    resolve(root, 'dist/index.js'),
    `let retainedDocument;
    export async function invokeCapability(_payload, context) {
      if (_payload.request?.mode === 'reuse-retained') {
        return { data: { retainedText: await retainedDocument.text('li') } };
      }
      const document = context.html.load('<ul><li data-id="one"><b>A</b></li><li data-id="two">B</li></ul><div class="ad">Advertisement</div>');
      retainedDocument = document;
      const nodes = await document.all('li');
      const items = [];
      for (const node of nodes) {
        items.push({
          text: await node.text(),
          childText: await node.text('b'),
          id: await node.attr('data-id'),
          html: await node.html(),
          keys: Object.keys(node).sort()
        });
      }
      await document.remove('.ad');
      await context.browser.open('https://example.com/novel');
      await context.browser.waitFor('h1');
      const title = await context.browser.text('h1');
      const mainHtml = await context.browser.html('main');
      await context.browser.click('button.next');
      await context.browser.fillSecret('input[name=password]', { credentialId: 'cred-1', field: 'password' });
      const cookies = await context.browser.cookies();
      return {
        data: {
          count: nodes.length,
          items,
          advertisementAfterRemove: await document.text('.ad'),
          bodyAfterRemove: await document.html('body'),
          browser: { title, mainHtml, cookies }
        }
      };
    }`
  );
  return root;
}

function createHostContext(browserCalls: string[]) {
  const browserSession = {
    id: 'browser-1',
    async open(url: string) {
      browserCalls.push(`open:${url}`);
    },
    async waitFor(selector: string) {
      browserCalls.push(`waitFor:${selector}`);
    },
    async text(selector: string) {
      browserCalls.push(`text:${selector}`);
      return 'Fixture Title';
    },
    async html(selector: string) {
      browserCalls.push(`html:${selector}`);
      return '<main>Fixture</main>';
    },
    async click(selector: string) {
      browserCalls.push(`click:${selector}`);
    },
    async fillSecret(selector: string, handle: { credentialId: string; field: string }) {
      browserCalls.push(`fillSecret:${selector}:${handle.credentialId}:${handle.field}`);
    },
    async cookies() {
      browserCalls.push('cookies');
      return [{ name: 'session', value: 'opaque-cookie' }];
    },
    async close() {}
  };
  const factory = new PluginContextFactory(
    {
      async get(url: string) {
        return { url, status: 200, headers: {}, data: '' };
      },
      async post(url: string) {
        return { url, status: 200, headers: {}, data: '' };
      },
      async head(url: string) {
        return { url, status: 200, headers: {}, data: '' };
      }
    },
    new CheerioHtmlParserAdapter(),
    { now: () => new Date('2026-07-20T00:00:00.000Z') },
    { info() {}, warn() {}, error() {} }
  );
  return factory.create({
    requestId: 'request-1',
    pluginId: 'context-parity',
    pluginVersion: '1.0.0',
    capability: 'metadata',
    allowedHosts: ['example.com'],
    signal: new AbortController().signal,
    runtimeContext: {
      resolvedNetworkRoute: { kind: 'direct', identity: 'direct' },
      executionMode: 'isolated',
      browserRequired: true,
      cacheIdentity: { public: 'public', network: 'direct' }
    },
    browserSession
  });
}

test('external sandbox exposes browser and complete HTML operations through bounded RPC', async (t) => {
  const root = await createPluginFixture();
  const browserCalls: string[] = [];
  const supervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 30_000,
    cancelGraceMs: 100
  });
  t.after(() => supervisor.stop('context-parity', '1.0.0', 'test-complete'));
  const handle = await supervisor.start({
    pluginId: 'context-parity',
    pluginVersion: '1.0.0',
    packageRoot: root,
    entryPath: resolve(root, 'dist/index.js')
  });

  const result = (await handle.request(
    {
      requestId: randomUUID(),
      operation: 'invokeCapability',
      deadlineAt: deadline(),
      payload: {
        capability: 'metadata',
        request: { url: 'https://example.com/novel' },
        context: {
          now: '2026-07-20T00:00:00.000Z',
          normalizedUrl: 'https://example.com/novel',
          browserAvailable: true
        }
      }
    },
    new AbortController().signal,
    { context: createHostContext(browserCalls) }
  )) as {
    data: {
      count: number;
      items: Array<{ text: string; childText: string; id: string; html: string; keys: string[] }>;
      advertisementAfterRemove: string;
      bodyAfterRemove: string;
      browser: { title: string; mainHtml: string; cookies: Array<Record<string, unknown>> };
    };
  };

  assert.equal(result.data.count, 2);
  assert.deepEqual(result.data.items, [
    { text: 'A', childText: 'A', id: 'one', html: '<b>A</b>', keys: ['attr', 'html', 'text'] },
    { text: 'B', childText: '', id: 'two', html: 'B', keys: ['attr', 'html', 'text'] }
  ]);
  assert.equal(result.data.advertisementAfterRemove, '');
  assert.doesNotMatch(result.data.bodyAfterRemove, /Advertisement/);
  assert.deepEqual(result.data.browser, {
    title: 'Fixture Title',
    mainHtml: '<main>Fixture</main>',
    cookies: [{ name: 'session', value: 'opaque-cookie' }]
  });
  assert.deepEqual(browserCalls, [
    'open:https://example.com/novel',
    'waitFor:h1',
    'text:h1',
    'html:main',
    'click:button.next',
    'fillSecret:input[name=password]:cred-1:password',
    'cookies'
  ]);

  await assert.rejects(() =>
    handle.request(
      {
        requestId: randomUUID(),
        operation: 'invokeCapability',
        deadlineAt: deadline(),
        payload: {
          capability: 'metadata',
          request: { url: 'https://example.com/novel', mode: 'reuse-retained' },
          context: {
            now: '2026-07-20T00:00:00.000Z',
            normalizedUrl: 'https://example.com/novel',
            browserAvailable: true
          }
        }
      },
      new AbortController().signal,
      { context: createHostContext([]) }
    )
  );
});

test('in-process HTML nodes expose text, attributes, and selected node HTML', () => {
  const context = createHostContext([]);
  const nodes = context.html.load('<ul><li data-id="one"><b>A</b></li></ul>').all('li');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]?.text(), 'A');
  assert.equal(nodes[0]?.text('b'), 'A');
  assert.equal(nodes[0]?.attr('data-id'), 'one');
  assert.equal(nodes[0]?.html(), '<b>A</b>');
});
