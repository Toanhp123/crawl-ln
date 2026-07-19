# FSD rules for Novel Tool Web

## Public direction

- Pages compose widgets/features/entities.
- Widgets compose features/entities/shared UI.
- Features own user actions and mutations.
- Entities own domain reads, domain types and entity UI.
- Shared owns UI primitives, API client, lib helpers, config and theme tokens.

## Do not

- Do not put business API calls in `pages`.
- Do not put domain-specific logic in `shared`.
- Do not create a feature that only re-exports an entity API.
- Do not duplicate UI primitives in multiple folders.
- Do not use raw `fetch` outside `shared/api/http.ts`.
- Do not hard-code theme values when a token exists.

## Hook placement

- User action hook: `features/<action>/model/use<Action>.ts`
- Entity query hook: `entities/<entity>/model/use<Entity>.ts`
- Page composition hook: `pages/<page>/model/use<Page>.ts`
- Generic reusable hook: `shared/lib/useSomething.ts`
