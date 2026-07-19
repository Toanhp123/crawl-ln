# Milestone 1.1 notes

This patch is focused on Android/Termux E2E stability and mobile UI polish.

## Fixed

- Web Toast no longer calls `crypto.randomUUID()` directly, so it works in Android browsers/WebViews where `randomUUID` is missing.
- API ID generator also has a `randomBytes` fallback.
- NovelCool chapter titles now prefer `.chapter-item-headtitle` inside each chapter link, avoiding titles like `Chapter 53 New 20 minutes ago`.
- Chapter URLs are normalized by removing query/hash/trailing slash duplication before dedupe/save.
- NovelCool profile updated with the chapter title selector fallback.
- Mobile layout uses smaller page/card/list spacing, tighter stats cards, compact Library cards, compact chapter URLs, and a single-column sticky action bar.

## After updating

Delete old NovelCool analyze results and analyze again to regenerate clean chapter titles/URLs.
