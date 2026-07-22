import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { ExportPipelineService } from '../../apps/api-legacy/src/modules/export/application/services/export-pipeline.service.ts';
import { TextExportWriter } from '../../apps/api-legacy/src/modules/export/infrastructure/text/text-export.writer.ts';
import { EpubExportWriter } from '../../apps/api-legacy/src/modules/export/infrastructure/epub/epub-export.writer.ts';

const book = {
  novel: {
    id: 'n1',
    title: 'Truyện thử',
    sourceUrl: 'https://example.com/n',
    sourceName: 'example',
    status: 'completed' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  },
  chapters: [
    {
      id: 'c1',
      novelId: 'n1',
      index: 1,
      title: 'Chương 1',
      sourceUrl: 'https://example.com/1',
      cleanText: 'Nội dung một',
      status: 'fetched' as const
    },
    {
      id: 'c2',
      novelId: 'n1',
      index: 2,
      title: 'Chương 2',
      sourceUrl: 'https://example.com/2',
      errorMessage: 'failed',
      status: 'failed' as const
    },
    {
      id: 'c3',
      novelId: 'n1',
      index: 3,
      title: 'Chương 3',
      sourceUrl: 'https://example.com/3',
      cleanText: 'Nội dung ba',
      status: 'fetched' as const
    }
  ]
};

test('export pipeline filters downloaded chapters and selected range', async () => {
  const pipeline = new ExportPipelineService(
    { load: async () => book },
    { txt: new TextExportWriter(), epub: new EpubExportWriter() }
  );
  const artifact = await pipeline.execute('n1', {
    format: 'txt',
    downloadedOnly: true,
    range: { from: 2, to: 3 }
  });
  const text = artifact.content.toString('utf8');
  assert.equal(artifact.chapterCount, 1);
  assert.ok(text.startsWith('\uFEFF'));
  assert.match(text, /Chương 3/);
  assert.doesNotMatch(text, /Chương 1/);
  assert.doesNotMatch(text, /Chương 2/);
});

test('epub writer creates required EPUB3 package entries', async () => {
  const artifact = await new EpubExportWriter().write({
    novel: book.novel,
    chapters: [book.chapters[0]!]
  });
  assert.equal(artifact.contentType, 'application/epub+zip');
  const zip = await JSZip.loadAsync(artifact.content);
  assert.ok(zip.file('mimetype'));
  assert.ok(zip.file('META-INF/container.xml'));
  assert.ok(zip.file('OEBPS/content.opf'));
  assert.ok(zip.file('OEBPS/nav.xhtml'));
  assert.ok(zip.file('OEBPS/chapters/chapter-1.xhtml'));
  assert.equal(await zip.file('mimetype')!.async('string'), 'application/epub+zip');
});

test('epub writer removes XML 1.0 control characters from metadata and chapters', async () => {
  const writer = new EpubExportWriter();
  const artifact = await writer.write({
    novel: {
      id: 'xml-control',
      title: 'Bad\u0000Title',
      sourceUrl: 'https://example.com/bad\u000Bsource',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    chapters: [
      {
        title: 'Chapter\u000COne',
        rawText: null,
        cleanText: 'Hello\u0000World\u000B!'
      }
    ]
  } as never);
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(artifact.content);
  for (const path of ['OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/chapters/chapter-1.xhtml']) {
    const text = await zip.file(path)!.async('string');
    assert.doesNotMatch(text, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u);
  }
});
