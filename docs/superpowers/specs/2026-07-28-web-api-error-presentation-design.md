# Web API Error Presentation Design

## Goal

Show the backend-provided error message as the user-facing explanation. Keep diagnostic fields available to developers without exposing them in the interface.

## Current Problem

The shared web error helper discards `ApiError.message` and renders the error code plus request ID. The application error interpreter also replaces some backend messages with generic localized text. As a result, useful backend explanations are hidden while implementation details become the primary UX.

## Decision

- Use `ApiError.message` as the primary user-facing description.
- Never append `ApiError.code`, `ApiError.requestId`, or `ApiError.details` to UI messages.
- Preserve all `ApiError` fields on the error instance for DevTools, logging, control flow, and typed conflict handling.
- Use a localized generic fallback only when no meaningful message exists.
- Keep error titles owned by each feature so the shared layer supplies only the description.

## Data Flow

1. The backend returns the standard failure envelope containing `code`, `message`, and `details`.
2. The HTTP client constructs an `ApiError` without changing those values.
3. Shared presentation helpers select `message` for display.
4. Toasts, banners, forms, and query boundaries display that message.
5. Developers can inspect the original `ApiError` object to access status, code, details, and request ID.

## Safety

The frontend treats the API envelope message as the backend's public message contract. The backend already converts unexpected failures to `Internal server error` and redacts structured source-reader details. The frontend must still never render `details`, because details are diagnostic data rather than user-facing copy.

## Compatibility

Existing code-based branches remain unchanged. Features can continue checking `ApiError.status`, `ApiError.code`, and typed `details` to handle conflicts or recovery flows. Only the final presentation string changes.

## Tests

- Prove that a backend message is shown unchanged.
- Prove that code, request ID, and details are absent from the presentation string.
- Prove that non-API errors retain their useful message.
- Prove that empty or unknown errors use the localized fallback.
- Retain architecture coverage requiring source-reader features to use the shared error helper.
