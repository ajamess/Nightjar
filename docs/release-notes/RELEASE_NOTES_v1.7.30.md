# Nightjar v1.7.30 Release Notes

**Release Date:** July 2025

This release fixes **Issue #15 — Document content and presence not syncing**. Despite v1.7.29 fixing the web client's room auth to use workspaceKey, document-level WebSocket connections still cycled connected→disconnected every ~300ms. Four interrelated race-condition bugs were identified and fixed across the sidecar, relay server, and frontend.

---

## 🐛 Root Cause: Sidecar Auth Race Condition + Server Token Persistence

### What Happened

When a workspace is shared, the Electron sidecar creates y-websocket documents *before* the frontend delivers the workspace encryption key via the `set-key` IPC message. The sidecar's `getKeyForDocument()` function fell back to `sessionKey` (a random per-app-instance key) when no per-document key was available, causing it to compute HMAC auth tokens that didn't match the web client's `workspaceKey`-based tokens. The relay server's first-write-wins model then rejected one side with 4403.

Compounding this, the `set-key` handler only checked for *absence* of an auth token (`!existingConn.authToken`) to decide whether to reconnect — but the connection already *had* a token (the wrong one from sessionKey), so the reconnection was skipped. Meanwhile, the server never cleaned up stale auth tokens, so the wrong token persisted indefinitely.

### Why It Wasn't Caught

The v1.7.29 fix correctly addressed the web client's auth path (using workspaceKey instead of sessionKey). But the sidecar has its own parallel auth path with different timing — the `doc-added` event fires before `set-key` arrives, creating a race window that web-only testing didn't exercise.

---

## ✅ Bug 1 Fix: Separate Relay Auth Key Lookup

**Problem:** `getKeyForDocument()` returned `documentKeys.get(docName) || sessionKey` — the sessionKey fallback caused wrong HMAC tokens for relay auth.

**Fix:** New `getKeyForRelayAuth()` function returns `documentKeys.get(docName) || null` (never falls back to sessionKey). All 5 relay connection paths now use this function:

| Call Site | File | Change |
|---|---|---|
| `connectAllDocsToRelay()` | `sidecar/index.js` | `getKeyForDocument` → `getKeyForRelayAuth` |
| sync-workspace relay fallback | `sidecar/index.js` | `getKeyForDocument` → `getKeyForRelayAuth` |
| workspace rejoin relay | `sidecar/index.js` | `getKeyForDocument` → `getKeyForRelayAuth` |
| doc-added handler | `sidecar/index.js` | `getKeyForDocument` → `getKeyForRelayAuth` |
| set-key handler | `sidecar/index.js` | Uses key directly from message (correct) |

When `getKeyForRelayAuth()` returns null, the relay connection is **deferred** until the `set-key` handler delivers the correct key.

---

## ✅ Bug 2 Fix: Token Mismatch Detection in set-key Handler

**Problem:** The set-key handler checked `!existingConn.authToken` to decide whether to reconnect. But the connection already had a (wrong) token from sessionKey, so this condition was always false.

**Fix:** Changed to `existingConn.authToken !== newAuthToken` — detects token *mismatch*, not just absence. When the correct workspaceKey arrives:

1. Computes the new auth token
2. Compares with the existing connection's token
3. If different → disconnect + reconnect with the correct token
4. If no connection exists → connect for the first time

---

## ✅ Bug 3 Fix: Server Auth Token Cleanup

**Problem:** The relay server's `roomAuthTokens` Map entries were never deleted — not on doc destroy, not during stale cleanup. A wrong token from the race condition persisted for the entire server lifetime.

**Fix:** Added `roomAuthTokens.delete()` in two cleanup paths:

1. **Doc destroy handler** — when y-websocket destroys a doc (all clients disconnected)
2. **Stale doc cleanup interval** — periodic sweep of docs with 0 connections for >24 hours

Both use the correct `yws:${roomName}` prefix key matching the validation path.

---

## ✅ Bug 4 Fix: Deferred WebSocket Connection for Browser Async Auth

**Problem:** `useWorkspaceSync.js` created the WebSocket provider with `connect: true`, causing an immediate unauthenticated connection attempt in browser mode (where `computeRoomAuthTokenSync()` returns null). This got 4403 rejected, then the async fallback computed the token and reconnected — but the initial rejected connection wasted a round trip and could register wrong server state.

**Fix:** Added `needsAsyncAuth` flag: when sync auth is unavailable but workspaceKey exists, the provider is created with `connect: false`. The async Web Crypto token is computed first, the auth-bearing URL is set, then `provider.connect()` makes the first (and only) connection with proper auth. This matches the existing pattern in `AppNew.jsx` for document connections.

---

## 📊 Cross-Platform Auth Matrix (All Paths Fixed)

| Path | Auth Source | Token Computation | Status |
|---|---|---|---|
| **Web → Web** | `getStoredKeyChain().workspaceKey` | Web Crypto async HMAC | ✅ Fixed in v1.7.29 + v1.7.30 |
| **Web → Native** | Same workspaceKey, matched by server | Same HMAC, first-write-wins | ✅ Fixed — server clears stale tokens |
| **Native → Web** | `set-key` delivers workspaceKey to sidecar | `computeRelayAuthToken()` | ✅ Fixed — no sessionKey fallback |
| **Native → Native** | Both sidecars get workspaceKey via `set-key` | Both compute identical HMAC | ✅ Fixed — race condition eliminated |

---

## 🧪 Testing

- **58 new tests** in `tests/relay-auth-race-fix.test.js` covering all 4 bugs
- **Updated 11 assertions** in `tests/relay-auth-sync.test.js` and `tests/document-auth-matrix.test.js` to match new code patterns
- **Fixed 2 pre-existing failures** in `tests/mobile-optimizations-v1.7.14.test.js` (completed TODO markers)
- **Full suite:** 5042 tests passing across 157 suites, 0 failures

---

## 📁 Files Changed

| File | Changes |
|---|---|
| `sidecar/index.js` | New `getKeyForRelayAuth()`, 5 relay auth call sites fixed, set-key mismatch detection |
| `server/unified/index.js` | `roomAuthTokens` cleanup in doc destroy + stale cleanup |
| `frontend/src/hooks/useWorkspaceSync.js` | `connect: false` + async auth pattern |
| `tests/relay-auth-race-fix.test.js` | 58 new tests |
| `tests/relay-auth-sync.test.js` | 9 assertions updated |
| `tests/document-auth-matrix.test.js` | 2 assertions updated |
| `tests/mobile-optimizations-v1.7.14.test.js` | 2 completed TODO tests updated |
