# UI State Matrix

| Screen   | Loading                    | Empty                          | Error                         | Refresh                    |
| -------- | -------------------------- | ------------------------------ | ----------------------------- | -------------------------- |
| Crawl    | Stats and analysis loading | Idle URL prompt                | Inline analyze/API error      | Stats preserve content     |
| Library  | Loading state              | Empty library / filtered empty | Error banner                  | Query refresh              |
| Tasks    | Loading state              | Empty filtered list            | Error banner                  | Refresh indicator          |
| Reader   | Novel/chapter loading      | Missing chapter content        | Error banner                  | No polling in chapter mode |
| Settings | Immediate local state      | Not applicable                 | Storage failures are nonfatal | Immediate persistence      |
