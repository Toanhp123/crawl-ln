# Novel Tool 2.9.6

- Global SQLite FTS5 search across novel titles, chapter titles, source names, and downloaded chapter content.

Ứng dụng mobile-first để phân tích, crawl, lưu, đọc và xuất light novel. Dự án chạy dưới dạng npm monorepo và hỗ trợ Android Termux.

## Kiến trúc

```text
apps/api       Express + TypeScript modular monolith
apps/web       React + Vite + Tailwind theo Feature-Sliced Design
packages/shared  Zod schemas và kiểu dữ liệu dùng chung
tests/regression  Regression tests cho crawler và UI platform
```

Backend dùng SQLite, background crawl queue và crawler platform dựa trên ports/adapters. Frontend được chia thành `app`, `pages`, `widgets`, `features`, `entities` và `shared`.

## Các trang web

- `/crawl` — phân tích URL, bắt đầu crawl và xem thống kê.
- `/library` — tìm kiếm, lọc và sắp xếp thư viện.
- `/library/:novelId` — tổng quan truyện và danh sách chương.
- `/reader/:novelId/:chapterIndex` — reader toàn màn hình.
- `/tasks` — theo dõi tiến độ crawl.
- `/settings` — theme, accent, density, ngôn ngữ, thiết lập reader và trạng thái scheduler.

## Cài đặt

Không chạy project trong `/storage/emulated/0/Download` trên Android vì shared storage có thể làm hỏng symlink npm workspace. Hãy giải nén vào `$HOME` của Termux.

```bash
cd ~
unzip /storage/emulated/0/Download/novel-tool-v2.3.0.zip
cd novel-tool
sh scripts/setup-termux.sh
npm run dev
```

Địa chỉ mặc định:

- Web: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:3000/health`

Trên desktop/Linux/macOS:

```bash
npm install
npm run dev
```

## Cấu hình API

Tạo `apps/api/.env` từ file mẫu nếu có và kiểm tra các giá trị chính:

```env
PORT=3000
STORAGE_DRIVER=sqlite
SQLITE_PATH=storage/novel-tool.sqlite
SOURCE_PROFILES_FILE=./config/source-profiles.json
```

Chỉ bật adapter cho nguồn bạn có quyền crawl hoặc nguồn cho phép sử dụng. Copy `apps/api/config/source-profiles.example.json` thành `apps/api/config/source-profiles.json`, sau đó cấu hình selector cho metadata, chapter list và chapter content.

## Script

```bash
npm run dev             # API và Web
npm run dev:api         # chỉ API
npm run dev:web         # chỉ Web
npm run check           # architecture guards và type-check toàn monorepo
npm run check:arch      # API architecture guard
npm run check:crawler   # crawler platform guard
npm run test:regression # Node regression tests qua tsx
npm run build           # production build toàn monorepo
npm run db:reset -w @novel-tool/api
```

## API chính

- `GET /health`
- `POST /api/novels/analyze`
- `GET /api/novels`
- `GET /api/novels/:id`
- `GET /api/novels/:id/chapters`
- `GET /api/novels/:id/chapters/:index`
- `POST /api/crawl/jobs`
- `DELETE /api/crawl/jobs/:id`
- `POST /api/crawl/jobs/resume`
- `GET /api/crawl/sources`
- `POST /api/exports/novels/:id` — export EPUB/TXT với range và downloaded-only.
- `GET /api/scheduler/status`
- `POST /api/scheduler/tick` — kiểm tra tối đa 5 truyện đến hạn, tối đa 3 lượt đồng thời.
- `PUT /api/novels/:id/auto-update`
- `GET /api/novels/:id/update-diagnostics`

Crawl task queries use `/api/tasks`; crawl creation and control use `/api/crawl/jobs`.

## Tài liệu

- `apps/web/FSD.md` — ranh giới FSD của frontend.
- `apps/web/src/shared/theme/README.md` — theme tokens và runtime preferences.
- `apps/web/src/shared/ui/README.md` — shared UI primitives.
- `docs/SOURCE_PROFILE.md` — định dạng source profile.
- `docs/MILESTONES_STATUS.md` — trạng thái milestone.
- `docs/superpowers/plans/2026-07-15-maintenance-and-fsd-cleanup.md` — kế hoạch bản vá 2.0.2.

## Runtime and verification

- Node.js `22.16.0` is the reference runtime (`.nvmrc`); Node `>=22.12.0` is required.
- npm `>=10` is required and the lockfile was generated with npm `10.9.2`.
- `npm run dev` starts API and Web together with coordinated shutdown.
- `npm run verify` runs architecture guards, type checks, regression tests, API integration tests, and production builds.
- `npm run test:e2e:install` installs Chromium for Playwright.
- `npm run test:e2e` runs the mobile browser smoke test.
- CI repeats the full verification pipeline on pushes and pull requests.


## UI/UX 2.1.0

The mobile-first interface uses four persistent destinations (Crawl, Library, Tasks, Settings) and a separate immersive Reader shell. Design and implementation specifications are stored under `docs/superpowers/ui-upgrade/`. The release includes semantic design tokens, safe-area navigation, operational dashboards, versioned local reading-position storage, and capability-backed settings.


## Export EPUB/TXT

Use the novel detail export sheet to create EPUB3 or UTF-8 TXT files. Exports can include all downloaded chapters or an inclusive chapter range.


## Dynamic source plugins

Source plugins are loaded from `sources/<plugin-id>/manifest.json` and `index.js`. Plugin API v2 provides a restricted context for HTTP requests, HTML parsing, logging and time. Manage plugins from Settings or `/api/plugins`.
