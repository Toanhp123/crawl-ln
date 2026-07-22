import assert from 'node:assert/strict';
import test from 'node:test';
import { CheerioHtmlParserAdapter } from '../../apps/api-legacy/src/shared/infrastructure/html/cheerio-html-parser.adapter.js';

test('materializes static HTML emitted by document.write before selector queries', () => {
  const html = String.raw`
    <div class="chapter-reading-section-list">
      <script>
        (function () {
          var lineHeight = 36;
          document.write("<div style=\"line-height:" + lineHeight + "px;\"" + "class=\"chapter-reading-section position-relative\" offset_left=\"0\">");
        })();
      </script>
      <h2 class="chapter-title">Chapter 644</h2>
      <p class="chapter-start-mark"></p>
      The dragon returned.<br>The city trembled.
      <p class="chapter-end-mark"></p>
      <script>document.write("</div>");</script>
    </div>`;

  const document = new CheerioHtmlParserAdapter().load(html);

  assert.equal(document.queryAll('.chapter-reading-section').length, 1);
  assert.match(document.text('.chapter-reading-section'), /The dragon returned/);
  assert.match(document.html('.chapter-reading-section'), /The city trembled/);
});

test('can read NovelCool raw chapter content through the marker parent fallback', () => {
  const html = String.raw`
    <div class="chapter-reading-section-list">
      <div class="overflow-hidden">
        <script>document.write(dynamicChapterWrapper);</script>
        <h2 class="chapter-title">Chapter 644</h2>
        <p class="chapter-start-mark"></p>
        The dragon returned.<br>The city trembled.<br>${'Ancient evil awakened. '.repeat(40)}
        <p class="chapter-end-mark"></p>
      </div>
    </div>`;

  const document = new CheerioHtmlParserAdapter().load(html);
  const selector = '.overflow-hidden:has(.chapter-start-mark)';

  assert.equal(document.queryAll(selector).length, 1);
  assert.match(document.text(selector), /Ancient evil awakened/);
  assert.ok(document.text(selector).length > 400);
});
