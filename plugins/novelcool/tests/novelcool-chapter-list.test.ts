import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createNovelCoolPlugin } from '../src/index.ts';
import { novelCoolChapterId, novelCoolChapterKey } from '../src/novelcool-url.ts';
import { createExternalContextFixture } from './helpers/external-context.fixture.ts';

const novelUrl = 'https://novelcool.com/novel/original/id-269162.html';
const genericUrl = 'https://novelcool.com/chapter/read-online/14145402.html';
const detailedUrl = 'https://www.novelcool.com/chapter/Chapter-655-Misha-s-Move/14145402/';

function hasCode(expected: string) {
  return (error: unknown) =>
    error instanceof Error && (error as Error & { code?: string }).code === expected;
}

test('chapter list merges NovelCool URL aliases by numeric id', async () => {
  const html = await readFile(
    new URL('./fixtures/chapter-list-aliases.html', import.meta.url),
    'utf8'
  );
  const fixture = createExternalContextFixture({ responses: { [novelUrl]: { data: html } } });
  const result = await createNovelCoolPlugin().readChapterList!(
    { url: novelUrl, limit: 2 },
    fixture.context
  );

  assert.equal(result.data.items.length, 1);
  assert.deepEqual(result.data.items[0], {
    index: 1,
    title: "Chapter 655: Misha's Move",
    url: detailedUrl
  });
  assert.equal(novelCoolChapterId(genericUrl), '14145402');
  assert.equal(novelCoolChapterKey(genericUrl), novelCoolChapterKey(detailedUrl));
});

test('chapter list reverses descending chapter numbers and returns contiguous indexes', async () => {
  const html = `
    <html>
      <body>
        <h1 class="novel-title">Reverse Fixture</h1>
        <div class="chapter-list">
          <a href="/chapter/Chapter-3/1003/"><span>Chapter 3</span></a>
          <a href="/chapter/Chapter-2/1002/"><span>Chapter 2</span></a>
          <a href="/chapter/Chapter-1/1001/"><span>Chapter 1</span></a>
        </div>
      </body>
    </html>
  `;
  const fixture = createExternalContextFixture({ responses: { [novelUrl]: { data: html } } });
  const result = await createNovelCoolPlugin().readChapterList!(
    { url: novelUrl, limit: 50 },
    fixture.context
  );

  assert.deepEqual(
    result.data.items.map(({ index, title }) => ({ index, title })),
    [
      { index: 1, title: 'Chapter 1' },
      { index: 2, title: 'Chapter 2' },
      { index: 3, title: 'Chapter 3' }
    ]
  );
});

test('chapter list rejects module-managed cursors', async () => {
  const fixture = createExternalContextFixture();
  await assert.rejects(async () => {
    await createNovelCoolPlugin().readChapterList!(
      { url: novelUrl, cursor: 'opaque', limit: 10 },
      fixture.context
    );
  }, hasCode('CURSOR_INVALID'));
  assert.deepEqual(fixture.requests, []);
});

test('chapter list stops before selector scans when cancelled after the request', async () => {
  const html =
    '<html><body><h1 class="novel-title">Cancel Fixture</h1><div class="chapter-list"><a href="/chapter/1/1001/"><span>Chapter 1</span></a></div></body></html>';
  const fixture = createExternalContextFixture({ responses: { [novelUrl]: { data: html } } });
  fixture.afterRequest(() => fixture.abort());

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readChapterList!({ url: novelUrl, limit: 10 }, fixture.context);
  }, hasCode('SOURCE_READER_CANCELLED'));
  assert.deepEqual(fixture.requests, [novelUrl]);
});
