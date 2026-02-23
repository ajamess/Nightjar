# Nightjar v1.8.11 — Workspace Data Persistence on Mobile

## Summary

Critical fix for workspace data disappearing on mobile/web after the app is backgrounded or reopened hours later. The root cause: workspace **metadata** (document list, folders, members, workspace settings) was only synced over the network via y-websocket — it had **zero IndexedDB persistence** on web/mobile. When the app reopened and WebSocket hadn't re-synced yet, the user saw a completely empty workspace.

Document **content** was already persisted to IndexedDB (via `EncryptedIndexeddbPersistence`), but the workspace-level Y.Doc that tracks *which* documents exist was network-only.

## Bug Details

| Data Layer | Electron | Web/Mobile (before) | Web/Mobile (after) |
|---|---|---|---|
| Workspace list (names, IDs) | Sidecar LevelDB | localStorage ✅ | localStorage ✅ |
| Workspace metadata Y.Doc | Sidecar LevelDB | **Network only** 🔴 | **Encrypted IndexedDB** ✅ |
| Document content Y.Doc | Sidecar LevelDB | Encrypted IndexedDB ✅ | Encrypted IndexedDB ✅ |
| File chunks | Sidecar LevelDB | IndexedDB ✅ | IndexedDB ✅ |

## Changes

### Fix 1: Workspace Metadata IndexedDB Persistence (`useWorkspaceSync.js`)
- Added `EncryptedIndexeddbPersistence` for the workspace metadata Y.Doc on web/mobile
- Uses `workspaceKey` from the keychain for encryption (deterministic, survives session restart)
- DB name pattern: `nightjar-ws-meta-{workspaceId}`
- Skipped on Electron (sidecar LevelDB handles persistence)
- Provider properly destroyed on cleanup

### Fix 2: Persistent Storage Request (`AppNew.jsx`)
- Added `navigator.storage.persist()` call on app startup (web/mobile only)
- Prevents iOS Safari and Android WebView from evicting IndexedDB data under storage pressure
- Without this, iOS can silently delete IndexedDB after ~7 days of inactivity

## Test Results
- 6 new tests for IndexedDB workspace metadata persistence
- Full suite: **164 suites, 5,270 tests passing**

## Files Changed
- `frontend/src/hooks/useWorkspaceSync.js` — Import + IndexedDB provider creation + cleanup
- `frontend/src/AppNew.jsx` — navigator.storage.persist() on startup
- `tests/hooks/useWorkspaceSync.test.js` — 6 new tests
- `frontend/public-site/content/changelog.json` — v1.8.11 entry
