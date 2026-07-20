# Performance Baseline

## Command graph

The root package is the public command surface:

- `npm run build` prepares shared once, then emits API and builds Web locally.
- `npm run check` prepares shared once, then runs architecture, documentation, formatting, API and Web type checks.
- Shared preparation performs diagnostics and declaration emit in one TypeScript program instead of separate check and build passes.
- `npm run verify` runs lockfile, shared preparation, static/build gates, regression and integration without nested npm child commands.
- Test files run in bounded batches; external sandbox lifecycle suites remain isolated.
- Workspace `build` and `check` commands never recurse into sibling workspaces.
- `npm run clean` is diagnostic maintenance, not a mandatory build step.

## Baseline before cleanup

Measured in the same installed workspace on 2026-07-20:

| Command         | Wall clock | Structural observation                          |
| --------------- | ---------: | ----------------------------------------------- |
| `npm run check` |    20.29 s | Shared check ran three times; shared build once |
| `npm run build` |    15.28 s | Shared build ran three times                    |

## Final result after cleanup

Measured from a clean local clone after `npm ci` on 2026-07-20:

| Command          | Wall clock | Structural observation                                                            |
| ---------------- | ---------: | --------------------------------------------------------------------------------- |
| `npm ci`         |     4.78 s | 377 packages installed from the portable lockfile                                 |
| `npm run clean`  |     0.32 s | Only generated `dist` paths removed                                               |
| `npm run check`  |    12.10 s | One shared diagnostic/emit pass; all static and app type gates passed             |
| `npm run build`  |    11.72 s | Shared prepared once; API and Web production output built                         |
| `npm run verify` |    30.89 s | Complete static/build, 416 regression, 94 integration pass and 1 conditional skip |

Timings are environment-specific. The durable acceptance conditions are the one-pass command graph, bounded test processes and successful verification from a clean checkout.

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
