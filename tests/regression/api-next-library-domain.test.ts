import assert from 'node:assert/strict';
import test from 'node:test';
import { LibraryChapterEntity } from '../../apps/api-next/src/modules/library/domain/entities/library-chapter.entity.ts';
import { LibraryNovelEntity } from '../../apps/api-next/src/modules/library/domain/entities/library-novel.entity.ts';
import { LibraryError } from '../../apps/api-next/src/modules/library/domain/errors/library.error.ts';
import type {
  LibraryChapter,
  LibraryNovel
} from '../../apps/api-next/src/modules/library/domain/library.models.ts';

const now = '2026-07-21T00:00:00.000Z';

function fixtureNovel(overrides: Partial<LibraryNovel> = {}): LibraryNovel {
  return {
    id: 'novel-1',
    title: 'Novel',
    sourceUrl: 'https://example.test/novel',
    sourceName: 'Example',
    status: 'analyzed',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function fixtureChapter(overrides: Partial<LibraryChapter> = {}): LibraryChapter {
  return {
    id: 'chapter-1',
    novelId: 'novel-1',
    index: 1,
    title: 'Chapter 1',
    sourceUrl: 'https://example.test/novel/chapter-1',
    rawText: 'old raw',
    cleanText: 'old clean',
    status: 'fetched',
    sourceAvailable: true,
    contentVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test('library novel preserves identity while reconciling source metadata', () => {
  const current = LibraryNovelEntity.create(fixtureNovel());
  const next = current.reconcile({
    title: 'Updated',
    sourceName: 'NovelCool',
    author: 'Author',
    coverUrl: undefined,
    analyzedAt: '2026-07-21T01:00:00.000Z'
  });

  assert.equal(next.toPrimitives().id, current.toPrimitives().id);
  assert.equal(next.toPrimitives().sourceUrl, current.toPrimitives().sourceUrl);
  assert.equal(next.toPrimitives().title, 'Updated');
  assert.equal(next.toPrimitives().status, 'analyzed');
});

test('chapter content save increments content version only when content changes', () => {
  const chapter = LibraryChapterEntity.create(fixtureChapter());
  assert.equal(chapter.saveContent('raw', 'clean', now).toPrimitives().contentVersion, 3);
  assert.equal(chapter.saveContent(undefined, undefined, now).toPrimitives().contentVersion, 2);
  assert.equal(chapter.saveContent('old raw', 'old clean', now).toPrimitives().contentVersion, 2);
});

test('chapter source reconciliation preserves identity and downloaded content', () => {
  const chapter = LibraryChapterEntity.create(fixtureChapter());
  const reconciled = chapter.reconcileSource({
    index: 2,
    title: 'Renamed',
    sourceUrl: chapter.toPrimitives().sourceUrl,
    analyzedAt: '2026-07-21T01:00:00.000Z'
  });

  assert.equal(reconciled.toPrimitives().id, 'chapter-1');
  assert.equal(reconciled.toPrimitives().cleanText, 'old clean');
  assert.equal(reconciled.toPrimitives().contentVersion, 2);
  assert.equal(reconciled.toPrimitives().index, 2);
});

test('library entities reject invalid source data', () => {
  assert.throws(
    () => LibraryNovelEntity.create(fixtureNovel({ title: ' ' })),
    (error: unknown) => error instanceof LibraryError && error.code === 'LIBRARY_VALIDATION_ERROR'
  );
  assert.throws(
    () => LibraryNovelEntity.create(fixtureNovel({ sourceUrl: 'not-a-url' })),
    (error: unknown) => error instanceof LibraryError && error.code === 'LIBRARY_VALIDATION_ERROR'
  );
  assert.throws(
    () => LibraryChapterEntity.create(fixtureChapter({ index: -1 })),
    (error: unknown) => error instanceof LibraryError && error.code === 'LIBRARY_VALIDATION_ERROR'
  );
});

test('library novel rejects invalid ingestion lifecycle transitions', () => {
  const analyzed = LibraryNovelEntity.create(fixtureNovel());
  assert.throws(
    () => analyzed.setIngestionState('completed', now),
    (error: unknown) => error instanceof LibraryError && error.code === 'LIBRARY_INVALID_TRANSITION'
  );

  const completed = analyzed
    .setIngestionState('crawling', '2026-07-21T01:00:00.000Z')
    .setIngestionState('completed', '2026-07-21T02:00:00.000Z');
  assert.equal(completed.toPrimitives().status, 'completed');
});
