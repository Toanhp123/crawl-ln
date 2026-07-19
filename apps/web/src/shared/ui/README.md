# Shared UI System

Shared UI is grouped by intent, not by random files:

- `actions`: Button, IconButton
- `forms`: Field, Input
- `feedback`: Toast, ErrorBanner, EmptyState, LoadingState, Skeleton, Spinner, Badge, Progress
- `overlay`: Modal, Drawer, ConfirmDialog, BottomSheet
- `layout`: Page, PageHeader, Section, Surface, Card, Panel
- `data-display`: Table, Pagination, StatCard, DataTable
- `navigation`: BottomNav

## Surface hierarchy

Use one primitive according to the content's role:

- `Surface`: structural page layer. It owns only background, border and radius. It never owns padding or shadow.
- `Card`: standalone content container. It owns canonical padding and one of the `flat`, `raised` or `floating` elevation levels. Interactive cards use the shared hover hierarchy.
- `Panel`: dense grouping inside a page, card, sheet or detail view. It owns compact padding and a subtle/default/inset surface, but never elevation.
- `Modal`, `Drawer` and `BottomSheet`: overlay surfaces. They use `--elevation-3`.
- `Toast`: transient floating feedback. It uses `--elevation-2`.

Do not use `Surface tone="elevated"`, arbitrary box-shadow values or feature-owned card primitives.

## Rules

1. Pages/widgets/features must import from `shared/ui`, not deep random component paths.
2. Do not create one-off buttons, cards, panels, modals, toasts or tables inside features.
3. New visual variants belong in shared UI + theme tokens first.
4. Entity UI may compose shared components but must not own design-system primitives.
5. Shared primitives use theme radius/elevation tokens, never pixel radii or arbitrary shadows.
6. Large lists must paginate or virtualize before they become slow on Android.

## Foundation audit rules

- Use `Card` for elevated content containers, `Panel` for dense padded groups, and `Surface` only for structural backgrounds. A `Surface` may be padding-free (`p-0`) but feature code must not turn it into a hand-built card with custom padding or shadow.
- Use `Switch` for boolean settings and `IconTile` for repeated icon containers. Do not create private toggle tracks or icon-box recipes in feature/page code.
- Typography must use `Text` roles or canonical `--type-*` tokens. Motion must use `--motion-*`; elevation must use `--elevation-*`.
- Arbitrary Tailwind values are limited to layout formulas backed by design tokens, safe-area calculations, or responsive grid math. Pixel/rem visual styling belongs in theme tokens or shared primitives.
- Shared primitives own focus, disabled, loading, hover, pressed, and reduced-motion behavior. Feature code composes primitives instead of restyling those states.
