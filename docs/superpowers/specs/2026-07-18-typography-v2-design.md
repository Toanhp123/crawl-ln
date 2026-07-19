# Typography V2 Design

## Goal

Make semantic typography the only sizing and line-height system used by the web application UI, while keeping reader prose typography independent.

## Scope

- Application UI under `apps/web/src` must use `type-*` semantic utilities or the shared `Text` component for font size and line height.
- Remove Tailwind size utilities such as `text-xs`, `text-sm`, `text-base`, and `text-lg` from TSX.
- Remove direct line-height utilities such as `leading-5`, `leading-tight`, and `leading-[var(--type-...)]` from TSX.
- Keep font weight, tracking, color, truncation, alignment, and tabular-number utilities as independent concerns.
- Reader prose and reader preview remain controlled by reader-specific CSS variables through a dedicated semantic class, not Tailwind text-size utilities.
- Add a source-level architecture guard that fails when forbidden typography utilities return.

## Architecture

`shared/theme/typography.css` remains the runtime source of truth for font size and line height. Semantic classes (`type-body`, `type-supporting`, and related roles) own both properties. `Text` composes these semantic classes with tone and weight, while Radix primitives or native elements may use the same `type-*` classes directly when wrapping them in `Text` is impractical.

A regression test scans all web TSX files and blocks raw Tailwind font-size and line-height utilities. This prevents future feature code from bypassing the design system.

## Semantic roles

- `type-display`: rare hero/display text
- `type-headline`: page titles
- `type-title`: section titles
- `type-title-sm`: card and compact titles
- `type-body`: primary UI copy
- `type-body-sm`: compact primary copy and form values
- `type-label`: controls and field labels
- `type-supporting`: descriptions and helper copy
- `type-metadata`: sources, timestamps, counts
- `type-caption`: badges and tertiary status
- `type-metric-sm`, `type-metric-lg`: numeric metrics
- `reader-prose-preview`: reader settings preview only

## Constraints

- Do not change route, state, API, crawler, reader lifecycle, or reader persistence behavior.
- Do not change the underlying typography token values in this task.
- Preserve minimum 44px touch targets.
- No new runtime dependency.
