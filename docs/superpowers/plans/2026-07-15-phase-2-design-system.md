# Phase 2 Design System Implementation Plan

**Goal:** Consolidate recurring web UI patterns behind shared typography, row, card, and sticky toolbar primitives without changing product behavior.

**Implemented scope:**
- Add semantic `Text` variants and tones.
- Promote `ListRow` as the common interactive/static list primitive while retaining `ListItem` compatibility.
- Add card padding, radius, elevation, and interactive variants.
- Add shared `StickyToolbar`.
- Add primary `IconButton` styling.
- Migrate settings rows, chapter list, task list, crawl task cards, library cards, and library toolbar.
- Add regression coverage for primitive availability and adoption.
