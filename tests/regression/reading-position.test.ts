import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const storage = readFileSync(
  new URL(
    '../../apps/web-legacy/src/features/read-chapter/model/readingPositionStorage.ts',
    import.meta.url
  ),
  'utf8'
);
const anchor = readFileSync(
  new URL(
    '../../apps/web-legacy/src/features/read-chapter/model/readingAnchor.ts',
    import.meta.url
  ),
  'utf8'
);
const paragraphId = readFileSync(
  new URL('../../apps/web-legacy/src/entities/chapter/lib/paragraphDomId.ts', import.meta.url),
  'utf8'
);
const reader = readFileSync(
  new URL('../../apps/web-legacy/src/entities/chapter/ui/ChapterReader.tsx', import.meta.url),
  'utf8'
);

test('reading position uses a versioned paragraph anchor with ratio fallback', () => {
  assert.match(storage, /version:\s*2/);
  assert.match(storage, /paragraphId/);
  assert.match(storage, /paragraphOffset/);
  assert.match(storage, /scrollRatio/);
  assert.match(storage, /novel-tool-position/);
  assert.match(storage, /legacy\.version === 1/);
});

test('reader paragraphs expose stable DOM anchors', () => {
  assert.match(paragraphId, /chapter-\$\{chapterIndex\}-paragraph-\$\{paragraphIndex \+ 1\}/);
  assert.match(anchor, /data-reader-paragraph/);
  assert.match(reader, /paragraphDomId\(chapter\.index, index\)/);
  assert.match(reader, /data-reader-paragraph/);
});
