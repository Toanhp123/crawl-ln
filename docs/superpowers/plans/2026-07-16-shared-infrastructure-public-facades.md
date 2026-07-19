# Shared Infrastructure and Public Facades Implementation Plan

**Goal:** Move generic HTTP/HTML adapters out of the crawler bounded context and make backend public facades depend only on module-owned interfaces and model contracts.

**Architecture:** Generic technical adapters live under `shared/infrastructure` and implement shared ports. Module public APIs expose structural interfaces; composition roots constrain concrete implementations with `satisfies` while consumers remain unaware of concrete use-case and service classes.

**Verification:** API/FSD/contract guards, TypeScript checks, regression tests, integration tests, and production builds must pass without changing endpoints or response schemas.

## Completed tasks

- [x] Add regression coverage for shared adapter ownership and facade abstraction.
- [x] Move Axios HTTP and Cheerio HTML adapters to shared infrastructure.
- [x] Update crawler, plugin, and adapter regression imports.
- [x] Replace concrete service/use-case types in public facades with module-owned interfaces.
- [x] Move `UpdateNovelResult` into the novels application model contract.
- [x] Add architecture guards for cross-context infrastructure borrowing and concrete public facades.
- [x] Run full checks, regression tests, integration tests, and production builds.
