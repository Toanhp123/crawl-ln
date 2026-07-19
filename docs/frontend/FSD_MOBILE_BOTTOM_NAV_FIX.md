# Mobile bottom nav fix

## What changed

- `HomePage` no longer owns raw layout wrappers for stack/split behavior.
- Shared components now provide common layout behavior:
  - `Stack`
  - `ResponsiveSplit`
- `Page` keeps the bottom-safe padding contract.
- `--height-bottom-nav` was increased to match the real fixed bottom tab height on Android Chrome.
- `.safe-bottom` now includes additional space above the bottom nav.

## Rule

Fixed bottom navigation must always be paired with page-level reserved bottom space. Do not put one-off bottom padding inside individual widgets such as `RecentTasks`.
