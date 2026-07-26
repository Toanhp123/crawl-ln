import assert from 'node:assert/strict';
import test from 'node:test';
import { CheerioHtmlParserAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/cheerio-html-parser.adapter.ts';

test('source HTML parser preserves readable markup around dynamic document writes', () => {
  const html = `
    <div class="chapter-shell">
      <script>
        document.write("<div class=\"chapter-reading-section-list \" style='" +
          "font-size: " + parseInt(getLocal("f_size") || "20") + "px;'>");
      </script>
      <div class="overflow-hidden">
        <script>
          const lineHeight = parseInt(getLocal("f_size") || "20") + 16;
          document.getElementById("p-style").innerText =
            ".chapter-reading-section-list p { margin-bottom: " + lineHeight + "px; }";
          document.write("<div style=\"line-height:" + lineHeight +
            "px;\" class=\"chapter-reading-section\">");
        </script>
        <h2 class="chapter-title">Chapter 1</h2>
        <p class="chapter-start-mark"></p>
        Chapter body that must remain readable after parsing.
      </div>
    </div>
  `;

  const document = new CheerioHtmlParserAdapter().load(html);

  assert.equal(document.queryAll('.overflow-hidden:has(.chapter-start-mark)').length, 1);
  assert.match(
    document.text('.overflow-hidden:has(.chapter-start-mark)'),
    /Chapter body that must remain readable/
  );
});
