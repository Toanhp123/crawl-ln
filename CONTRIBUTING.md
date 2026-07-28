# Contributing

Thank you for improving Novel Tool. Keep changes focused, explain the user-visible result, and include regression coverage for behavior changes.

## Workflow

1. Fork the repository and create a short-lived branch from `main`.
2. Install dependencies with `npm run setup`.
3. Make the smallest change that solves the problem.
4. Run the focused tests while iterating, then run `npm run check` and `npm test` before opening a pull request.
5. Describe configuration changes, migration needs, and manual verification steps in the pull request.

## Quality Bar

- Preserve the public API envelope and typed error behavior.
- Do not commit secrets, local `.env` files, runtime data, generated reports, or private maintainer notes.
- Keep plugin-specific website logic inside the plugin package; use the SDK context for host capabilities.
- Add tests for bug fixes and new user-visible behavior.
- Update the relevant public guide and `CHANGELOG.md` when a workflow or configuration contract changes.

## Pull Requests

Use a clear title, include the motivation and test commands, and call out any browser or platform prerequisites. Small reviewable pull requests are preferred over broad cleanup mixed with feature work.

Security-sensitive reports should follow [Security](docs/SECURITY.md) instead of being opened as public issues.
