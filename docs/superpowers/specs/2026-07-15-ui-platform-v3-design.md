# UI Platform v3 Design

## Scope

Deliver one final archive after four sequential phases: Design System Core, Reader Pro, Product Pages, and Quality Platform. Existing crawler/API behavior remains intact; UI controls that require unsupported backend capabilities are not faked.

## Phase 1 — Design System Core

Extend runtime appearance preferences with accent (`indigo|blue|emerald|amber`) and density (`compact|comfortable`). Apply these through `data-accent` and `data-density` before React mounts. Centralize motion, focus, state layers, typography, icon sizes, density, and reader layout tokens. Add reusable `SegmentedControl`, `BottomSheet`, and upgraded accessible toast/dialog behavior.

## Phase 2 — Reader Pro

Add persisted reader preferences for font family, font weight, page margin, alignment, indentation, hyphenation, drop cap, keep-awake, and toolbar visibility. Reader chrome hides after inactivity and toggles by center tap. Previous/next chapter remain keyboard-accessible; horizontal swipe navigation is supported. Reading progress and estimated reading time are displayed without changing backend data.

## Phase 3 — Product Pages

Make Library more native with search, sort and status filters, compact/comfortable density, and clearer continuation affordance. Simplify Crawl to the primary URL workflow and move explanatory material into a compact help disclosure. Tasks use a consistent download-manager list and localized number formatting. Export uses a mobile bottom sheet.

## Phase 4 — Quality Platform

Add typed i18n formatting helpers for plural, number, date and relative time. Add reduced-motion behavior, keyboard/focus/ARIA coverage, and regression audits for dictionary parity, theme/accent/density bootstrap, semantic color use, reader preferences, and design-token usage. Run full frontend type-check/build, crawler regression checks, and ZIP integrity checks.

## Constraints

- Mobile-first, default Dark Gray + Indigo + Compact.
- EN/VI only, using typed keys with exact parity.
- No direct Tailwind palette colors in application components.
- No unsupported pause/resume/priority or collection persistence controls.
- One final ZIP only.
