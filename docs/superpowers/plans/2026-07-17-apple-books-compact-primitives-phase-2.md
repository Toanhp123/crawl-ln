# Apple Books Compact Primitives Phase 2

**Goal:** Establish one compact composition API for cards, chips, empty states, list rows, sections, and toolbars.

**Implemented:**
- Canonical `Chip` primitive for status and interactive filters.
- `Badge` and `FilterChip` now compose `Chip`.
- Card composition adds `CardContent`, `CardDescription`, and `CardFooter`.
- Text exposes Apple Books semantic aliases: `pageTitle`, `sectionTitle`, `cardTitle`.
- Empty State supports regular/compact density and custom icons.
- List rows and sections use semantic compact typography.
- Canonical `Toolbar` owns sticky/elevated toolbar visuals.
- Regression contracts prevent duplicate chip and toolbar recipes.
