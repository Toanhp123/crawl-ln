# Backend Architecture Rules

## Module structure

```text
modules/<module>/
  domain/          entities, value objects, policies and repository contracts
  application/     use cases, services and outbound ports
  infrastructure/  SQLite, HTTP, filesystem, process and external adapters
  presentation/    controllers, DTO validation, response mappers and routes
  public/          stable façade/types exported to other modules when needed
```

Not every module needs every folder. Add a layer only when it owns behavior for that layer.

## Dependency direction

```text
presentation → application → domain
infrastructure → application/domain ports
shared/container → module construction and wiring only
```

Rules:

1. Domain code never imports application, infrastructure, presentation, Express or SQLite.
2. Application code depends on domain and ports, not concrete adapters or HTTP types.
3. Controllers parse input, invoke a use case and map output; they never query repositories directly.
4. Routes register middleware/controllers only; they never construct repositories or use cases.
5. Infrastructure implements ports and may use database, filesystem, process, browser or network libraries.
6. Cross-module access goes through `public/` façades or explicit ports supplied by the composition root.
7. `shared` must not import feature modules.
8. Public JSON responses use the canonical `{ data, error }` helpers; 204 responses do not emit JSON.
9. Async Express handlers use `asyncHandler`; typed errors are mapped centrally.
10. Database records are mapped at the owning infrastructure boundary; raw rows do not escape repositories.
11. Module startup/shutdown is explicit and ordered in the app container.
12. Split files by responsibility when orchestration, mapping, policy and transport concerns become mixed; line count alone is not the reason.

## Source-specific behavior

Website selectors, parsing and source quirks belong only in Source Reader plugins:

```text
modules/source-reader/infrastructure/plugins/
```

Crawler, novels, chapters and controllers must not contain website-specific selectors or load plugin packages directly. Crawler depends only on its Source Reader port.

## Persistence ownership

- Novels own novel metadata and update settings.
- Chapters own chapter records/content.
- Task owns task queries and status representation.
- Crawler owns job orchestration and crawl persistence ports.
- Source Reader owns plugin, credential, session, cache, route and challenge state.
- Backup may coordinate all stores only inside maintenance mode.

## Adding functionality

Before adding a dependency between modules, define the smallest public operation or outbound port required. Register its concrete implementation in `apps/api/src/shared/container`; do not import an internal repository from the consumer module.

Run `npm run check:arch` and `npm run check:crawler` after changing boundaries.
