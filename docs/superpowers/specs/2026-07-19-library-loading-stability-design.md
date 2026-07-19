# Library Loading Stability Design

## Goal

Remove the transient Continue Reading skeleton that causes the Library controls to jump, while preserving Continue Reading whenever the current Library result already contains the matching novel.

## Design

- The Library list query remains the only network request used by the Library page.
- `useLibraryPage` resolves the newest reading-history entry against `novels.data.items`; it does not request `/api/novels/:id` separately.
- A missing or stale history entry produces no Continue Reading region and no loading placeholder.
- The search/filter toolbar renders before the optional Continue Reading hero so its position remains stable during the initial data transition.
- The existing card grid skeleton remains available only for the initial list query. Background refresh keeps existing cards visible and communicates progress through the refresh icon.

## Data Flow

1. Read local reading history.
2. Fetch the current Library page, ordered by reading history when the default reading sort is active.
3. Match the newest history entry by `novelId` against the returned list items.
4. Render `ContinueReadingHero` only when the match exists and the page is in the unfiltered novel scope.
5. Render nothing for stale history; do not reserve space and do not launch another query.

## Error Handling

- Existing list-query error behavior is unchanged.
- A failed background refresh retains current data and shows the existing error banner.
- A history entry whose novel is absent from the current list is treated as stale display data and ignored.

## Verification

- Regression contract proves there is no Continue Reading skeleton or detail query.
- Web type-check and Prettier pass.
- Full regression suite and production web build pass.
