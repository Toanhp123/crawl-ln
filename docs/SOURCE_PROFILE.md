# Source Profile Contract

Source profiles describe how the crawler engine reads a novel site without hardcoding site-specific selectors in application code.

## File

Configure the API with:

```env
SOURCE_PROFILES_FILE=apps/api/config/source-profiles.example.json
SOURCE_ALLOWLIST=example.com
```

The file is a JSON array of profiles.

## Schema

```json
{
  "id": "example-novel-site",
  "name": "Example Novel Site",
  "enabled": true,
  "hosts": ["example.com"],
  "http": {
    "userAgent": "optional custom user agent",
    "headers": {
      "Accept-Language": "en-US,en;q=0.9"
    },
    "timeoutMs": 15000
  },
  "crawlPolicy": {
    "respectRobotsTxt": true,
    "crawlDelayMs": 1000,
    "maxChaptersPerRun": 50
  },
  "selectors": {
    "title": "h1",
    "author": ".author, [rel='author']",
    "cover": ".cover img, img.cover",
    "description": ".description, .summary",
    "chapterLinks": ".chapter-list a, a[href*='chapter']",
    "chapterTitle": "h1",
    "chapterContent": "article, main, .chapter-content, #chapter-content",
    "remove": [".ads", ".comment", ".breadcrumb"]
  }
}
```

## Rules

- `id` must be lowercase kebab-case.
- `hosts` controls source detection.
- `selectors.title`, `selectors.chapterLinks`, and `selectors.chapterContent` are required.
- `selectors.remove` is applied before extracting chapter text.
- Keep selectors narrow. Prefer real content containers over `body`.
- Add the host to `SOURCE_ALLOWLIST`; robots policy still blocks disallowed paths.

## Engine Flow

```text
URL
  -> SourceDetector
  -> SourceProfileRepository
  -> RobotsTxtPolicy
  -> HttpClientPort
  -> HtmlParserPort
  -> CrawlerEngineService
  -> AnalyzeNovelResult / ChapterContentResult
```

Domain and application code must not import concrete HTTP, parser, or source implementations.

## Safe end-to-end checklist

Before running a real E2E crawl:

1. Copy `apps/api/config/source-profiles.example.json` to `apps/api/config/source-profiles.json` or edit the included placeholder file.
2. Set `enabled: true` only for a source you are allowed to crawl.
3. Set `SOURCE_ALLOWLIST` to the exact host in `.env`.
4. Start with these safe limits:
   - `MAX_CHAPTERS_PER_RUN=5`
   - `CRAWLER_CONCURRENCY=1`
   - `CRAWLER_DELAY_MS=1200`
   - `MIN_CHAPTER_CONTENT_CHARS=200`
5. First call `POST /api/crawl/analyze` with `{ "url": "..." }`.
   - This is the dry-run analyze endpoint. It does not save the novel.
   - Confirm `diagnostics.chapterCount > 0`.
   - Confirm the first URLs in `diagnostics.firstChapterUrls` are correct chapter pages.
6. Only after that call `POST /api/novels/analyze`, then submit the returned `novel.id` to `POST /api/crawl/jobs` as `{ "novelId": "..." }`.

The backend now rejects unsafe/dirty runs when:

- the title selector does not return a valid title;
- the chapter selector returns zero chapters;
- a chapter URL points outside the source host;
- a fetched chapter contains too little text after cleanup;
- there are no pending chapters to crawl.
