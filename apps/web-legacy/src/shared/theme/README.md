# Apple Books Compact visual foundation

The web app uses one visual language: **Apple Books Compact**. Runtime values are CSS custom properties in this folder. `apps/web-legacy/src/design/tokens.ts` is the typed public name map; it must never duplicate numeric values.

## Ownership

- `colors.css`: semantic application and state colors.
- `typography.css`: application type roles and independent Reader typography.
- `spacing.css`: the 4/8/12/16/24/32/40/48/64 rhythm.
- `radius.css`: small, control, card, overlay, and pill radii.
- `size.css`: touch targets, control heights, icon scale, and layout limits.
- `motion.css`: four durations and two Apple-like easing curves.
- `elevation.css`: four elevation levels.
- `component-tokens.css`: component aliases composed only from foundation tokens.
- `components.css`: reusable CSS recipes; it must not redefine tokens.

## Rules

1. Feature and page code must use shared primitives and semantic `Text` roles.
2. Do not introduce direct font sizes, line heights, radii, shadows, transition durations, or status-color alpha values.
3. Application spacing uses only the canonical rhythm. Reader paragraph spacing remains independently configurable.
4. Application icons use 20, 24, or 32 pixels. Smaller glyphs are allowed only inside badges or native third-party controls.
5. App font preferences override typography tokens only; they must not scale spacing or controls.
6. Reader preferences remain separate from application typography.
