# BE Development Upgrade 003 - Shared Package Dev Fix

## Problem

On Termux/dev runtime, the API imported runtime schemas from `@novel-tool/shared`.
The shared package points to `dist/index.js`, so running the API before building shared caused:

```txt
ERR_MODULE_NOT_FOUND: Cannot find package .../@novel-tool/shared/dist/index.js
```

## Fix

- Added `build:shared` at the root.
- Made root `dev:api`, `dev:web`, and `dev` build `@novel-tool/shared` first.
- Made direct package scripts in `apps/api` and `apps/web` build shared first too.

## Termux usage

From project root:

```sh
npm install
npm run dev:api
```

If `node_modules` was created before this fix, reinstall cleanly:

```sh
rm -rf node_modules apps/api/node_modules apps/web/node_modules packages/shared/node_modules package-lock.json
npm install
npm run dev:api
```
