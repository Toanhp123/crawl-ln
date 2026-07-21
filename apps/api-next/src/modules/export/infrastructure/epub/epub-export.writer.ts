import JSZip from 'jszip';
import type { ExportWriterPort } from '../../application/ports/export-writer.port.js';
import type { ExportBook } from '../../domain/export.models.js';
import { safeExportBaseName } from '../export-filename.js';

function xml(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xhtmlText(value: string): string {
  return xml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

export class EpubExportWriter implements ExportWriterPort {
  async write(book: ExportBook) {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file(
      'META-INF/container.xml',
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    );
    const manifest = [
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '<item id="css" href="styles.css" media-type="text/css"/>'
    ];
    const spine: string[] = [];
    const navigation: string[] = [];
    book.chapters.forEach((chapter, index) => {
      const id = `chapter-${index + 1}`;
      const href = `chapters/${id}.xhtml`;
      manifest.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="${id}"/>`);
      navigation.push(`<li><a href="${href}">${xml(chapter.title)}</a></li>`);
      zip.file(
        `OEBPS/${href}`,
        `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xml(chapter.title)}</title><link rel="stylesheet" href="../styles.css"/></head><body><h1>${xml(chapter.title)}</h1>${xhtmlText(chapter.cleanText || chapter.rawText || '')}</body></html>`
      );
    });
    zip.file(
      'OEBPS/styles.css',
      'body{font-family:serif;line-height:1.6;margin:5%;}h1{page-break-before:always;}'
    );
    zip.file(
      'OEBPS/nav.xhtml',
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Mục lục</title></head><body><nav epub:type="toc"><h1>Mục lục</h1><ol>${navigation.join('')}</ol></nav></body></html>`
    );
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:novel-tool:${xml(book.novel.id)}</dc:identifier><dc:title>${xml(book.novel.title)}</dc:title><dc:language>vi</dc:language><dc:source>${xml(book.novel.sourceUrl)}</dc:source><meta property="dcterms:modified">${new Date(book.novel.updatedAt).toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`
    );
    const content = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    return {
      filename: `${safeExportBaseName(book.novel.title)}.epub`,
      contentType: 'application/epub+zip',
      content,
      chapterCount: book.chapters.length
    };
  }
}
