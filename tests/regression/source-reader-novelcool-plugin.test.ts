import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CheerioHtmlParserAdapter } from '../../apps/api-legacy/src/shared/infrastructure/html/cheerio-html-parser.adapter.ts';
import { SourceReaderError } from '../../apps/api-legacy/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { novelCoolPlugin } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts';
import type { PluginContext } from '../../apps/api-legacy/src/modules/source-reader/domain/plugin/source-plugin.ts';
import { assertPluginContract } from '../helpers/source-reader-plugin-contract.ts';

const novelHtml = await readFile('tests/fixtures/source-reader/novelcool-novel.html', 'utf8');
const chapterHtml = await readFile('tests/fixtures/source-reader/novelcool-chapter.html', 'utf8');
const currentNovelHtml = await readFile(
  'tests/fixtures/source-reader/novelcool-current-novel.html',
  'utf8'
);
const challengeHtml = await readFile(
  'tests/fixtures/source-reader/novelcool-challenge.html',
  'utf8'
);
const duplicateHtml = await readFile(
  'tests/fixtures/source-reader/novelcool-duplicate-chapters.html',
  'utf8'
);
const emptyValidHtml = await readFile(
  'tests/fixtures/source-reader/novelcool-empty-valid.html',
  'utf8'
);
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

test('NovelCool plugin supports current chapter containers and preserves oldest-first order', async () => {
  const chapters = await novelCoolPlugin.readChapterList!(
    { url: 'https://www.novelcool.com/novel/current-fixture.html', limit: 100 },
    context(currentNovelHtml)
  );
  assert.deepEqual(
    chapters.data.items.map((item) => item.title),
    ['Chapter 1', 'Chapter 2', 'Chapter 3']
  );
});

test('NovelCool chapter fallback deduplicates same-origin chapter links', async () => {
  const chapters = await novelCoolPlugin.readChapterList!(
    { url: 'https://www.novelcool.com/novel/duplicate-fixture.html', limit: 100 },
    context(duplicateHtml)
  );
  assert.deepEqual(
    chapters.data.items.map((item) => item.url),
    [
      'https://www.novelcool.com/chapter/Chapter-1/2001/',
      'https://www.novelcool.com/chapter/Chapter-2/2002/'
    ]
  );
});

test('NovelCool plugin reports upstream challenge pages with a typed redacted error', async () => {
  await assert.rejects(
    () =>
      novelCoolPlugin.readChapterList!(
        { url: 'https://www.novelcool.com/novel/challenge.html', limit: 100 },
        context(challengeHtml)
      ),
    (error: unknown) => {
      assert.ok(error instanceof SourceReaderError);
      assert.equal(error.code, 'UPSTREAM_CHALLENGE_DETECTED');
      assert.equal(JSON.stringify(error.details).includes('cf-chl-widget'), false);
      assert.equal(JSON.stringify(error.details).includes(challengeHtml), false);
      return true;
    }
  );
});

test('NovelCool valid page without chapters remains a parser result error with diagnostics', async () => {
  await assert.rejects(
    () =>
      novelCoolPlugin.readChapterList!(
        { url: 'https://www.novelcool.com/novel/empty.html', limit: 100 },
        context(emptyValidHtml)
      ),
    (error: unknown) => {
      assert.ok(error instanceof SourceReaderError);
      assert.equal(error.code, 'PLUGIN_RESULT_INVALID');
      assert.equal(error.details?.pageClassification, 'novel');
      assert.equal(typeof error.details?.selectorCounts, 'object');
      assert.equal(JSON.stringify(error.details).includes(emptyValidHtml), false);
      return true;
    }
  );
});
