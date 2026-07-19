# BE Clean Architecture hardening

## Done

- Removed HTTP-specific errors from domain/application code.
- Added `shared/errors/app-error.ts` as application/domain-safe error model.
- Kept HTTP status mapping in `shared/http/error-middleware.ts` via `statusFromAppError`.
- Moved crawler policy/rate-limit dependencies behind application ports:
  - `RobotsPolicyPort`
  - `RateLimiterPort`
- Converted infrastructure services to adapters:
  - `AllowlistRobotsPolicyService`
  - `InMemoryRateLimiterService`
- Updated DI in `shared/container/app-container.ts` so infrastructure is wired only at composition root.
- Removed cross-module infrastructure import from `novels` repository to `chapters` mapper.
- Moved request/response contract primitives into `packages/shared` so BE/FE share DTO schemas and public API types.
- Added architecture guard:
  - `scripts/check-api-architecture.mjs`
  - `npm run check:arch`
  - root `npm run check` now runs the architecture guard first.

## Current backend boundary rule

Inside `apps/api/src/modules/*`:

- `domain` must not import `presentation`, `infrastructure`, or HTTP layer.
- `application` must not import `presentation` or `infrastructure`.
- `infrastructure` implements domain/application ports.
- `presentation` only parses HTTP input and calls use-cases.
- `shared/container/app-container.ts` is the composition root and is allowed to wire infrastructure.

## Verification

`npm run check:arch` passes.

Full TypeScript check could not be completed in this sandbox because dependencies are not installed and `npm install` timed out. Run this locally or in Termux after installing dependencies:

```bash
npm install
npm run check
npm run build
```
