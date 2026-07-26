import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendReaderChapter,
  createReaderWindow,
  prependReaderChapter
} from '../src/reader-window.ts';
import type { ReaderChapterIdentity } from '../src/contracts.ts';

interface Chapter extends ReaderChapterIdentity {
  text: string;
}

function chapter(index: number): Chapter {
  return { id: `chapter-${index}`, index, contentVersion: 1, text: `Chapter ${index}` };
}

test('reader window deduplicates chapters without evicting loaded content', () => {
  let window = createReaderWindow(chapter(3));
  window = appendReaderChapter(window, chapter(4));
  window = appendReaderChapter(window, chapter(5));
  window = appendReaderChapter(window, chapter(5));
  window = prependReaderChapter(window, chapter(2));

  assert.deepEqual(
    window.chapters.map((item) => item.index),
    [2, 3, 4, 5]
  );
});

test('reader window keeps all chapters during repeated inserts', () => {
  let window = createReaderWindow(chapter(12));
  for (const index of [11, 10, 9, 8, 7, 6]) {
    window = prependReaderChapter(window, chapter(index));
  }
  for (const index of [13, 14, 15, 16, 17, 18]) {
    window = appendReaderChapter(window, chapter(index));
  }

  assert.equal(
    window.chapters.some((item) => item.index === 12),
    true
  );
  assert.equal(window.chapters.length, 13);
});
