# Cleanup review

## Da don dep

- Gom tat ca tai lieu Markdown ve `docs/`:
  - `docs/backend/` cho cac tai lieu BE / clean architecture.
  - `docs/frontend/` cho cac tai lieu FSD / FE.
  - `docs/changelog/` cho changelog.
  - `docs/ARCHITECTURE.md` cho kien truc tong.
- Xoa cac thu muc rong:
  - `apps/api/src/docs`
  - `apps/api/src/shared/utils`
  - `apps/web/src/entities/chapter/api`

## Nhan xet nhanh

Project da dung huong monorepo:

- `apps/api`: Express + TypeScript, module-monolith, chia theo domain/application/infrastructure/presentation.
- `apps/web`: React + Vite + Tailwind, theo FSD.
- `packages/shared`: noi dat type/schema dung chung.
- `scripts/setup-termux.sh`: phu hop muc tieu chay tren Android Termux.

## Nen clean tiep

1. Root hien tai da sach hon, nhung README nen them link den cac doc trong `docs/` de de tim.
2. Backend dang import bang relative path rat sau (`../../../../`). Nen them path alias cho API neu muon code de doc hon.
3. Domain value-object cua BE dang import `ValidationHttpError` tu shared HTTP error. Ve clean architecture, domain khong nen phu thuoc HTTP. Nen tach `DomainValidationError` hoac error rieng o domain/shared core.
4. `packages/shared` hien moi rat mong. Nen dua cac DTO/API contract chung giua BE-FE vao day de tranh lech type.
5. Chua co test. Nen them test toi thieu cho value-object, use-case crawl/analyze, va API controller.
6. Chua thay lockfile. Nen commit `package-lock.json` sau khi `npm install` de Termux cai on dinh hon.

## Huong phat trien tiep de it vo kien truc

Uu tien tiep theo:

1. Chuan hoa API contract trong `packages/shared`.
2. Them path alias cho backend.
3. Them layer test don gian.
4. Hoan thien source adapter crawler that dau tien.
5. Them job/progress realtime sau khi core crawl on.
