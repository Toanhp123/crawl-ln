import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DynamicSourcePluginRegistry } from '../../apps/api/src/modules/plugin/infrastructure/runtime/dynamic-source-plugin.registry.js';

const http = {
  async get(url: string) {
    return { url, status: 200, headers: {}, data: '<html></html>' };
  },
  async post() {
    throw new Error('unused');
  },
  async head() {
    throw new Error('unused');
  }
};
const parser = {
  load() {
    return {
      text: () => '',
      attr: () => undefined,
      html: () => '',
      queryAll: () => [],
      nodeText: () => '',
      nodeAttr: () => undefined,
      remove: () => undefined
    };
  }
};
const clock = { now: () => new Date('2026-07-16T00:00:00.000Z') };
const logger = { info() {}, warn() {}, error() {} };

test('dynamic source plugins load, handle URLs, persist enabled state, and reject API mismatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-plugin-'));
  try {
    const activeDir = join(root, 'active');
    await mkdir(activeDir);
    await writeFile(
      join(activeDir, 'manifest.json'),
      JSON.stringify({
        id: 'active',
        name: 'Active',
        version: '1.0.0',
        apiVersion: 2,
        priority: 100,
        match: ['example.test'],
        capabilities: ['metadata', 'chapters']
      })
    );
    await writeFile(
      join(activeDir, 'index.js'),
      `export default () => ({ analyze: async (url) => ({ title: 'Plugin Novel', sourceUrl: url, sourceName: 'active', chapters: [] }), fetchChapter: async (url) => ({ title: 'Chapter', url, rawText: 'raw', cleanText: 'clean' }) });`
    );
    const mismatchDir = join(root, 'mismatch');
    await mkdir(mismatchDir);
    await writeFile(
      join(mismatchDir, 'manifest.json'),
      JSON.stringify({
        id: 'mismatch',
        name: 'Mismatch',
        version: '1.0.0',
        apiVersion: 1,
        priority: 1,
        match: ['old.test'],
        capabilities: ['metadata']
      })
    );
    await writeFile(
      join(mismatchDir, 'index.js'),
      `export default () => ({ analyze: async () => ({}), fetchChapter: async () => ({}) });`
    );

    const stateFile = join(root, 'state.json');
    const registry = new DynamicSourcePluginRegistry(root, stateFile, http, parser, clock, logger);
    await registry.reload();
    assert.equal(registry.list().find((item) => item.manifest.id === 'active')?.status, 'active');
    assert.equal(
      registry.list().find((item) => item.manifest.id === 'mismatch')?.status,
      'api_mismatch'
    );
    const adapter = registry.handles()[0];
    assert.equal(await adapter.canHandle('https://www.example.test/book'), true);
    assert.equal((await adapter.analyze('https://example.test/book')).title, 'Plugin Novel');
    await registry.setEnabled('active', false);
    assert.equal(registry.list().find((item) => item.manifest.id === 'active')?.status, 'disabled');
    const second = new DynamicSourcePluginRegistry(root, stateFile, http, parser, clock, logger);
    await second.reload();
    assert.equal(second.list().find((item) => item.manifest.id === 'active')?.enabled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failed plugin becomes eligible again after cooldown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-plugin-recovery-'));
  try {
    const pluginDir = join(root, 'recovering');
    await mkdir(pluginDir);
    await writeFile(
      join(pluginDir, 'manifest.json'),
      JSON.stringify({
        id: 'recovering',
        name: 'Recovering',
        version: '1.0.0',
        apiVersion: 2,
        priority: 1,
        match: ['recover.test'],
        capabilities: ['metadata', 'chapters']
      })
    );
    await writeFile(
      join(pluginDir, 'index.js'),
      `export default () => ({ analyze: async () => { throw new Error('temporary'); }, fetchChapter: async () => ({}) });`
    );
    let now = new Date('2026-07-16T00:00:00.000Z');
    const registry = new DynamicSourcePluginRegistry(
      root,
      join(root, 'state.json'),
      http,
      parser,
      { now: () => now },
      logger
    );
    await registry.reload();
    const handle = registry.handles()[0]!;
    for (let i = 0; i < 5; i += 1)
      await assert.rejects(() => handle.analyze('https://recover.test/book'));
    assert.equal(await handle.canHandle('https://recover.test/book'), false);
    now = new Date('2026-07-16T00:01:01.000Z');
    assert.equal(await handle.canHandle('https://recover.test/book'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('duplicate plugin ids are reported as invalid instead of overwritten', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-plugin-duplicate-'));
  try {
    for (const directory of ['a', 'b']) {
      const pluginDir = join(root, directory);
      await mkdir(pluginDir);
      await writeFile(
        join(pluginDir, 'manifest.json'),
        JSON.stringify({
          id: 'duplicate',
          name: directory,
          version: '1.0.0',
          apiVersion: 2,
          priority: 1,
          match: ['duplicate.test'],
          capabilities: ['metadata', 'chapters']
        })
      );
      await writeFile(
        join(pluginDir, 'index.js'),
        `export default () => ({ analyze: async () => ({ title: '${directory}', sourceUrl: 'https://duplicate.test', sourceName: '${directory}', chapters: [] }), fetchChapter: async () => ({}) });`
      );
    }
    const registry = new DynamicSourcePluginRegistry(
      root,
      join(root, 'state.json'),
      http,
      parser,
      clock,
      logger
    );
    await registry.reload();
    const descriptor = registry.list().find((item) => item.manifest.id === 'duplicate');
    assert.equal(descriptor?.status, 'invalid');
    assert.match(descriptor?.error ?? '', /Duplicate plugin id duplicate/);
    assert.equal(registry.handles().length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('plugin entry cannot escape into a sibling directory with the same prefix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-plugin-entry-boundary-'));
  try {
    const pluginDir = join(root, 'demo');
    const siblingDir = join(root, 'demo-malicious');
    await mkdir(pluginDir);
    await mkdir(siblingDir);
    await writeFile(
      join(pluginDir, 'manifest.json'),
      JSON.stringify({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        apiVersion: 2,
        priority: 1,
        match: ['demo.test'],
        capabilities: ['metadata', 'chapters'],
        entry: '../demo-malicious/index.js'
      })
    );
    await writeFile(
      join(siblingDir, 'index.js'),
      `export default () => ({ analyze: async () => ({ title: 'escaped', sourceUrl: 'https://demo.test', sourceName: 'demo', chapters: [] }), fetchChapter: async () => ({}) });`
    );
    const registry = new DynamicSourcePluginRegistry(
      root,
      join(root, 'state.json'),
      http,
      parser,
      clock,
      logger
    );
    await registry.reload();
    const descriptor = registry.list().find((item) => item.manifest.id === 'demo');
    assert.equal(descriptor?.status, 'invalid');
    assert.match(descriptor?.error ?? '', /inside its plugin directory/);
    assert.equal(registry.handles().length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent plugin reloads finish with the newest implementation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-plugin-reload-race-'));
  try {
    const pluginDir = join(root, 'race');
    await mkdir(pluginDir);
    await writeFile(
      join(pluginDir, 'manifest.json'),
      JSON.stringify({
        id: 'race',
        name: 'Race',
        version: '1.0.0',
        apiVersion: 2,
        priority: 1,
        match: ['race.test'],
        capabilities: ['metadata', 'chapters']
      })
    );
    await writeFile(
      join(pluginDir, 'index.js'),
      `export default async () => { await new Promise((resolve) => setTimeout(resolve, 120)); return { analyze: async (url) => ({ title: 'old', sourceUrl: url, sourceName: 'race', chapters: [] }), fetchChapter: async () => ({}) }; };`
    );
    const registry = new DynamicSourcePluginRegistry(
      root,
      join(root, 'state.json'),
      http,
      parser,
      clock,
      logger
    );
    const first = registry.reload();
    await new Promise((resolve) => setTimeout(resolve, 25));
    await writeFile(
      join(pluginDir, 'index.js'),
      `export default () => ({ analyze: async (url) => ({ title: 'new', sourceUrl: url, sourceName: 'race', chapters: [] }), fetchChapter: async () => ({}) });`
    );
    const second = registry.reload();
    await Promise.all([first, second]);
    const result = await registry.handles()[0]!.analyze('https://race.test/book');
    assert.equal(result.title, 'new');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
