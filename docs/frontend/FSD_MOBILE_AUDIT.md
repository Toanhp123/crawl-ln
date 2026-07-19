# Web FSD + Mobile Audit

## Status

This web app is now structured for continued development on Android/Termux:

- `app`: providers, shell, router, global styles only.
- `pages`: page composition only.
- `widgets`: large reusable page blocks.
- `features`: user actions and mutations.
- `entities`: domain UI and types.
- `shared`: api/config/lib/theme/ui primitives only.

## Mobile-first rules

1. Design for `320px` width first.
2. Prefer list cards on mobile, table on `md+` only.
3. Use bottom sheet/drawer for reading/config/action-heavy flows.
4. Main action must be reachable near thumb area.
5. Never hard-code colors, radius, shadows, spacing in business components.
6. Use `shared/theme/*` tokens and `shared/ui/*` components.

## Shared UI groups

- `actions`: Button, IconButton, ActionBar.
- `data-display`: ListRow, DataTable, Pagination, StatCard.
- `feedback`: Toast, Alert/Error, Loading, Empty, Progress, Skeleton, Spinner.
- `forms`: Field, Input, SearchInput.
- `layout`: Page, PageHeader, Card, Section, AppViewport.
- `navigation`: BottomNav.
- `overlay`: Modal, Drawer, ConfirmDialog.

## Performance notes

- Chapter list uses pagination.
- Queries use polling only where progress can change.
- Mobile avoids huge tables and horizontal overflow.
- Reader content is mounted only when a chapter is selected.
