# Phase 4 Reader Core Design

## Goal

Build an immersive mobile reader that restores the nearest paragraph after layout changes, keeps controls out of the reading flow, and prepares the next chapter without changing the API.

## Scope

- Render every chapter paragraph with a deterministic DOM anchor.
- Persist a versioned paragraph anchor, local offset, and scroll-ratio fallback in local storage.
- Migrate legacy ratio-only positions on read.
- Restore the paragraph anchor after chapter content renders.
- Hide reader chrome while scrolling down, reveal it while scrolling up, and toggle it by tapping the reading surface.
- Add system, light, sepia, and dark reader-only color schemes.
- Prefetch the next chapter through TanStack Query.
- Keep chapter navigation, chapter list, preferences, wake lock, loading, empty, and error behavior intact.

## Architecture

Paragraph identity belongs to the chapter entity renderer. Browser measurement and restoration live in the read-chapter feature. The page composes those pieces and owns lifecycle behavior such as debounced persistence and chrome visibility. Reader color scheme remains a local reader preference and is applied through scoped semantic color variables.

## Error Handling

Storage and Wake Lock failures remain non-blocking. Missing paragraph anchors fall back to the saved scroll ratio. A changed or shortened chapter therefore remains readable instead of failing restoration.

## Verification

Run repository regression tests, integration tests, TypeScript checks, architecture checks, and production builds through `npm run verify`.
