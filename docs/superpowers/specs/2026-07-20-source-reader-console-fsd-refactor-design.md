# Source Reader Console FSD Refactor Design

**Goal:** Remove the remaining Source Reader console architecture debt without changing user-visible capabilities or the established design system.

## Decisions

- Keep `Drawer` for credential and network forms. It already renders as a bottom sheet on small screens and a right-side drawer on desktop.
- Keep `BottomSheet` for short, choice-oriented or quick-action flows. Do not replace long administration forms with the desktop modal form of `BottomSheet`.
- Preserve FSD dependency direction: `pages -> widgets -> features -> entities -> shared`.
- Remove `entities/source-reader-result`; inspection transport, result formatting and result UI belong to `features/inspect-source-url` because they have no independent business identity or consumers.
- Split large feature files into focused model/API/UI units. Feature public APIs continue to be exposed only through each slice `index.ts`.
- Keep secret values write-only. Closing an overlay always clears secret fields and edit forms always reset from the latest server metadata.
- Replace broad `Record<string, unknown>` management responses with explicit shared DTOs. The plugin health client uses the exact diagnostics response returned by the backend.
- Extend the existing `ScrollViewport` primitive with an element option so the Inspector can reuse it without nesting a second `<main>` landmark.

## File boundaries

### Network profile feature

- `model/networkProfileForm.ts`: form state, reset/normalization and request builders.
- `ui/NetworkProfileForm.tsx`: presentational form only.
- `ui/CreateSourceNetworkProfileButton.tsx`: create overlay and mutation.
- `ui/EditSourceNetworkProfileButton.tsx`: edit overlay, current-profile reset and mutation.
- `ui/SourceNetworkProfileActions.tsx`: enable/test/delete actions.

### Credential feature

- `model/credentialForm.ts`: create form state and create request builder.
- `model/credentialSecret.ts`: secret strategy mapping.
- `ui/CredentialSecretEditor.tsx`: write-only secret fields.
- `ui/CreateSourceCredentialButton.tsx`: create overlay and mutation.
- `ui/ReplaceSourceCredentialSecretButton.tsx`: secret replacement overlay.
- `ui/DeleteSourceCredentialButton.tsx`: destructive confirmation.

### Inspector feature

- `api/sourceReaderInspectionApi.ts`: six HTTP inspection operations and operation dispatcher.
- `model/sourceInspector.ts`: operation list, form state, request building and cursor extraction.
- `model/useSourceInspector.ts`: state/query/mutation controller.
- `ui/SourceInspectorForm.tsx`: controls and result actions.
- `ui/SourceReaderResultView.tsx`: provenance, warnings and bounded raw output.
- `ui/InspectSourceUrl.tsx`: feature composition only.

## Acceptance criteria

- Reopening an edit network Drawer restores the latest profile metadata and discards unsaved draft values.
- Closing any credential/network Drawer clears write-only secrets.
- No `source-reader-result` entity slice remains.
- No Source Reader feature file exceeds 220 lines.
- Long administration forms use `Drawer`; destructive confirmation uses `ConfirmDialog`; no new overlay primitive is introduced.
- Source Reader clients contain no `http<Record<string, unknown>>` management calls.
- FSD, web contracts, formatting, TypeScript, regression, integration and production build pass.
