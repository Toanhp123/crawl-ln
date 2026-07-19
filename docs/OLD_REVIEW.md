# Project Review

## Current cleanup

- Moved architecture document into `docs/ARCHITECTURE.md`.
- Current workspace only contains the `docs/` directory and project documents.
- No empty subdirectories were found that need removal.

## Architecture status

The selected architecture is clean and suitable for MVP:

- Monorepo layout.
- Backend: Express + TypeScript modular monolith.
- Backend style: Clean Architecture by module.
- Frontend: React + Vite + Tailwind + Feature-Sliced Design.
- Shared package for types, schemas, and constants.
- Source Adapter Pattern for each supported novel source.
- Safe crawler rules are clearly defined.

## Things to keep clean

### 1. Separate crawler from novel domain

Keep `crawler` responsible only for fetching/analyzing external pages.
Keep `novels` responsible for saved novels, chapters, status, and export ownership.

Do not let crawler code directly write storage. It should return results to use cases.

### 2. Do not overbuild packages early

For MVP, keep only:

```txt
packages/shared
```

Avoid adding many packages until the project actually needs them.

### 3. Add adapter allowlist from day one

Create a small config like:

```ts
allowedSources: ["public-domain-source"]
```

Every crawl should resolve to an adapter first. Unknown sources should be blocked by default.

### 4. Keep storage simple first

Use JSON storage in MVP. Do not start with SQLite unless JSON becomes painful.

Suggested early storage path:

```txt
apps/api/storage/novels/*.json
```

Later this can be replaced by SQLite repository without changing use cases.

### 5. Avoid frontend over-splitting

FSD is good, but MVP should stay practical:

```txt
pages/home
features/analyze-novel
features/crawl-novel
entities/novel
shared/api
shared/ui
```

Only add widgets when the UI actually grows.

## Recommended next development order

1. Create monorepo skeleton.
2. Setup backend Express TypeScript.
3. Add health route: `GET /health`.
4. Add shared Zod schemas.
5. Implement source adapter interface.
6. Implement one safe example adapter.
7. Implement `POST /api/novels/analyze`.
8. Add JSON repository.
9. Implement crawl flow with delay and max chapter limit.
10. Build React form to analyze URL.
11. Show chapter list and crawl progress.
12. Add export JSON/TXT.

## Suggested final structure for MVP

```txt
novel-tool/
  docs/
    ARCHITECTURE.md
    REVIEW.md

  apps/
    api/
      src/
        main.ts
        app.ts
        modules/
        shared/
      storage/

    web/
      src/
        app/
        pages/
        features/
        entities/
        shared/

  packages/
    shared/
      src/

  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
```

## Clean verdict

The plan is good. Main thing to avoid now is building too many abstractions before the first working flow.

Target first milestone:

```txt
URL -> analyze chapters -> crawl allowed chapters -> save JSON -> export TXT
```
