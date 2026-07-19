# Mobile-First Reader App Redesign

Date: 2026-07-19
Status: Proposed, user-approved design pending written-spec review
Scope: Frontend information architecture and presentation refactor using the existing component system and application logic

## 1. Goal

Refocus the application from a crawler-management tool into a reader-first novel application while preserving the current crawler, task, source-plugin, library, reader, realtime, cache, backup, and export logic.

The redesign must:

- Be mobile-first.
- Reuse the current design system and existing components wherever practical.
- Make Library the default destination.
- Merge Crawl and Tasks into a single Activity experience.
- Move source-profile management out of Settings into a dedicated Sources area.
- Add a global add-novel action available throughout the main application shell.
- Make Reader a distraction-free full-screen experience.
- Adapt the same information architecture to desktop through a left sidebar.

## 2. Non-goals

This redesign does not:

- Replace the backend API or crawler architecture.
- Rewrite the frontend from scratch.
- Introduce a second component library.
- Change the core task lifecycle, realtime model, reader cache, reading-progress storage, backup, restore, or export semantics.
- Add new social, account, cloud-sync, recommendation, or marketplace features.
- Expose raw JSON as the default source-profile editing experience.

## 3. Chosen implementation approach

Use a soft frontend refactor.

Existing routes, pages, widgets, hooks, queries, and components will be recomposed into a new navigation model. Components may be split or extended when necessary, but their visual primitives and application logic should remain in use.

This approach is preferred over a parallel UI or full rewrite because it minimizes regressions and directly satisfies the requirement to reuse current components.

## 4. Information architecture

### 4.1 Mobile navigation

The persistent bottom navigation contains five positions:

1. Library
2. Activity
3. Global Add Novel action
4. Sources
5. Settings

The center action is visually elevated and behaves as a global action rather than a normal route tab.

### 4.2 Desktop and wide-tablet navigation

At a desktop breakpoint, the bottom navigation becomes a persistent left sidebar containing:

- Application identity
- A prominent `Add novel` button
- Library
- Activity
- Sources
- Settings
- Compact system status at the bottom

The main content area uses a bounded readable width instead of stretching all content to the full viewport.

### 4.3 Route model

Target routes:

```text
/library
/library/:novelId
/read/:novelId/:chapterId

/activity
/activity/:taskId

/sources
/sources/new
/sources/:profileId

/settings
```

Compatibility redirects:

- `/crawl` redirects to `/activity`.
- `/tasks` redirects to `/activity`.
- Existing source-management entry points inside Settings redirect or link to `/sources`.
- The application root redirects to `/library`.

Reader routes render through `ReaderShell`; all other primary routes render through `AppShell`.

## 5. Application shell

`AppShell` owns:

- Responsive bottom navigation or desktop sidebar.
- Global add-novel sheet/modal state.
- Safe-area and navigation padding.
- Activity badge state.
- Main content width and responsive gutters.
- Global toast feedback for add-novel actions.

`ReaderShell` remains separate and hides all application navigation.

The global add-novel action must not force a route change.

## 6. Global add-novel flow

### 6.1 Mobile presentation

Pressing the center action opens the existing `BottomSheet` at an appropriate mobile height.

Default content is intentionally minimal:

- URL input
- Paste-from-clipboard action
- Primary action: `Add to library`
- Collapsed `Advanced options` disclosure

The URL field receives focus when the sheet opens.

### 6.2 Advanced options

The collapsed advanced section may expose existing supported options such as:

- Source profile
- Crawl mode
- Auto-sync preference

No advanced setting should block the common paste-and-submit path.

### 6.3 Desktop presentation

The same flow opens in a centered modal or constrained overlay using current overlay primitives.

### 6.4 Submission behavior

On success:

1. Create the existing crawl/import task.
2. Close the sheet.
3. Show a success toast.
4. Update the Activity badge through existing realtime/query invalidation.
5. Provide a toast action to open Activity.

On validation failure, keep the sheet open and show field-level feedback.

On network or task-creation failure, keep the entered URL and show a concise error with retry support.

### 6.5 Reused implementation

Prefer reuse or extraction from:

- `AnalyzeNovelForm`
- `ImportNovelWizard`
- `CrawlCommandCard`
- Existing analyze/crawl hooks
- `BottomSheet`
- `Modal`
- `Field`, `Input`, `Button`, `InlineNotice`, and toast components

## 7. Library

Library is the default page and the primary home of the application.

### 7.1 Header

Mobile header includes:

- Title: `Library`
- Search action
- Filter/sort action

The add action is not duplicated in the header.

Search expands below the header or enters an equivalent compact search state using `SearchInput`.

### 7.2 Continue Reading

Use `ContinueReadingHero` as the first optional section.

It shows the most recently read novel with:

- Cover
- Novel title
- Current chapter
- Reading progress
- Primary `Continue reading` action

The whole hero is tappable. If there is no reading history, omit the section entirely rather than showing an empty placeholder.

Initial scope supports one primary recent item. Multi-item horizontal browsing is deferred.

### 7.3 Library grid

Reuse:

- `MobileLibrary`
- `LibraryGrid`
- `NovelLibraryCard`
- `NovelCover`

Responsive density:

- Mobile: 2 columns
- Tablet: 3–4 columns
- Desktop: 4–6 columns within the bounded content area

Cards prioritize:

- Cover
- Title
- Reading progress
- At most one high-priority status badge

Possible cover badges:

- New chapters
- Updating
- Error
- Completed

Badge priority must prevent visual stacking. Error and active update states outrank informational states.

Card overflow actions:

- Update now
- View details
- Export
- Manage
- Remove from library

### 7.4 Search, filter, and sort

Use `SearchInput` and `LibraryControlsSheet`.

Supported filtering:

- Reading status
- Novel status
- Source profile
- Has unread/new chapters

Supported sorting:

- Last read
- Last updated
- Name
- Date added

Active filters appear as compact chips below the header. Desktop may show controls directly in a toolbar.

### 7.5 Empty state

The empty Library state is reader-oriented and points to the global add action. It must not use crawler terminology as its main message.

## 8. Activity

Activity combines Crawl and Tasks into a single task timeline. It does not contain a permanent URL form.

### 8.1 Header

The header contains:

- Title: `Activity`
- Active-task count
- Filter action
- Overflow menu for history or batch actions

### 8.2 Timeline groups

The page contains three ordered groups.

#### Running

Running items use an expanded task card based on `CrawlTaskCard` and `TaskProgress`.

Display:

- Novel identity or source icon
- Novel title
- Source profile
- Current chapter and total when known
- Progress
- Current status or throughput
- Pause/resume action
- Cancel action

Tapping opens `/activity/:taskId`.

When several tasks run simultaneously, the first may use the most detailed form while additional cards use a denser variant.

#### Queued

Queued items use compact rows showing:

- Queue position
- Novel title
- Source
- Time added
- Cancel action
- Priority action only if supported by the existing backend

The UI must not imply reprioritization if no backend operation exists.

#### Recent

Recent history is grouped by date and shows:

- Novel title
- Final outcome
- Number of newly added chapters when available
- Completion time
- Retry action for failed tasks

History uses pagination or load-more behavior rather than rendering an unbounded list.

### 8.3 Filtering

Reuse task-filter logic from `TaskFilterBar`.

Mobile uses a bottom sheet; desktop may expose chips or toolbar controls.

Filters:

- All
- Running
- Queued
- Successful
- Failed
- Cancelled
- Source profile

### 8.4 Navigation badge

Activity navigation indicates:

- Active task count when one or more tasks run
- An error dot when failed activity has not been viewed
- No badge for ordinary successful history

The unseen-error concept should be local UI state unless a durable backend read-state already exists.

## 9. Sources

Sources becomes a top-level feature and is removed from Settings.

### 9.1 Sources list

Each `SourceProfileCard` displays:

- Source name
- Primary domain
- Operational state
- Default badge where applicable
- Number of library novels using the profile when available
- Last checked time
- Overflow actions

Operational states:

- Active
- Needs checking
- Error
- Disabled

Overflow actions:

- Set as default
- Test connection
- Duplicate
- Enable/disable
- Delete

Deletion must be guarded when novels currently depend on a profile. The UI should offer migration to another profile when the backend supports it; otherwise it must prevent deletion and recommend disabling.

### 9.2 Source detail: basic layer

The default detail view exposes:

- Profile name
- Domain
- Example URL
- Enabled state
- Default state
- Request delay
- Retry count
- Timeout
- robots.txt behavior
- Default auto-sync behavior
- Test connection action

### 9.3 Source detail: advanced layer

An initially collapsed advanced section exposes:

- Request headers
- User-Agent
- Novel metadata selectors
- Chapter-list selectors
- Chapter-content selectors
- URL normalization
- Parser options
- Test URL
- Parsed preview and detected chapter count

Use normal form controls as the primary editing experience. Raw JSON is allowed only as an expert import/export mode if retained.

### 9.4 Create source

The create flow supports:

1. Name and domain
2. Optional duplication from an existing profile
3. Example URL
4. Connection test
5. Save

A profile may be saved as `Needs checking` without a successful advanced-selector test, provided required fields are valid.

### 9.5 Reused implementation

Prefer reuse or extraction from:

- `SourcePluginsPanel`
- Existing source-plugin API and schemas
- `Field`, `Input`, `Switch`, `SegmentedControl`, `Card`, `InlineNotice`
- Existing confirmation and overlay primitives

## 10. Settings

Settings contains application preferences and system administration only.

### 10.1 Reading

Reuse `ReaderSettingsControls` and keep it synchronized with `ReaderPreferencesSheet`.

Settings may include:

- Reader theme
- Font family
- Font size
- Line height
- Content width
- Swipe chapter navigation
- Keep screen awake

### 10.2 Appearance

- Application theme: system, light, dark
- Display density when already supported
- Language
- Reduced motion
- Cover ratio/style only if already represented in application state

### 10.3 Sync and storage

Reuse:

- `AutoUpdatePanel`
- `BackupRestorePanel`

Include:

- Global auto-update policy
- Reader cache usage
- Clear reader cache
- Backup
- Restore

### 10.4 System

- API health
- Application version
- Database information
- Diagnostics
- Logs/runtime information where already available

`SourcePluginsPanel` is removed from Settings.

## 11. Reader

Reader is a full-screen, content-first experience using existing reading logic.

### 11.1 Preserved behavior

Preserve:

- `ChapterReader`
- `useChapterReaderPage`
- `useReaderProgress`
- `useSwipeChapterNavigation`
- `ReaderPreferencesSheet`
- `ChapterListSheet`
- IndexedDB cache
- Wake lock
- Reading continuity and stored position

### 11.2 Presentation

Default reader state hides application navigation and minimizes chrome.

Reader content:

- Is not wrapped in a card
- Uses reader theme and typography preferences
- Restores the saved position
- Uses a bounded line length on wide screens

### 11.3 Controls

A center tap toggles reader controls.

Top toolbar:

- Back
- Novel title
- Chapter title
- More menu

Bottom bar:

- Previous chapter
- Chapter list
- Next chapter

Controls auto-hide after inactivity, except while a sheet is open or keyboard focus requires them.

### 11.4 Gestures

Horizontal swipe changes chapter only after a clear horizontal threshold and must not interfere with vertical reading scroll.

Edge feedback should indicate a pending chapter transition when practical with current motion primitives.

### 11.5 Reader sheets

Chapter list:

- Search
- Current chapter highlight
- Read/cache state when available
- Fast navigation through large chapter lists

Preferences:

- Font
- Font size
- Line height
- Theme
- Content width
- Live preview

Reader menu:

- Reading preferences
- Novel information
- Restore/reload chapter
- Bookmark or report-content actions only if supported by existing application behavior

### 11.6 End of chapter

Show:

- Subtle divider
- Next chapter title
- `Read next chapter` action

Do not restore the main app bottom navigation at chapter end.

### 11.7 Desktop behavior

- Full-screen reader remains in use
- Content width is constrained
- Keyboard arrows may navigate chapters when focus is not inside an interactive control
- Chapter list may use a right-side drawer or fixed-width sheet

## 12. Visual direction

The visual style is reader-first, warm, and light.

Use existing theme tokens and primitives while adjusting composition toward:

- Warm off-white or soft neutral backgrounds
- Low-border surfaces
- Moderate corner radius
- Restrained elevation
- Clear typography hierarchy
- Accent color reserved for primary actions and meaningful state
- Covers as the strongest visual elements in Library

Dark mode remains supported but is not the default visual concept.

No new component library or unrelated visual system is introduced.

## 13. Responsive behavior

Mobile is the baseline.

Key rules:

- Bottom navigation and bottom sheets on mobile
- Sidebar and modal/drawer patterns on desktop
- Safe-area support for bottom navigation and reader controls
- Touch targets meet mobile usability expectations
- Hover-only behavior is never required
- Dense technical controls move behind progressive disclosure

## 14. Data and state flow

### 14.1 Existing data remains authoritative

Continue using current API clients, TanStack Query state, realtime invalidation, and page hooks.

The redesign should avoid duplicating server state into new global stores.

### 14.2 New shell-level UI state

Only lightweight UI state belongs in the shell:

- Add-novel overlay open/closed
- Advanced options expanded/collapsed
- Responsive navigation presentation
- Locally unseen Activity failure marker, if implemented

### 14.3 Cross-screen updates

Creating a task or receiving task updates should rely on existing query invalidation and realtime infrastructure so Library badges, Activity groups, and navigation badges remain consistent.

## 15. Error handling

- Global add form preserves user input after errors.
- Source test errors identify whether failure is request, domain, parsing, or selector-related when the backend provides that distinction.
- Activity failed tasks expose retry without requiring entry into detail view.
- Reader offline/cache errors retain readable cached content where possible and use the existing offline banner behavior.
- Destructive source and library actions use current confirmation dialogs.
- Unsupported backend actions must not be represented as enabled controls.

## 16. Accessibility

- Every icon-only action has an accessible label.
- Bottom navigation communicates selected state.
- The center add action has a clear accessible name and is not announced as a route tab.
- Sheets and modals trap focus and restore it on close.
- Reader controls remain keyboard operable.
- Reduced-motion preference disables nonessential transitions.
- Status is never communicated by color alone.

## 17. Testing strategy

### 17.1 Unit/component coverage

Add or update tests for:

- Responsive app navigation
- Global add-novel overlay
- Advanced-option disclosure
- Library badge priority
- Activity grouping
- Source profile status and deletion guard
- Reader control visibility and gesture thresholds

### 17.2 Integration coverage

Verify:

- Add novel creates a task and updates Activity
- Existing `/crawl` and `/tasks` links redirect correctly
- Source management no longer appears in Settings
- Source create/edit/test uses current APIs
- Reader preferences remain synchronized between Settings and Reader
- Task realtime updates refresh Library and Activity states

### 17.3 End-to-end coverage

Mobile viewport scenarios:

- Empty Library to add novel
- Add task and follow its progress
- Filter Activity
- Create/edit/test source profile
- Continue reading and change chapter
- Change reader preferences

Desktop viewport scenarios:

- Sidebar navigation
- Add-novel modal
- Bounded Library grid
- Reader keyboard navigation

### 17.4 Regression protection

Keep existing API, crawler, backup, export, cache, and task tests passing. Architecture-boundary checks must continue to pass after component extraction.

## 18. Migration sequence

Implementation should proceed incrementally:

1. Introduce target routes and compatibility redirects.
2. Refactor `AppShell` and responsive navigation.
3. Add global add-novel overlay using existing import logic.
4. Recompose Library.
5. Build Activity from existing Crawl and Tasks components.
6. Move source management into Sources routes.
7. Simplify Settings.
8. Restyle/recompose Reader controls.
9. Apply visual token refinements.
10. Complete regression, responsive, accessibility, and E2E verification.

At each step, the application should remain runnable.

## 19. Acceptance criteria

The redesign is complete when:

- The root application opens Library.
- Mobile navigation is Library, Activity, global Add, Sources, Settings.
- Desktop uses a left sidebar and a prominent Add novel action.
- Crawl and Tasks no longer exist as separate primary navigation destinations.
- Activity shows Running, Queued, and Recent groups.
- Add novel is available globally and defaults to a URL-only flow.
- Source-profile management is a dedicated top-level area with basic and advanced layers.
- Settings contains no source-management panel.
- Reader is full-screen and hides application navigation.
- Existing reader progress, cache, realtime, task, crawler, backup, restore, and export behavior continues to work.
- The existing component system remains the sole UI foundation.
- Mobile, desktop, accessibility, and regression tests pass.
