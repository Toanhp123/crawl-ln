# UI Foundation Phase 6 — Design System Audit

**Goal:** Close the design-system loop so feature and page UI compose shared primitives instead of rebuilding visual recipes.

## Completed scope

- Added shared `Switch` and migrated duplicate reader/settings toggle implementations.
- Added shared `IconTile` for canonical icon-container composition.
- Replaced padded `Surface` card recipes with `Panel` in task, search, backup, settings, crawl, and danger-zone UI.
- Removed remaining audited bare transitions, arbitrary rem typography, private toggle tracks, and raw `rounded-xl` recipes.
- Normalized `StatCard` through `Panel` and semantic `Text` metric roles.
- Documented Card/Panel/Surface ownership and the allowed boundary for arbitrary Tailwind formulas.
- Added regression guards for composition ownership, reusable controls, and audited styling rules.

## Audit result

- Shared primitives remain in active use; no exported primitive was identified as dead.
- Button, badge, card, panel, and surface variants in the public API all have production consumers.
- Structural arbitrary values that remain are token-backed formulas for safe areas, viewport limits, CSS-variable dimensions, and responsive grid math.
- Foundation is frozen after this phase; future visual work should happen through tokens and shared primitive composition.
