# E2E Test Checklist

Browser automation là capability tùy chọn và luôn phải được yêu cầu rõ ràng. Thiếu Chromium hoặc executable tương thích phải làm bước E2E thất bại, không được bỏ qua.

## 1. Chuẩn bị

```bash
npm run setup -- --browser
cp apps/api/.env.example apps/api/.env
```

Khi kiểm thử crawl thật, chỉ dùng nguồn bạn được phép truy cập. Đặt allowlist rõ ràng, giới hạn số chương và concurrency thấp:

```env
SOURCE_ALLOWLIST=your-allowed-domain.example
MAX_CHAPTERS_PER_RUN=5
CRAWLER_CONCURRENCY=1
CRAWLER_DELAY_MS=1200
```

## 2. Chạy browser suite

```bash
npm test -- --suite e2e
```

Playwright khởi động web qua public command `npm run dev -- --target web`. API request trong test được mock theo từng spec; runtime-instance bootstrap cũng được mock bằng fixture dùng chung.

## 3. Manual Source Reader smoke

Chạy development đầy đủ:

```bash
npm run dev
```

Kiểm tra:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/source-reader/plugins
```

Trong `/sources`, xác nhận plugin cần thiết đã cài, compatible, enabled và healthy. Chỉ cấp đúng permission cần thiết. Credential hoặc network profile chỉ được cấu hình khi nguồn yêu cầu.

## 4. Inspect trước khi lưu

Dùng Source Inspector trong `/sources`, hoặc gọi:

```bash
curl -X POST http://127.0.0.1:3000/api/source-reader/metadata \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-allowed-domain.example/novel-page","freshOnly":true}'

curl -X POST http://127.0.0.1:3000/api/source-reader/chapter-list \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-allowed-domain.example/novel-page","limit":10,"freshOnly":true}'
```

Xác nhận metadata đúng và chapter items là URL nguồn thật. Danh sách rỗng phải được debug ở plugin parser hoặc upstream challenge, không sửa crawler core để lách lỗi.

## 5. Crawl và persistence

```bash
curl -X POST http://127.0.0.1:3000/api/novels/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-allowed-domain.example/novel-page"}'
```

Dùng novel id trả về để tạo job, sau đó kiểm tra task, chapter order, retry/pause/resume/cancel và persisted progress.

## 6. Web, reader và export

Mở Library, novel detail và Reader ở mobile/desktop widths. Kiểm tra loading, empty, error, offline-safe state, reading continuity và export EPUB/TXT.

## 7. Production smoke

```bash
npm run build
npm run start
```

Xác nhận một Node process phục vụ cả `/health` và SPA trên cùng port, API miss vẫn trả JSON và non-API GET/HEAD dùng SPA fallback.

## 8. Backup and Restore Phase 2C

The route-controlled browser suite must cover all of these acceptance scenarios; integration tests remain the source of truth for physical SQLite rollback and filesystem crash recovery.

1. Create an unencrypted Backup only after explicit warning acceptance, then download the artifact.
2. Validate an encrypted Backup password and download the encrypted artifact.
3. Upload multiple Restore chunks, lose one response, and continue from the server-confirmed offset.
4. Reload during upload, reselect the matching file, and resume from acknowledged bytes.
5. Reject a different file fingerprint after reload.
6. For an encrypted archive, reject one wrong password and accept the next correct password.
7. Delete the Restore session after the fifth wrong password and require a new file selection.
8. Show privacy-safe inventory counts without novel titles, source URLs, chapter content, credentials or raw settings.
9. Return a stale Merge plan to Impact after target data changes.
10. Complete Merge without page reload and apply allowlisted settings through the settings event.
11. Require exact equality with `THAY THẾ DỮ LIỆU` for Replace.
12. Block maintenance when the Replace safety backup fails and allow retry from the ready session.
13. Complete Replace, expose the unencrypted safety artifact, reload exactly once, and reopen Result.
14. Close and reopen Settings during an operation and reconnect to server truth.
15. Use one-second active polling while SSE is disconnected and stop fallback polling after reconnect.
16. Mark work interrupted after API restart and never auto-resume it.
17. Treat an operation conflict as synchronization and monitor the current operation.
18. Offer cancellation before the irreversible boundary and remove it after the boundary.
