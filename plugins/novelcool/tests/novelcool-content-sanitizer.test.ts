import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeChapterText } from '../src/novelcool-content-sanitizer.ts';

test('chapter sanitizer keeps story text and removes repeated title and promotional footer', () => {
  const value = sanitizeChapterText(
    [
      'Chapter 1: Arrival',
      'The first fixture paragraph.',
      'The second fixture paragraph.',
      '********',
      'Support us on Patreon for more chapters: https://example.com'
    ].join('\n'),
    'Chapter 1: Arrival'
  );

  assert.equal(value, 'The first fixture paragraph.\n\nThe second fixture paragraph.');
});
