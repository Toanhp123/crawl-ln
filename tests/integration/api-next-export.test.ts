import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { createExportModule } from '../../apps/api-next/src/modules/export/export.module.ts';
import { EpubExportWriter } from '../../apps/api-next/src/modules/export/infrastructure/epub/epub-export.writer.ts';
import { createLibraryModule } from '../../apps/api-next/src/modules/library/library.module.ts';
import { createEnvironment } from '../../apps/api-next/src/platform/config/environment.ts';
import { SqliteDatabase } from '../../apps/api-next/src/platform/database/sqlite-database.ts';

const analyzedAt = '2026-07-21T08:00:00.000Z';

test('api-next environment exposes the export source size limit', () => {
  assert.equal(createEnvironment({ MAX_EXPORT_SOURCE_BYTES: '4096' }).maxExportSourceBytes, 4_096);
});

async function fixture(t: test.TestContext, maxSourceBytes = 128 * 1024 * 1024) {
  const database = new SqliteDatabase(':memory:');
  const library = createLibraryModule(database);
  for (const migration of library.migrations) migration.up(database.connection);
  const detail = await library.api.commands.reconcileAnalysis({
    commandId: 'analysis-1',
    analyzedAt,
    novel: {
      id: 'novel-1',
      title: 'Dragon Book',
      sourceUrl: 'https://fixture.test/novel-1',
      sourceName: 'fixture'
    },
    chapters: [
      {
        id: 'chapter-1',
        index: 1,
        title: 'Chapter One',
        sourceUrl: 'https://fixture.test/novel-1/chapter-1'
      },
      {
        id: 'chapter-2',
        index: 2,
        title: 'Chapter Two',
        sourceUrl: 'https://fixture.test/novel-1/chapter-2'
      },
      {
        id: 'chapter-3',
        index: 3,
        title: 'Chapter Three',
        sourceUrl: 'https://fixture.test/novel-1/chapter-3'
      }
    ]
  });
  for (const chapter of [detail.chapters[0]!, detail.chapters[2]!]) {
    await library.api.commands.saveChapterContent({
      commandId: `content-${chapter.id}`,
      novelId: detail.novel.id,
      chapterId: chapter.id,
      title: chapter.title,
      rawText: `Raw content for ${chapter.title}`,
      cleanText: `Clean content for ${chapter.title}`,
      savedAt: analyzedAt
    });
  }
  t.after(() => database.close());
  return {
    database,
    library,
    exports: createExportModule({
      library: library.api.queries,
      maxSourceBytes
    })
  };
}

test('text export filters downloaded chapters and selected range', async (t) => {
  const { exports } = await fixture(t);

  const artifact = await exports.api.commands.exportNovel({
    novelId: 'novel-1',
    options: {
      format: 'txt',
      downloadedOnly: true,
      range: { from: 2, to: 3 }
    }
  });
  const text = artifact.content.toString('utf8');

  assert.equal(artifact.filename, 'dragon-book.txt');
  assert.equal(artifact.contentType, 'text/plain; charset=utf-8');
  assert.equal(artifact.chapterCount, 1);
  assert.ok(text.startsWith('\uFEFF'));
  assert.match(text, /Chapter Three/);
  assert.doesNotMatch(text, /Chapter One/);
  assert.doesNotMatch(text, /Chapter Two/);
});

test('epub export creates required EPUB3 package entries', async (t) => {
  const { exports } = await fixture(t);

  const artifact = await exports.api.commands.exportNovel({
    novelId: 'novel-1',
    options: { format: 'epub', downloadedOnly: true, range: { from: 1, to: 1 } }
  });
  const zip = await JSZip.loadAsync(artifact.content);

  assert.equal(artifact.filename, 'dragon-book.epub');
  assert.equal(artifact.contentType, 'application/epub+zip');
  assert.equal(await zip.file('mimetype')!.async('string'), 'application/epub+zip');
  for (const path of [
    'META-INF/container.xml',
    'OEBPS/content.opf',
    'OEBPS/nav.xhtml',
    'OEBPS/chapters/chapter-1.xhtml'
  ]) {
    assert.ok(zip.file(path), path);
  }
});

test('epub export removes XML 1.0 control characters', async () => {
  const artifact = await new EpubExportWriter().write({
    novel: {
      id: 'xml-control',
      title: 'Bad\u0000Title',
      sourceUrl: 'https://fixture.test/bad\u000Bsource',
      sourceName: 'fixture',
      status: 'completed',
      createdAt: analyzedAt,
      updatedAt: analyzedAt
    },
    chapters: [
      {
        id: 'chapter-control',
        novelId: 'xml-control',
        index: 1,
        title: 'Chapter\u000COne',
        sourceUrl: 'https://fixture.test/chapter-control',
        cleanText: 'Hello\u0000World\u000B!',
        status: 'fetched'
      }
    ]
  });
  const zip = await JSZip.loadAsync(artifact.content);

  for (const path of ['OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/chapters/chapter-1.xhtml']) {
    const text = await zip.file(path)!.async('string');
    assert.doesNotMatch(text, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u);
  }
});

test('export rejects missing novels, empty selections and oversized sources', async (t) => {
  const { exports } = await fixture(t, 10);

  await assert.rejects(
    () =>
      exports.api.commands.exportNovel({
        novelId: 'missing',
        options: { format: 'txt', downloadedOnly: true }
      }),
    (error: unknown) => error instanceof Error && 'kind' in error && error.kind === 'not_found'
  );
  await assert.rejects(
    () =>
      exports.api.commands.exportNovel({
        novelId: 'novel-1',
        options: { format: 'txt', downloadedOnly: true, range: { from: 2, to: 2 } }
      }),
    (error: unknown) => error instanceof Error && 'kind' in error && error.kind === 'conflict'
  );
  await assert.rejects(
    () =>
      exports.api.commands.exportNovel({
        novelId: 'novel-1',
        options: { format: 'txt', downloadedOnly: true }
      }),
    /Export is too large/
  );
});
