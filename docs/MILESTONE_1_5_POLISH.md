# Milestone 1.5 - Production Polish

## Scope

This pass keeps the crawler architecture stable and focuses on the issues observed during Android/Termux E2E testing.

## Fixed

- Mobile Library no longer renders as a horizontal strip on phones. It now uses a responsive grid: 1 column on mobile, 2 on tablet/wide panels.
- Page bottom spacing now reserves room for the fixed bottom navigation, so Recent Tasks and workspace content are not hidden behind the tab bar.
- Drawer/reader now uses a flex layout with a real scroll body and safe-area padding, reducing clipped content on Android browsers.
- Chapter display title now falls back to `Chapter <index>` when a site returns only `Chapter`.
- Chapter URL display is compact and truncates safely.
- Recent Tasks hides internal UUIDs from normal UI and shows user-facing task status/progress.
- NovelCool chapter fetch now extracts the chapter title before removing heading elements from content.
- NovelCool/HTML content pipeline now sanitizes common Patreon/support footers and star-divider blocks.

## Notes

If previously crawled chapters still show wrong titles/content, delete the old novel data and analyze/crawl again because the old values are already stored in SQLite.
