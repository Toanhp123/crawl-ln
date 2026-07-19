import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseFetchedChapterTitle } from '../../apps/api/src/modules/crawler/application/services/crawl-queue.service.js';

test('keeps analyzed chapter title when fetched title is generic', () => {
  assert.equal(
    chooseFetchedChapterTitle("Chapter 924: Now It's Too Late to Say Anything!", 'Chapter'),
    "Chapter 924: Now It's Too Late to Say Anything!"
  );
});

test('accepts a more descriptive fetched title', () => {
  assert.equal(
    chooseFetchedChapterTitle('Chapter 924', "Chapter 924: Now It's Too Late to Say Anything!"),
    "Chapter 924: Now It's Too Late to Say Anything!"
  );
});
