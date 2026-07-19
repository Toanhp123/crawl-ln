import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeChapterText } from '../../apps/api/src/modules/crawler/application/services/chapter-content-sanitizer.js';

test('keeps valid prose after a decorative star divider', () => {
  const input = `Chapter 1\n\n**********\n\nThe dragon opened its eyes.\n\nThe city began to burn.`;
  const result = sanitizeChapterText(input, 'Chapter 1');
  assert.match(result, /The dragon opened its eyes/);
  assert.match(result, /The city began to burn/);
});

test('removes a promotional footer without deleting chapter prose', () => {
  const input = `The dragon opened its eyes.\n\n**********\n\nRead more chapters at example.com`;
  const result = sanitizeChapterText(input, 'Chapter 1');
  assert.equal(result, 'The dragon opened its eyes.');
});
