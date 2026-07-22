# Novel Tool 2.9.6

Novel Tool là ứng dụng mobile-first để phân tích nguồn, crawl, lưu, đọc, tìm kiếm và xuất light novel. Repository là npm monorepo gồm API TypeScript modular monolith, web React theo Feature-Sliced Design và package contract dùng chung.

## Yêu cầu

- Node.js `>=22.12.0`; phiên bản tham chiếu nằm trong `.nvmrc`.
- npm `>=10`; lockfile hiện được tạo bằng npm `10.9.2`.
- Không đặt project trong Android shared storage như `/storage/emulated/0/Download`, vì npm workspace cần symlink hoạt động đúng.

## Cài đặt

Checkout hoặc archive sạch:

```bash
npm ci
cp apps/api-legacy/.env.example apps/api-legacy/.env
npm run dev
```

Chỉ dùng `npm install` khi chủ động thay dependency và muốn cập nhật lockfile.

Termux:

```bash
pkg install nodejs
npm run setup:termux
npm run dev:termux
```

Địa chỉ mặc định:

- Web: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:3000/health`

## Cấu trúc

```text
apps/api-legacy          Express, SQLite, crawl queue, Source Reader
apps/web-legacy          React, Vite, Tailwind, TanStack Query, FSD
packages/shared   Zod schemas và public transport contracts
tests             Regression, integration và Playwright E2E
```

Backend modules chỉ giao tiếp qua public API/ports được composition root truyền vào. Frontend tuân theo:

```text
app → pages → widgets → features → entities → shared
```

## Lệnh chính

```bash
npm run dev                         # API + Web
npm run dev:api                     # chỉ API
npm run dev:web                     # chỉ Web
npm run dev:termux                  # Termux setup nhẹ + dev
npm run clean                       # xóa output sinh ra, không xóa storage/.env
npm run check                       # architecture, docs, format và TypeScript
npm run build                       # production build toàn monorepo
npm run test:regression             # regression tests
npm run test:integration            # integration tests, tự chuẩn bị shared
npm run test:e2e:install            # cài Chromium cho Playwright
npm run test:e2e                    # browser E2E
npm run verify                      # lockfile, check, build, regression, integration
npm run rehearse:v3:cutover        # migration, cutover, rollback and hash-restore rehearsal
npm run db:reset -w @novel-tool/api-legacy # reset SQLite local
```

`npm run clean` chỉ dùng khi cần loại bỏ output cũ hoặc debug cache; build bình thường không tự clean để giữ tốc độ lặp lại.

## Cấu hình API

Các giá trị thường dùng nằm trong `apps/api-legacy/.env.example`:

```env
PORT=3000
STORAGE_DIR=./storage
SOURCE_ALLOWLIST=novelcool.com,www.novelcool.com
SOURCE_READER_CURSOR_KEY=replace-with-a-private-key
SOURCE_READER_MASTER_KEY=<base64-for-exactly-32-bytes>
SOURCE_READER_MEMORY_CACHE_ENTRIES=500
```

`SOURCE_READER_MASTER_KEY` chỉ bắt buộc cho credential, session, proxy secret và challenge state. Public reading có thể chạy ở degraded mode khi chưa cấu hình key.

### Chế độ local an toàn

API mặc định bind `127.0.0.1` và chỉ chấp nhận origin local được khai báo trong `API_CORS_ORIGINS`. File `apps/api-legacy/.env.example` bật `SOURCE_READER_LOCAL_ADMIN=true` để console quản trị hoạt động sau khi bạn chủ động copy file cấu hình. Nếu không có `.env`, Source Reader chỉ cấp quyền đọc. Request local không gửi `x-source-reader-user-id` dùng actor ID ổn định `local-user` làm owner mặc định.

### Truy cập LAN có chủ đích

Để bind ra LAN, đặt một host không phải loopback và token tối thiểu 32 ký tự:

```env
HOST=0.0.0.0
API_CORS_ORIGINS=http://192.168.1.50:5173
API_REMOTE_TOKEN=replace-with-at-least-32-random-characters
SOURCE_READER_TRUST_ROLE_HEADERS=false
```

Startup sẽ từ chối cấu hình LAN thiếu token mạnh. Mọi request trực tiếp từ máy khác tới `/api/*` phải gửi `Authorization: Bearer <API_REMOTE_TOKEN>`; `/health` vẫn công khai cho process supervisor. Không đặt token trong URL hoặc log. Web UI hiện được thiết kế cho local mode và không tự lưu bearer token. Client LAN phải tự thêm header. Nếu đặt reverse proxy trước API loopback, proxy đó phải tự xác thực người dùng vì backend sẽ nhìn thấy kết nối từ loopback.

Bearer token chỉ mở ranh giới API; Source Reader remote vẫn giữ role `reader` và bỏ qua actor ID do client khai báo theo mặc định. Chỉ bật `SOURCE_READER_TRUST_ROLE_HEADERS=true` cho client quản trị đã tin cậy. Sau khi bearer token được xác thực, tùy chọn này cho phép client gửi cả `x-source-reader-user-id` và `x-source-reader-roles`; không bật nó cho client công cộng.

## Web routes

- `/crawl` — phân tích URL và tạo crawl job.
- `/library` — tìm kiếm, lọc và sắp xếp thư viện.
- `/library/:novelId` — metadata, chương và export.
- `/reader/:novelId/:chapterIndex` — reader toàn màn hình.
- `/tasks` — theo dõi crawl jobs.
- `/sources` — Source Reader plugins, credentials, network, challenges và inspector.
- `/settings` — theme, density, ngôn ngữ, reader và scheduler.

## API boundaries

- Novel analysis/library: `/api/novels/*`
- Chapter reads: `/api/novels/:id/chapters/*`
- Crawl commands/events: `/api/crawl/*`
- Task queries: `/api/tasks/*`
- Source Reader: `/api/source-reader/*`
- Search: `/api/search/*`
- Export: `/api/exports/*`
- Backup: `/api/backups/*`

Crawler chỉ đọc website qua Source Reader. Logic riêng theo website nằm trong plugin; core engine quản lý resolution, security, cache, authentication, browser, network và typed contracts.

## Tài liệu

- [Documentation index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Source Reader and plugin authoring](docs/SOURCE_READER.md)
- [E2E checklist](docs/E2E_TEST_CHECKLIST.md)
- [Backend architecture rules](docs/backend/BE_ARCHITECTURE_RULES.md)
- [Frontend FSD rules](docs/frontend/FSD.md)
- [Design system](docs/frontend/DESIGN_SYSTEM_V2.md)

Completed plans, reviews and checkpoints are intentionally absent from the working tree. Retrieve them through Git history when needed.

## V3 cutover safety

The V3 candidate is migrated into a sibling staging directory and must pass the
verification and candidate-smoke gates before storage roles change. The storage
cutover writes a journal and retains the V22 backup; rollback restores the exact
source manifest and keeps failed V3 storage for diagnosis. Run
`npm run rehearse:v3:cutover` before an operator-led swap, then follow the
[cutover](docs/V3_CUTOVER.md) and [rollback](docs/V3_ROLLBACK.md) runbooks.
