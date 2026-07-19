import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';
import { SearchSqliteRepository } from '../../apps/api/src/modules/search/infrastructure/sqlite/search-sqlite.repository.ts';
const root = await mkdtemp(join(tmpdir(), 'novel-tool-search-'));
const db = createSqliteDatabase(join(root, 'search.sqlite'));
const repo = new SearchSqliteRepository(db);
test.after(() => {
  db.close();
  return rm(root, { recursive: true, force: true });
});
test('FTS search ranks content and supports type/novel filters', async () => {
  const now = '2026-07-16T00:00:00.000Z';
  db.connection
    .prepare(
      'INSERT INTO novels(id,title,source_url,source_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)'
    )
    .run('n1', 'Kiếm Lai', 'https://e/n1', 'example', 'completed', now, now);
  db.connection
    .prepare(
      'INSERT INTO novels(id,title,source_url,source_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)'
    )
    .run('n2', 'Phàm Nhân', 'https://e/n2', 'example', 'completed', now, now);
  db.connection
    .prepare(
      'INSERT INTO chapters(id,novel_id,chapter_index,title,source_url,clean_text,status) VALUES(?,?,?,?,?,?,?)'
    )
    .run('c1', 'n1', 1, 'Thiếu niên cầm kiếm', 'https://e/c1', 'Một thanh kiếm cũ.', 'fetched');
  db.connection
    .prepare(
      'INSERT INTO chapters(id,novel_id,chapter_index,title,source_url,clean_text,status) VALUES(?,?,?,?,?,?,?)'
    )
    .run('c2', 'n2', 8, 'Tu tiên', 'https://e/c2', 'Con đường không có kiếm.', 'fetched');
  const all = await repo.search({ query: 'kiếm', type: 'all', limit: 20, offset: 0 });
  assert.ok(all.total >= 3);
  assert.equal(all.items[0]?.novelId, 'n1');
  assert.match(all.items.find((i) => i.documentId === 'c1')?.snippet ?? '', /<mark>kiếm<\/mark>/i);
  assert.deepEqual(
    (
      await repo.search({ query: 'kiếm', type: 'chapter', novelId: 'n2', limit: 20, offset: 0 })
    ).items.map((i) => i.documentId),
    ['c2']
  );
});
test('FTS triggers update and rebuild recreates derived index', async () => {
  db.connection
    .prepare("UPDATE chapters SET clean_text=?,status='fetched' WHERE id='c1'")
    .run('Một con phượng hoàng.');
  assert.equal(
    (await repo.search({ query: 'phượng', type: 'chapter', limit: 20, offset: 0 })).items[0]
      ?.documentId,
    'c1'
  );
  db.connection.exec('DELETE FROM search_documents;');
  assert.equal(
    (await repo.search({ query: 'phượng', type: 'all', limit: 20, offset: 0 })).total,
    0
  );
  assert.ok((await repo.rebuild()) >= 4);
  assert.equal(
    (await repo.search({ query: 'phượng', type: 'all', limit: 20, offset: 0 })).items[0]
      ?.documentId,
    'c1'
  );
});

test('FTS rebuild excludes chapters missing from the source', async () => {
  db.connection.prepare("UPDATE chapters SET source_available=0 WHERE id='c2'").run();
  db.connection.exec('DELETE FROM search_documents;');
  await repo.rebuild();
  const result = await repo.search({ query: 'đường', type: 'chapter', limit: 20, offset: 0 });
  assert.equal(
    result.items.some((item) => item.documentId === 'c2'),
    false
  );
});
