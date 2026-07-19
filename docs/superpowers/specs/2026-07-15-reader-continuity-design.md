# Reader Continuity Design

## Goal
Keep reading state stable across reloads and make it visible throughout Library, Novel Detail, and Reader without adding a backend dependency.

## Storage
Reading continuity remains local-first. The reader stores a paragraph anchor per chapter, one latest history entry per novel, paragraph bookmarks, and a compact set of read chapter indexes. Storage writes emit an application event so mounted screens refresh immediately; browser storage events cover other tabs.

## Experience
Library shows recently read novels and direct Continue actions. Novel Detail exposes Continue Reading, bookmark shortcuts, and read markers in the chapter list. Reader adds a bookmark toggle bound to the nearest paragraph anchor. Existing ratio fallback remains available when a paragraph cannot be restored.

## Constraints
- No API or database migration.
- Paragraph anchors remain the canonical position.
- Existing Reader routing and immersive shell remain unchanged.
- History is capped at 50 novels and bookmarks at 200 entries.
