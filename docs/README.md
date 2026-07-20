# Documentation

Tài liệu trong working tree chỉ mô tả hệ thống hiện tại và các quy tắc còn hiệu lực.

## System

- [Architecture](ARCHITECTURE.md)
- [Source Reader](SOURCE_READER.md)
- [E2E test checklist](E2E_TEST_CHECKLIST.md)

## Backend

- [Backend architecture rules](backend/BE_ARCHITECTURE_RULES.md)

## Frontend

- [Feature-Sliced Design](frontend/FSD.md)
- [Design system](frontend/DESIGN_SYSTEM_V2.md)
- [Frontend/backend contract](frontend/FE_BACKEND_CONTRACT_SYNC.md)
- [Mobile UX acceptance](frontend/MOBILE_UX_ACCEPTANCE.md)
- [Performance baseline](frontend/PERFORMANCE_BASELINE.md)
- [Settings capability matrix](frontend/SETTINGS_CAPABILITY_MATRIX.md)
- [UI state matrix](frontend/UI_STATE_MATRIX.md)

Code-owned guides remain beside their implementation:

- [Theme guide](../apps/web/src/shared/theme/README.md)
- [Visual style guide](../apps/web/src/shared/theme/VISUAL_STYLE_GUIDE.md)
- [Shared UI guide](../apps/web/src/shared/ui/README.md)

## Historical material

Completed plans, specs, checkpoints, audits and one-off review reports are preserved in Git rather than the active tree:

```bash
git log --all -- docs
git log --all -- path/to/removed-file.md
git show <commit>:path/to/removed-file.md
```

`CHANGELOG.md` remains the canonical release history and may mention retired behavior in older entries.
