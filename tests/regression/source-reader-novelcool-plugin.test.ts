import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CheerioHtmlParserAdapter } from '../../apps/api/src/shared/infrastructure/html/cheerio-html-parser.adapter.ts';
import { novelCoolPlugin } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts';
import type { PluginContext } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';
import { assertPluginContract } from '../helpers/source-reader-plugin-contract.ts';

const novelHtml = await readFile('tests/fixtures/source-reader/novelcool-novel.html', 'utf8');
const chapterHtml = await readFile('tests/fixtures/source-reader/novelcool-chapter.html', 'utf8');
const parser = new CheerioHtmlParserAdapter();

const context = (html: string): PluginContext => ({
  http: {
    get: async (url) => ({ url, status: 200, headers: {}, data: html })
  },
  html: {
    load: (source) => {
      const document = parser.load(source);
      return {
        text: (selector) => document.text(selector),
        attr: (selector, name) => document.attr(selector, name),
        html: (selector) => document.html(selector),
        remove: (selector) => document.remove(selector),
        all: (selector) =>
          document.queryAll(selector).map((node) => ({
            text: (child) => (child ? document.nodeText(node, child) : document.nodeText(node)),
            attr: (name) => document.nodeAttr(node, name),
            html: () => ''
          }))
      };
    }
  },
  url: {
    normalize: (value) => value,
    resolve: (value, base) => new URL(value, base).toString()
  },
  cache: { get: async () => undefined, set: async () => undefined },
  logger: { info() {}, warn() {} },
  clock: { now: () => '2026-07-19T00:00:00.000Z' },
  signal: new AbortController().signal
});

test('NovelCool plugin satisfies declared capabilities', () => {
  assertPluginContract(novelCoolPlugin);
});

test('NovelCool plugin normalizes metadata and oldest-first chapters', async () => {
  const metadata = await novelCoolPlugin.readMetadata!(
    { url: 'https://www.novelcool.com/novel/fixture.html' },
    context(novelHtml)
  );
  assert.equal(metadata.data.title, 'Fixture Novel');
  assert.equal(metadata.data.author, 'Fixture Author');

  const chapters = await novelCoolPlugin.readChapterList!(
    { url: 'https://www.novelcool.com/novel/fixture.html', limit: 100 },
    context(novelHtml)
  );
  assert.deepEqual(
    chapters.data.items.map((item) => item.title),
    ['Chapter 1', 'Chapter 2']
  );
});

test('NovelCool plugin extracts and sanitizes chapter content', async () => {
  const result = await novelCoolPlugin.readChapterContent!(
    { url: 'https://www.novelcool.com/chapter/fixture-chapter-1.html' },
    context(chapterHtml)
  );
  assert.equal(result.data.title, 'Chapter 1');
  assert.ok(result.data.cleanText.length >= 200);
});
