# E2E Test Checklist

Use this before testing a full crawl on Android/Termux.

## 1. Configure safe env

```bash
cd apps/api
cp .env.termux.example .env
```

Edit `.env`:

```env
SOURCE_ALLOWLIST=your-allowed-domain.example
SOURCE_PROFILES_FILE=./config/source-profiles.json
MAX_CHAPTERS_PER_RUN=5
CRAWLER_CONCURRENCY=1
CRAWLER_DELAY_MS=1200
MIN_CHAPTER_CONTENT_CHARS=200
GENERIC_HTML_ADAPTER_ENABLED=false
```

## 2. Configure source profile

Edit `apps/api/config/source-profiles.json`:

- replace the host;
- set `enabled` to `true`;
- update selectors for title, chapter links, chapter title, chapter content, and removed noise nodes.

## 3. Dry-run analyze first

```bash
curl -X POST http://localhost:3000/api/crawl/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-allowed-domain.example/novel-page"}'
```

Confirm:

- title is correct;
- `diagnostics.chapterCount` is greater than 0;
- `diagnostics.firstChapterUrls` are real chapter URLs.

## 4. Save novel only after dry-run passes

```bash
curl -X POST http://localhost:3000/api/novels/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-allowed-domain.example/novel-page"}'
```

Copy the returned `id`.

## 5. Crawl a small batch

```bash
curl -X POST http://localhost:3000/api/crawl/jobs \
  -H 'Content-Type: application/json' \
  -d '{"novelId":"PASTE_NOVEL_ID"}'
```

## 6. Check task and chapters

```bash
curl http://localhost:3000/api/novels/PASTE_NOVEL_ID/task
curl http://localhost:3000/api/novels/PASTE_NOVEL_ID/chapters
```

## 7. Export after success

```bash
curl -L 'http://localhost:3000/api/novels/PASTE_NOVEL_ID/export?format=md' -o novel.md
```
