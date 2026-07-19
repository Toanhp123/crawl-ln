# Web FSD Audit

Status: usable for continued development.

## Improved

- `shared/ui` is no longer flat. Components are grouped by action, form, feedback, overlay, layout, data-display and navigation.
- Core app flow uses shared components for page header, loading, confirmation dialog, drawer reader, toast and table pagination.
- Theme tokens live under `shared/theme`, including colors, radius, text scale, component defaults and specialized component tokens.
- Chapter list is paginated to avoid rendering thousands of rows on Android.
- Reader opens in Drawer instead of expanding the whole page.
- Delete action uses ConfirmDialog instead of `window.confirm`.
- Mutations use Toast feedback.

## FSD boundaries

- `app`: providers, routing, shell and global styles.
- `pages`: screen composition only.
- `widgets`: large page blocks.
- `features`: user actions and API calls.
- `entities`: business UI for Novel, Chapter, Task.
- `shared`: API client, lib, theme and reusable UI primitives.

## Next recommendations

- Current route-level pages are `/library`, `/activity`, `/sources`, `/settings`, and their detail routes. Legacy `/crawl` and `/tasks` URLs only redirect to `/activity`.
- Move `HomePage` orchestration into small model hooks if it becomes longer than one screen.
- Add TanStack Table only when sorting/filtering requirements become complex.
- Add virtualization if chapter count reaches tens of thousands.
