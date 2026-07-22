import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SqliteDatabase } from '../../apps/api-legacy/src/shared/database/sqlite.ts';
import { NovelAnalysisSqliteAdapter } from '../../apps/api-legacy/src/modules/novels/infrastructure/sqlite/novel-analysis-sqlite.adapter.ts';
import { ChapterSqliteRepository } from '../../apps/api-legacy/src/modules/chapters/infrastructure/sqlite/chapter-sqlite.repository.ts';

const now = '2026-07-16T00:00:00.000Z';
const novel = {
  id: 'n1',
  title: 'Novel',
  sourceUrl: 'https://example.com/book',
  sourceName: 'Example',
  author: 'Original Author',
  coverUrl: 'https://example.com/cover.jpg',
  status: 'analyzed' as const,
  createdAt: now,
  updatedAt: now
};
const chapter = (id: string, index: number, url: string, title: string) => ({
  id,
  novelId: 'n1',
  index,
  title,
  sourceUrl: url,
  status: 'pending' as const
});

test('reanalyze preserves fetched content by source URL when chapter order changes and hides missing chapters', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'novel-tool-identity-'));
  const database = new SqliteDatabase(join(directory, 'test.db'));
  database.migrate();
  const adapter = new NovelAnalysisSqliteAdapter(database);
  const repository = new ChapterSqliteRepository(database);
  try {
    await adapter.persist(novel, [
      chapter('a', 1, 'https://example.com/a', 'A'),
      chapter('b', 2, 'https://example.com/b', 'B'),
      chapter('gone', 3, 'https://example.com/gone', 'Gone')
    ]);
    database.connection
      .prepare("UPDATE chapters SET clean_text='CONTENT A', status='fetched' WHERE id='a'")
      .run();
    database.connection
      .prepare("UPDATE chapters SET clean_text='CONTENT B', status='fetched' WHERE id='b'")
      .run();

    await adapter.persist({ ...novel, updatedAt: '2026-07-17T00:00:00.000Z' }, [
      chapter('new', 1, 'https://example.com/new', 'New'),
      chapter('a-new-id', 2, 'https://example.com/a', 'A renamed'),
      chapter('b-new-id', 3, 'https://example.com/b', 'B')
    ]);

    const storedNovel = database.connection
      .prepare('SELECT author, cover_url FROM novels WHERE id = ?')
      .get('n1') as { author: string; cover_url: string };
    assert.equal(storedNovel.author, 'Original Author');
    assert.equal(storedNovel.cover_url, 'https://example.com/cover.jpg');

    const active = await repository.listByNovelId('n1');
    assert.deepEqual(
      active.map((item) => [item.index, item.sourceUrl, item.cleanText]),
      [
        [1, 'https://example.com/new', undefined],
        [2, 'https://example.com/a', 'CONTENT A'],
        [3, 'https://example.com/b', 'CONTENT B']
      ]
    );
    const orphan = database.connection
      .prepare("SELECT source_available FROM chapters WHERE source_url='https://example.com/gone'")
      .get() as { source_available: number };
    assert.equal(orphan.source_available, 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
