# BE Pragmatic Clean Refactor

- Reduced infrastructure nesting.
- Added domain value objects for URL/title/chapter index/crawl status.
- Added domain entities with business methods.
- Moved id/time creation out of AnalyzeNovelUseCase infrastructure dependency.
- Reworked crawl queue to use domain methods for task/chapter/novel state transitions.
- Added architecture review documenting pragmatic clean rules.
