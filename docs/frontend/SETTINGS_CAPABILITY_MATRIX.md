# Settings Capability Matrix

| Setting | Capability | Persistence | UI |
|---|---|---|---|
| Theme, accent and density | Implemented | Browser local storage | Enabled |
| Reader typography and layout | Implemented | Browser local storage | Enabled |
| Language | Implemented | Browser local storage | Enabled |
| Keep awake | Wake Lock when supported | Browser local storage | Enabled with fallback |
| Scheduler and auto-update state | Server-managed | SQLite/API | Status and supported controls |
| Source plugins | Source Reader management | SQLite/plugin storage | Managed under `/sources` |
| Source credentials and routes | Source Reader secure management | Encrypted server storage | Managed under `/sources` |
| Crawler limits and runtime policy | Server environment | API host configuration | Informational unless an API exists |
| Storage location | SQLite on API host | API host | Informational |
| Independent download toggle | No standalone capability | — | Not displayed |

Settings UI must not present a control unless a real browser or backend capability can persist and enforce it.
