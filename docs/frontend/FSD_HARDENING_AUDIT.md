# FSD hardening audit

## Current status

The web app is now acceptable as a maintainable FSD base, but it is still an MVP UI, not a finished design system.

## Fixed in this build

- `HomePage.tsx` no longer owns query/mutation state directly. It delegates orchestration to `pages/home/model/useHomePage.ts`.
- API read operations moved from `features/read-*` to entity APIs:
  - `entities/novel/api/novelApi.ts`
  - `entities/task/api/taskApi.ts`
- Domain response types moved to entity model:
  - `entities/novel/model/types.ts`
- All frontend requests now go through `shared/api/http.ts`.
- Raw `fetch` in feature code was removed.
- Error handling now uses:
  - `shared/api/errors.ts`
  - `ApiError`
  - `getErrorMessage`
  - `readApiError`
- Query keys are centralized in `shared/api/queryKeys.ts`.
- Debounce logic moved to `shared/lib/useDebouncedValue.ts`.

## Rules to keep

- `shared` must not import `entities`, `features`, `widgets`, or `pages`.
- `entities` may import only `shared` and domain types.
- `features` may import `entities` and `shared`.
- `widgets` may compose `features`, `entities`, and `shared`.
- `pages` may compose widgets/features/entities but should keep rendering thin.
- Raw `fetch` is allowed only in `shared/api/http.ts`.
- Do not throw plain backend text directly from components.
- Do not create one-off UI components inside pages/features when a shared component exists.

## Known next improvements

- Split `useHomePage.ts` later if it grows beyond 150 lines.
- Add ESLint boundary rules when dev environment is stable enough on Termux.
- Add runtime schemas for API responses with Zod after backend API stabilizes.
- Add a global route-level error boundary when multiple pages exist.
