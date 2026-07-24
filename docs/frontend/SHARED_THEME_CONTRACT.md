# Shared Theme and Settings Control Contract

The web application uses one shared theme for application UI. Reader-specific presentation remains owned by the Reader feature.

## Ownership

- `apps/web/src/shared/theme/` defines semantic colors, typography, spacing, radius, elevation, motion, touch targets, and Settings dimensions.
- `apps/web/src/shared/ui/` may consume only custom properties defined by `shared/theme`.
- A feature may define a custom property only when every consumer is inside that feature.
- A feature must not define a shared control height inside a feature stylesheet.

The static Web theme contract check rejects missing variables, shared UI variables owned only by a feature, and conflicting definitions in the same shared-theme selector.

## Touch and density

Primary interactive targets in Settings are at least 44 CSS pixels high. The `compact` density reduces spacing, not touch safety. The `comfortable` density may increase Settings rows and choices.

Required dimensions:

- `--control-touch-min`: 44px minimum interaction height;
- `--setting-choice-height`: density-aware choice height;
- `--setting-row-height`: density-aware full-row height.

## Choosing a primitive

Use `SegmentedControl` for a small set of short, horizontally related choices. Use `columns="auto"` when labels or four-way groups need responsive wrapping.

Use `SettingsChoiceGroup` for visual preferences such as theme, accent, density, and application font size. Choices wrap and keep text labels even when icons or swatches are present.

Use `SettingsOptionList` for list-like settings such as Language. The complete row is one radio target and the selected row includes a non-color cue.

Do not replace these contracts with page-local `min-height`, compressed caption typography, or fixed four-column layouts on narrow screens.

## Accessibility and motion

- Mutually exclusive choices use a labeled radiogroup and radio semantics.
- Arrow keys move and select among enabled options; native buttons support Enter and Space.
- Focus-visible rings must remain visible in light and dark themes.
- Selected state must not rely on color alone.
- Disabled choices are programmatically disabled and skipped by arrow navigation.
- Motion uses shared tokens and respects `prefers-reduced-motion`.

## Settings composition

Mobile Settings uses one-column cards and large controls. Desktop retains the grid while using the same primitives and tokens. Appearance, Language, App Font, and Reader remain separate capabilities. App Font state remains owned by `AppThemeProvider`; Reader state remains in the Reader feature.
