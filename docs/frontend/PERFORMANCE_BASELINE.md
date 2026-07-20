# Performance Baseline

## Command graph

The root package is the public command surface:

- `npm run build` compiles shared once, then API and Web locally.
- `npm run check` checks shared once, emits shared declarations once, then type-checks API and Web locally.
- `npm run verify` reuses the production build when running prepared integration tests.
- Workspace `build` and `check` commands never recurse into sibling workspaces.
- `npm run clean` is diagnostic maintenance, not a mandatory build step.

## Baseline before cleanup

Measured in the same installed workspace on 2026-07-20:

| Command | Wall clock | Structural observation |
|---|---:|---|
| `npm run check` | 20.29 s | Shared check ran three times; shared build once |
| `npm run build` | 15.28 s | Shared build ran three times |

## After cleanup

Measured in the same installed workspace after command cleanup:

| Command | Wall clock | Structural observation |
|---|---:|---|
| `npm run check` | 16.92 s | Shared check once; shared build once |
| `npm run build` | 12.24 s | Shared build once |

The measured wall-clock change was 3.37 seconds for `check` and 3.04 seconds for `build`. Timings are environment-specific; the durable acceptance condition is the one-pass command graph.

## Dependency and artifact audit

- Removed unused direct dependency `@radix-ui/react-tabs` and its four exclusive transitive packages.
- Retained `@endo/compartment-mapper`: removing it causes the SES external-plugin child process to fail during startup even though application source does not import it directly.
- Generated build, coverage and browser-test output is ignored and removed by `npm run clean`.
- API storage, plugin packages and `.env` are ignored but never removed by the clean command.

## Runtime UI policy

- Routes and heavy screens stay code-split where existing bundle measurement justifies it.
- Query polling pauses when realtime or screen lifecycle makes it unnecessary.
- Reading-position writes are throttled.
- Lists use bounded rendering and stable query keys.
- Build changes are accepted based on measured output and command structure, not arbitrary percentage targets.

