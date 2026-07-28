# Novel Tool 3.0.0

Novel Tool is a mobile-first application for analyzing novel sources, crawling and storing chapters, reading, searching, and exporting light novels. It is an npm workspace that runs the API and web application together.

## Requirements

- Node.js `>=22.12.0` (see `.nvmrc`).
- npm `>=10.0.0`.
- A supported desktop operating system: Windows, macOS, or Linux.
- Chromium is optional for browser-based source plugins and browser tests.

## Quick Start

From a clean checkout or release archive:

```bash
npm run setup
cp apps/api/.env.example apps/api/.env
npm run dev
```

The development URLs are:

- Web: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:3000/health`

See [Getting Started](docs/GETTING_STARTED.md) for platform-neutral setup and first-run troubleshooting.

## Public Commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install dependencies and validate the local toolchain. |
| `npm run dev` | Run the API and Vite development server together. |
| `npm run build` | Create a production artifact under `dist/`. |
| `npm run start` | Serve the API and SPA from the production artifact. |
| `npm run check` | Run formatting, TypeScript, architecture, documentation, and boundary checks. |
| `npm test` | Run the core reader-engine, plugin, contract, regression, and integration suites. |
| `npm run format` | Apply the repository formatter. |
| `npm run clean` | Remove build, cache, and report output. Add `-- --data` only when you intend to review data cleanup. |

All commands support `--help` and reject unknown options. To run browser tests, install the browser capability first:

```bash
npm run setup -- --browser
npm test -- --suite e2e
```

## Production

```bash
npm run build
npm run start
```

The production process serves `/health`, `/api/*`, static assets, and the SPA from one host and port. Configure the bind address, port, storage, CORS, and remote access token through environment variables; see [Configuration](docs/CONFIGURATION.md).

The full build also creates the first-party package at `dist/plugins/novelcool-2.0.0.source-plugin`. It is not installed or enabled automatically. Open `/sources/new`, choose **Install package**, upload the artifact, review its permissions, approve the requested hosts, and enable the exact version. See [Plugin Development](docs/PLUGIN_DEVELOPMENT.md) for the package contract and lifecycle.

## Data Cleanup

```bash
npm run clean
npm run clean -- --data
npm run clean -- --data --yes
```

The default cleanup keeps `.env`, the database, installed plugins, credentials, and browser state. Data cleanup prints absolute paths, checks application ownership markers, and asks for confirmation. `--yes` skips only the prompt; safety checks still run.

## Web Routes

- `/library` - search, filter, and sort the library.
- `/library/:novelId` - novel metadata, chapters, and export.
- `/library/:novelId/read/:chapterIndex` - full-screen reader.
- `/activity` - crawl jobs and progress.
- `/activity/:taskId` - crawl task details and events.
- `/sources` - source plugins, credentials, network profiles, challenges, and diagnostics.
- `/sources/new` and `/sources/:pluginId` - install and manage a source plugin.
- `/settings` - theme, density, language, reader, and scheduler settings.

The legacy `/crawl`, `/tasks`, and `/tasks/:taskId` routes redirect to `/activity`.

## Documentation

- [Documentation index](docs/README.md)
- [Getting Started](docs/GETTING_STARTED.md)
- [Configuration](docs/CONFIGURATION.md)
- [Plugin Development](docs/PLUGIN_DEVELOPMENT.md)
- [Security](docs/SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
