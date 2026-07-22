# Apple Books Compact Visual Style Guide

## Direction

The product is reading-first. Its visual authority is Apple Books Compact: calm hierarchy, restrained supporting copy, consistent rhythm, large enough touch targets, and minimal decoration. Do not mix Material dashboard density or Linear-specific microtype into feature code.

## Typography roles

| Role            | Default           | Use                                      |
| --------------- | ----------------- | ---------------------------------------- |
| Display         | 22/27, bold       | Rare hero or onboarding identity         |
| Page title      | 18/23, bold       | Top-level page identity                  |
| Section title   | 15/19, semibold   | Major page sections                      |
| Card title      | 14/18, semibold   | Card and row identity                    |
| Body            | 14/20             | Important readable UI content            |
| Body small      | 12.5/17           | Compact controls and secondary body copy |
| Supporting copy | 12 / 15           | Descriptions, helpers, subtitles         |
| Metadata        | 11 / 13           | Source, author, time, counts             |
| Caption         | 10.5/13           | Tertiary status and compact labels       |
| Label           | 11.5/15, semibold | Buttons, chips, tabs                     |

Reader chapter typography is intentionally separate.

## Rhythm

Use only 4, 8, 12, 16, 24, 32, 40, 48, and 64 pixels. Prefer 8px between a title and supporting copy, 12–16px between supporting copy and content, and 24px between major sections.

## Shape

- Small embedded surface: 12px.
- Inputs and buttons: 16px.
- Cards: 20px.
- Dialogs, drawers, and sheets: 28px.
- Chips and badges: pill.

## Icons

Use 20px for inline and metadata actions, 24px for toolbar actions, and 32px for hero/empty-state icons. Icon tiles may add container space but do not invent intermediate glyph sizes.

## Motion

- Instant: 80ms.
- Fast interaction: 120ms.
- Normal component transition: 180ms.
- Slow overlay/progress transition: 240ms.

Always respect reduced motion.

## Empty state

Empty states use one vertical column: icon, title, supporting copy, then the primary action. Title and supporting copy must be separate block elements. Keep supporting copy within 28 characters per line where practical and avoid fixed heights that create empty visual mass.

## Typography enforcement

Application TSX must not use Tailwind font-size utilities (`text-xs`, `text-sm`, `text-base`, `text-lg`, and related sizes) or direct `leading-*` utilities. Use the shared `Text` component or a semantic `type-*` class. Semantic typography owns font size and line height as one contract; tone, weight, tracking, truncation, and alignment remain separate concerns.

Reader prose remains independent. The reader settings sample uses `reader-prose-preview`, while chapter content continues to use reader preference variables.
