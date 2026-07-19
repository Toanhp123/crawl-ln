# Incremental Update and Durable Recovery Design

## Goal
Allow an existing novel to be checked for new chapters and queued without redownloading fetched chapters, while ensuring a paused/recovered crawl resumes the exact chapter snapshot selected when the task was created.

## Architecture
`UpdateNovelUseCase` re-analyzes the existing source URL through the current analyzer, which already preserves chapter IDs and fetched content by normalized chapter URL. It compares the before/after chapter sets, then creates a crawl task only when pending chapters exist. Crawl tasks persist their planned chapter IDs in SQLite; the queue consumes that immutable plan and filters already-fetched chapters idempotently on resume.

## API
`POST /api/novels/:id/update` returns `{ novel, newChapterCount, pendingChapterCount, task }`, where `task` is null when there is nothing to crawl.

## Recovery
Server startup continues moving interrupted tasks to `paused`. Resume reads the persisted task chapter plan, not the current novel-wide pending list. A chapter already stored as fetched is skipped safely.

## UI
Novel Detail exposes an Update action. Success reports either the number of new chapters queued or that the novel is already up to date, then invalidates novel/task queries.

## Constraints
No new runtime dependency. Existing databases migrate in place. Existing tasks without a persisted plan fall back once to the legacy pending-chapter selection for backward compatibility.
