# Settings Capability Matrix

| Setting | Capability | Persistence | UI |
|---|---|---|---|
| Theme/accent/density | Implemented | localStorage | Enabled |
| Reader typography | Implemented | localStorage | Enabled |
| Language | Implemented | localStorage | Enabled |
| Keep awake | Browser capability | localStorage + Wake Lock | Enabled with graceful fallback |
| Crawler configuration | Server/source-profile managed | Server files | Informational only |
| Storage | SQLite on API host | API host | Informational only |
| Download controls | No independent capability | — | Not displayed |
