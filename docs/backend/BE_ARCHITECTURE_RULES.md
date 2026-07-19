# Backend Architecture Rules

## Module layout

```txt
modules/<name>/
  domain/          business types, interfaces, policies
  application/     use cases and application services
  infrastructure/  sqlite, http, filesystem, source adapters
  presentation/    controllers, routes, request DTOs
```

## Dependency direction

```txt
presentation -> application -> domain
infrastructure -> domain
shared/container -> everything for wiring only
```

## Rules

1. Controllers must not call repositories directly.
2. Routes must not instantiate repositories/use cases.
3. Use cases must not import Express types.
4. Domain must not import infrastructure.
5. Source-specific crawler code must stay in crawler infrastructure.
6. Shared code must not import modules.
7. All HTTP responses must use the response envelope helpers.
8. All route handlers must use `asyncHandler`.
9. New long-running work must use an application port + infrastructure service.
10. When a file grows past ~200 lines, split mapper/service/policy/helper.

## Adding a new source adapter

Add only:

```txt
modules/crawler/infrastructure/sources/example.adapter.ts
```

Then register it in:

```txt
shared/container/app-container.ts
```

Do not add source-specific code to `novels`, `chapters`, or controllers.
