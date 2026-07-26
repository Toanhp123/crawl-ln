# Novel Tool 3.0.0

Novel Tool là ứng dụng mobile-first để phân tích nguồn, crawl, lưu, đọc, tìm kiếm và xuất light novel. Repository là npm monorepo gồm API TypeScript modular monolith, web React theo Feature-Sliced Design và các package contract dùng chung.

## Yêu cầu

- Node.js `>=22.12.0`; phiên bản tham chiếu nằm trong `.nvmrc`.
- npm `>=10.0.0`; lockfile được duy trì bằng npm `10.9.2`.
- Windows x64/ARM64, macOS Intel/Apple Silicon, glibc Linux x64/ARM64 và Termux Android ARM64 là các nền tảng chính.
- Trên Android, không đặt project trong shared storage như `/storage/emulated/0/Download`; npm workspaces cần filesystem hỗ trợ symlink.

## Bắt đầu

Từ checkout hoặc archive sạch:

```bash
npm run setup
cp apps/api/.env.example apps/api/.env
npm run dev
```

`setup` kiểm tra phiên bản Node/npm, lockfile và native binding, chạy `npm ci`, rồi probe toolchain thật. Chromium không được cài trong setup thông thường. Khi cần browser crawl hoặc E2E:

```bash
npm run setup -- --browser
```

Địa chỉ development mặc định:

- Web: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:3000/health`

## Tám lệnh công khai

| Lệnh             | Hành vi                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run setup`  | Cài sạch dependencies và kiểm tra toolchain; thêm `-- --browser` để cài hoặc kiểm tra Chromium tùy chọn              |
| `npm run dev`    | Chạy API và Vite cùng nhau; `-- --target api` hoặc `-- --target web` chỉ chạy một phía                               |
| `npm run build`  | Tạo production artifact hoàn chỉnh tại root `dist/`; `-- --target api\|web` chỉ tạo build chẩn đoán                  |
| `npm run start`  | Kiểm tra manifest rồi phục vụ API và SPA bằng một Node process, một port                                             |
| `npm run check`  | Chạy format check, TypeScript, architecture, docs, command boundary và lockfile; chọn một nhóm bằng `-- --group ...` |
| `npm test`       | Chạy reader-engine, contract, regression và integration; chọn một suite bằng `-- --suite ...`                        |
| `npm run format` | Áp dụng Prettier cho toàn bộ source; chọn scope bằng `-- --target ...`                                               |
| `npm run clean`  | Xóa build/cache/report tạm; `-- --data` thêm development data vào kế hoạch xóa và yêu cầu xác nhận                   |

Mọi lệnh hỗ trợ `--help`, từ chối option không hợp lệ và dùng named flags. Workspace scripts là chi tiết nội bộ, không phải giao diện người dùng.

### Test trình duyệt

Browser E2E luôn được yêu cầu rõ ràng:

```bash
npm run setup -- --browser
npm test -- --suite e2e
```

Thiếu browser capability làm lệnh E2E thất bại rõ ràng; không có skip-and-green.

### Build và production

```bash
npm run build
npm run start
```

Build hoàn chỉnh được dựng trong staging rồi mới thay thế root `dist/`. Production phục vụ `/health`, `/api/*`, static assets và SPA fallback từ cùng một host/port. `HOST`, `PORT`, storage và security tiếp tục được cấu hình qua environment.

Build hoàn chỉnh cũng tạo plugin NovelCool tại `dist/plugins/novelcool-2.0.0.source-plugin`. Artifact này không được tự động cài đặt hoặc bật: mở `/sources`, tải package lên, duyệt quyền truy cập `novelcool.com` và `*.novelcool.com`, rồi chủ động bật phiên bản `2.0.0`. Xem [hướng dẫn Source Reader](docs/SOURCE_READER.md) để biết trust status và ranh giới runtime.

### Cleanup và reset dữ liệu

```bash
npm run clean
npm run clean -- --data
npm run clean -- --data --yes
```

`clean` thông thường giữ nguyên `.env`, database, plugin, credential và browser state. `clean --data` in các đường dẫn tuyệt đối, kiểm tra marker sở hữu ứng dụng và hỏi xác nhận. `--yes` chỉ bỏ qua prompt, không bỏ qua kiểm tra an toàn.

## Termux

Cài Node.js từ Termux, giữ project trong `$HOME`, rồi dùng cùng tám lệnh như desktop:

```bash
pkg install nodejs
npm run setup
npm run dev
```

Playwright không tự tải browser chuẩn trên Android. Chỉ yêu cầu browser khi đã cấu hình executable tương thích qua `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` hoặc `SOURCE_READER_BROWSER_EXECUTABLE`. Xem [Termux acceptance](docs/TERMUX_ACCEPTANCE.md).

## Cấu trúc

```text
apps/api                 Express, SQLite, ingestion queue, Source Reader
apps/web                 React, Vite, TanStack Query, Feature-Sliced Design
packages/shared          Public transport contracts
packages/source-plugin-sdk  Source plugin contracts
packages/reader-engine   Reader session engine
tests                    Contract, regression, integration và Playwright E2E
```

Backend modules chỉ giao tiếp qua public API/ports được composition root truyền vào. Frontend tuân theo:

```text
app → pages → widgets → features → entities → shared
```

## Cấu hình API

Các giá trị thường dùng nằm trong `apps/api/.env.example`:

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

API mặc định bind `127.0.0.1` và chỉ chấp nhận origin local được khai báo trong `API_CORS_ORIGINS`. File `apps/api/.env.example` bật `SOURCE_READER_LOCAL_ADMIN=true` để console quản trị hoạt động sau khi bạn chủ động copy file cấu hình. Nếu không có `.env`, Source Reader chỉ cấp quyền đọc.

### Truy cập LAN có chủ đích

Để bind ra LAN, đặt một host không phải loopback và token tối thiểu 32 ký tự:

```env
HOST=0.0.0.0
API_CORS_ORIGINS=http://192.168.1.50:3000
API_REMOTE_TOKEN=replace-with-at-least-32-random-characters
SOURCE_READER_TRUST_ROLE_HEADERS=false
```

Startup từ chối cấu hình LAN thiếu token mạnh. Request từ máy khác tới `/api/*` phải gửi `Authorization: Bearer <API_REMOTE_TOKEN>`; `/health` vẫn công khai cho process supervisor. Không đặt token trong URL hoặc log.

## Web routes

- `/library` — tìm kiếm, lọc và sắp xếp thư viện.
- `/library/:novelId` — metadata, chương và export.
- `/library/:novelId/read/:chapterIndex` — reader toàn màn hình.
- `/activity` — theo dõi crawl jobs.
- `/activity/:taskId` — chi tiết và sự kiện của crawl job.
- `/sources` — Source Reader plugins, credentials, network, challenges và inspector.
- `/sources/new` và `/sources/:pluginId` — cài đặt hoặc quản trị một source plugin.
- `/settings` — theme, density, ngôn ngữ, reader và scheduler.

Các route legacy `/crawl`, `/tasks` và `/tasks/:taskId` chỉ redirect sang `/activity`.

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
- [Termux acceptance](docs/TERMUX_ACCEPTANCE.md)
- [Backend architecture rules](docs/backend/BE_ARCHITECTURE_RULES.md)
- [Frontend FSD rules](docs/frontend/FSD.md)
- [Design system](docs/frontend/DESIGN_SYSTEM_V2.md)

Các design, plan và checkpoint Markdown dưới `specs/` là lịch sử kỹ thuật để truy vết, không phải hướng dẫn vận hành hiện tại.
