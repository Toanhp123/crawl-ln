# Mobile FSD Routing Design

## Goal
Split the single dashboard-like HomePage into route-backed mobile-first Crawl, Library, Tasks, Settings, and contextual Reader screens while preserving existing API behavior and FSD boundaries.

## Routes
- `/` redirects to `/crawl`
- `/crawl`
- `/library`
- `/reader/:novelId`
- `/reader/:novelId/:chapterIndex`
- `/tasks`
- `/settings`
- unknown routes redirect to `/crawl`

## Navigation
The main shell exposes four bottom tabs on mobile: Crawl, Library, Tasks, Settings. Reader is contextual and is opened from Analyze success or Library selection. Chapter reading hides the bottom tabs and uses a focused reader header and previous/next controls.

## FSD Boundaries
Pages own route composition and page-specific state. Entities continue to own query hooks and display components. Features continue to own mutations. Widgets compose reusable page sections. The route params become the source of truth for selected novel and chapter.

## UX
All main pages use one-column mobile layouts, 44px or larger touch targets, safe-area-aware fixed navigation, restrained cards, clear hierarchy, and no fake Settings controls. Analyze success navigates to the Reader overview.
