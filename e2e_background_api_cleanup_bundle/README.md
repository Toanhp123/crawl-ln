# E2E background API cleanup

Centralizes stable background API mocks in `tests/e2e/runtime.fixture.ts` so Playwright does not proxy mock-test traffic to an unavailable API server.

Run from the project root:

```powershell
node .\e2e_background_api_cleanup_bundle\apply_e2e_background_api_cleanup.mjs .
```

The default verification runs the focused regression test, format check, type check, all browser E2E tests, and rejects output containing `http proxy error` or `ECONNREFUSED 127.0.0.1:3000`.

Options:

- `--skip-e2e`: apply and verify without launching Chromium.
- `--skip-verify`: apply source only.
- `--force`: overwrite a locally modified target file.
