import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chapterUrlDedupKey,
  selectChapterRawText
} from '../../apps/api/src/modules/crawler/application/services/crawler-engine.service.js';
import type { HtmlDocumentPort } from '../../apps/api/src/modules/crawler/domain/parser/html-parser.port.js';

function documentWithText(values: Record<string, string>): HtmlDocumentPort {
  return {
    text: (selector: string) => values[selector] ?? '',
    html: () => '',
    attr: () => undefined,
    queryAll: () => [],
    nodeText: () => '',
    nodeAttr: () => undefined,
    remove: () => undefined
  };
}

test('falls back to body text when the configured chapter wrapper is created by document.write', () => {
  const document = documentWithText({
    '.chapter-reading-section': '',
    body: 'Chapter 644\n\nThe dragon returned to Anzeta.\n\nThe story continues.'
  });

  const result = selectChapterRawText(document, '.chapter-reading-section');

  assert.match(result, /The dragon returned to Anzeta/);
});

test('treats NovelCool chapter URLs with and without .html as the same chapter', () => {
  const withHtml = 'https://www.novelcool.com/chapter/Chapter-644-Ancient-Evil/14035390.html';
  const withoutHtml = 'https://www.novelcool.com/chapter/Chapter-644-Ancient-Evil/14035390';

  assert.equal(chapterUrlDedupKey(withHtml), chapterUrlDedupKey(withoutHtml));
});

test('deduplicates chapter URLs across www host and different slugs when the numeric chapter id matches', () => {
  const generic = 'https://novelcool.com/chapter/read-online/14035390.html';
  const detailed = 'https://www.novelcool.com/chapter/Chapter-924-Now-It-s-Too-Late/14035390';

  assert.equal(chapterUrlDedupKey(generic), chapterUrlDedupKey(detailed));
});

test('removes the generic Chapter 1 duplicate when a detailed NovelCool link has the same numeric id', async () => {
  const { dedupeChapterCandidates } =
    await import('../../apps/api/src/modules/crawler/application/services/crawler-engine.service.js');
  const chapters = dedupeChapterCandidates([
    { title: 'Chapter 1', url: 'https://novelcool.com/chapter/read-online/14035390.html' },
    {
      title: "Chapter 924: Now It's Too Late to Say Anything!",
      url: 'https://www.novelcool.com/chapter/Chapter-924-Now-It-s-Too-Late/14035390'
    }
  ]);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0]?.title, "Chapter 924: Now It's Too Late to Say Anything!");
});
