# E2E Test Checklist

Use a source you are authorized to access. Start with a small chapter limit and explicit allowlist.

## 1. Prepare environment

```bash
cp apps/api/.env.example apps/api/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Set at least:

```env
SOURCE_ALLOWLIST=your-allowed-domain.example
SOURCE_READER_MASTER_KEY=<generated-base64-key>
MAX_CHAPTERS_PER_RUN=5
CRAWLER_CONCURRENCY=1
CRAWLER_DELAY_MS=1200
```

## 2. Start and check health

```bash
npm run dev
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/source-reader/plugins
```

In `/sources`, verify the required plugin is installed, compatible, enabled and healthy. Approve only the exact permissions it needs. Configure credential or network profiles only when the source requires them.

## 3. Inspect the source before saving

Use the Source Inspector in `/sources`, or call:

```bash
curl -X POST http://127.0.0.1:3000/api/source-reader/metadata \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-allowed-domain.example/novel-page","freshOnly":true}'

curl -X POST http://127.0.0.1:3000/api/source-reader/chapter-list \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-allowed-domain.example/novel-page","limit":10,"freshOnly":true}'
```

Confirm metadata is correct and chapter items are real source URLs. If the list is empty, debug the plugin parser or upstream challenge rather than changing crawler core.

## 4. Analyze and create a crawl job

```bash
curl -X POST http://127.0.0.1:3000/api/novels/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-allowed-domain.example/novel-page"}'
```

Copy the returned novel id, then:

```bash
curl -X POST http://127.0.0.1:3000/api/crawl/jobs \
  -H 'Content-Type: application/json' \
  -d '{"novelId":"PASTE_NOVEL_ID"}'
```

## 5. Verify persistence

```bash
curl http://127.0.0.1:3000/api/novels/PASTE_NOVEL_ID/task
curl http://127.0.0.1:3000/api/novels/PASTE_NOVEL_ID/chapters
```

Check task progress, chapter order, titles and content. Retry/pause/resume/cancel behavior should preserve persisted progress.

## 6. Verify web and export

Open Library, novel detail and Reader at mobile and desktop widths. Confirm loading, empty, error and offline-safe states. Create an EPUB or TXT export from the novel detail screen and verify the downloaded file opens correctly.

## 7. Automated gates

```bash
npm run check
npm run test:regression
npm run test:integration
npm run build
npm run test:e2e
```
