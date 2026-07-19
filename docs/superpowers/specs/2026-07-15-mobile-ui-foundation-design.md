# Mobile UI Foundation — Design Specification

## Goal

Bring the web app's shared visual foundation in line with the approved Novel Tool Design Bible while preserving all existing routes, data flow, API behavior, and page-level features.

## Scope

This phase standardizes semantic tokens, shared controls, the application viewport, desktop header, and mobile bottom navigation. It does not redesign Library, Crawl, Tasks, Reader, or Settings content.

## Design rules

- Mobile-first from 320px through 430px, with a centered app surface on wider screens.
- Four-column rhythm with 16px mobile gutters and 4px-based spacing tokens.
- Minimum interactive target of 44×44px.
- Header and navigation must respect device safe-area insets.
- Motion uses 180–220ms for ordinary state changes and must honor reduced-motion preferences.
- Components consume semantic CSS variables rather than hard-coded theme colors.
- Dark and light themes remain supported, with existing accent choices preserved.
- Existing component APIs remain source-compatible wherever practical.

## Theme foundation

The color system exposes canvas, elevated canvas, surface tiers, borders, primary text, secondary text, muted text, brand, success, warning, danger, info, and overlay values. Spacing follows 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px. Radius values expose 4, 8, 10, 12, 16, and 20px plus pill.

Mobile typography uses the approved 11, 12, 13, 14, 15, 16, 18, and 22px scale with explicit line heights and weights. Existing reader-specific preferences remain untouched.

## Shared components

Button, IconButton, Input, SearchInput, FilterChip, Badge, Card, Surface, Page, PageHeader, BottomSheet, and BottomNav receive consistent hover, pressed, focus-visible, disabled, and transition behavior. Button loading support is additive and does not break current call sites.

## Application shell

The viewport fills the small viewport height and uses a flex column. Main content grows naturally. On mobile, pages reserve the total bottom-navigation height including safe-area. The mobile navigation is fixed, centered, and constrained to a maximum app width on wide mobile/tablet canvases.

## Navigation

The bottom navigation contains Crawl, Library, Tasks, and Settings. Icons are 22px, labels are 11px, and each tab has a minimum 44px target. Active tabs use a subtle brand-tinted indicator without scaling the layout. Task count badges remain visible.

The desktop header remains available at 768px and above, with a restrained elevated surface, compact brand mark, and consistent navigation state styling.

## Validation

Run TypeScript checking and a production Vite build for the web workspace. Confirm that all existing component call sites compile and no new dependency is introduced.
