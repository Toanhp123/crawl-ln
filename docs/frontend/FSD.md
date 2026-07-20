# Frontend Feature-Sliced Design

## Layers

```text
src/
  app/       providers, router, layouts and global styles
  pages/     route-level composition
  widgets/   large independent screen blocks
  features/  user actions and mutations
  entities/  domain reads, types and entity UI
  shared/    API client, config, utilities, theme and UI primitives
```

Dependency direction:

```text
app → pages → widgets → features → entities → shared
```

A lower layer never imports a higher layer. Slices in `entities`, `features`, `widgets` and `pages` do not cross-import sibling slices. Consumers import through each slice's public `index.ts`.

## Ownership

- **Pages:** URL state and composition only; no raw HTTP or business mutation logic.
- **Widgets:** coordinate independent features/entities and own loading/empty/error composition.
- **Features:** a user action, its validation, mutation/query invalidation and action-specific UI.
- **Entities:** backend read clients, entity queries, normalized display models and reusable entity views.
- **Shared:** domain-agnostic transport, query client, utilities, localization, theme tokens and primitives.

## Placement rules

- User action hook: `features/<action>/model/use<Action>.ts`.
- Entity query hook: `entities/<entity>/model/use<Entity>.ts`.
- Route composition state: `pages/<page>/model/use<Page>.ts`.
- Generic reusable hook: `shared/lib/useSomething.ts`.
- API paths use `shared/api/http.ts`; raw `fetch` is limited to documented binary/stream cases.
- Backend transport types come from `@novel-tool/shared` when public contracts exist.

## UI rules

- Reuse `shared/ui`; do not create local buttons, inputs, dialogs, cards or loading states when a primitive exists.
- Use semantic theme, typography, radius, elevation and motion tokens.
- Long forms/details use adaptive `Drawer`; short choices/quick actions use `BottomSheet`; destructive confirmation uses `ConfirmDialog`.
- Interactive targets and responsive behavior follow the mobile acceptance document.
- Secrets remain local write-only form state and never enter query keys or persisted cache.

## Reader module

`src/modules/reader` exposes a narrow reader engine façade. It is not a general alternative to FSD and must not accumulate unrelated screen/business code.

Run `npm run check:web-arch` after moving or adding slices.
