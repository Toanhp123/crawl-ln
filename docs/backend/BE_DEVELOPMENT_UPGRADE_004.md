# BE Development Upgrade 004 - Core Crawler Platform

Milestone 1 started. The crawler is now closer to a real platform instead of one hardcoded adapter.

## Added

- `HttpClientPort` with GET/POST/HEAD contract.
- `AxiosHttpClientAdapter` with timeout, redirect, headers and user-agent handling.
- `HtmlParserPort` with a Cheerio implementation.
- Original typed source configuration model and JSON repository.
- New selector profile format under `apps/api/config/source-profiles.example.json`.
- Robots policy now reads `robots.txt` for allowlisted hosts and respects `Disallow` and `Crawl-delay`.
- Selector adapter now uses injected ports: source profiles, HTTP client and HTML parser.

## Still not done

- Cookie jar persistence.
- Proxy implementation.
- Per-source advanced pagination.
- Chapter download persistence/resume belongs to Milestone 2.

## New API

- `POST /api/crawl/analyze` analyzes a URL using the crawler platform only. It returns metadata and chapter previews without saving a novel.
- Existing `POST /api/novels/analyze` still analyzes and saves the novel/chapter preview into local storage.
