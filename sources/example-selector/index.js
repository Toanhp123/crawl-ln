export default function createPlugin(ctx) {
  const absolute = (href, base) => new URL(href, base).toString();
  return {
    async analyze(url) {
      const response = await ctx.http.get(url);
      const doc = ctx.html.load(response.data);
      const chapters = doc.all('a.chapter').map((node, index) => ({ index: index + 1, title: node.text().trim() || `Chapter ${index + 1}`, url: absolute(node.attr('href'), url) }));
      return { title: doc.text('h1').trim() || new URL(url).hostname, sourceUrl: url, sourceName: 'example-selector', author: doc.text('.author').trim() || undefined, coverUrl: doc.attr('img.cover', 'src') ? absolute(doc.attr('img.cover', 'src'), url) : undefined, chapters };
    },
    async fetchChapter(url, signal) {
      const response = await ctx.http.get(url, { signal });
      const doc = ctx.html.load(response.data);
      const title = doc.text('h1').trim() || 'Chapter';
      doc.remove('script,style,nav,header,footer');
      const rawText = doc.text('.chapter-content').trim();
      return { title, url, rawText, cleanText: rawText };
    }
  };
}
