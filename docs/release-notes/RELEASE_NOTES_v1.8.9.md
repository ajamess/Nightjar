# Release Notes — v1.8.9

**Fix Share Link Auto-Open & File Download Retry (Issue #18)**

Two user-facing bugs persisted after v1.8.7: (1) clicking a share link while an identity was locked or being selected silently lost the link, and (2) file downloads failed immediately with "Connected peers: 0" instead of retrying. This release fixes both bugs, adds automatic workspace switching when re-joining an existing workspace via share link, and makes file downloads resilient with retry + re-bootstrap.

---

## 🔗 Bug A: Share Link Race Condition (Issue #18a)

### Root Cause

Two `useEffect` hooks with empty dependency arrays race on mount:

1. **Session key effect** runs first → calls `getKeyFromUrl()` which detects the share link fragment but doesn't store it → overwrites the URL fragment with the session key via `window.history.replaceState`
2. **Share link effect** runs second → reads the now-overwritten fragment → misses the share link entirely

Additionally, `handleIdentitySelected` (the IdentitySelector callback) never called `processPendingShareLink()`, so share links were always lost when using the identity selection path.

### Fixes Applied

| # | Fix | File | Description |
|---|-----|------|-------------|
| 1 | Store link before overwrite | `AppNew.jsx` → `getKeyFromUrl()` | When `isShareLinkFragment()` detects a share link, stores the full URL in `sessionStorage.pendingShareLink` with expiry **before** returning `null` |
| 2 | Wire identity selection | `AppNew.jsx` → `handleIdentitySelected()` | Added `setShowDeepLinkGate(false)`, `setPendingDeepLink(null)`, `processPendingShareLink()` — matching the pattern from `handleLockScreenUnlock` |
| 3 | Auto-switch existing workspaces | `AppNew.jsx` → `processPendingShareLink()` | Enhanced to parse the pending link, check if workspace already exists locally, and auto-switch with UX toast. Falls back to join dialog for new workspaces. Handles compressed `nightjar://c/` links via `parseShareLinkAsync` |
| 4 | Recover pre-stored links | `AppNew.jsx` → share link effect else branch | When the URL fragment has already been overwritten, checks `sessionStorage.pendingShareLink` for a fresh link stored by Fix 1, and processes it via `processPendingShareLinkRef` |

### Share Link Scenarios Verified

| # | Scenario | Flow | Result |
|---|----------|------|--------|
| 1 | No account → onboarding → join | Link stored → onboarding completes → `processPendingShareLink` opens join dialog | ✅ |
| 2 | Locked → unlock → join | Link stored → PIN entered → `handleLockScreenUnlock` calls `processPendingShareLink` | ✅ |
| 3 | Unlocked, no workspace → join | Link stored → effect fires → join dialog opens | ✅ |
| 4 | Unlocked, have workspace → switch | Link stored → `processPendingShareLink` finds existing workspace → auto-switches via `joinWorkspace()` → UX toast | ✅ |
| 5 | Unlocked, permission change → toast | Link has higher permission → `joinWorkspace` detects upgrade → toast: "Permission upgraded to owner" | ✅ |

### UX Toasts

| Condition | Toast Message |
|-----------|--------------|
| Switch to existing workspace | "Switching to **{name}**…" |
| Permission upgraded | "Permission upgraded to **{permission}** for **{name}**" |
| Already highest permission | "You already have **{permission}** access to **{name}**" |
| New workspace | Join dialog opens (no toast) |

---

## 📁 Bug B: File Download "Connected peers: 0" (Issue #18b)

### Root Cause

After v1.8.7 correctly wired the WebSocket transport parameters, file downloads still failed in practice because:
1. **No retry** — `useFileDownload` made a single attempt per chunk; if the first request returned null (peers not yet connected), the entire download failed immediately
2. **No re-bootstrap** — `FileTransferContext.requestChunkFromPeer` returned null when no peers were connected, with no attempt to re-establish the peer mesh

### Fixes Applied

| # | Fix | File | Description |
|---|-----|------|-------------|
| 5 | Retry with exponential backoff | `useFileDownload.js` | Wraps each chunk fetch in a retry loop: `MAX_RETRIES = 3`, `BASE_DELAY_MS = 2000`. Delays: 2s → 4s → 8s. Total: 4 attempts per chunk before failure |
| 6 | One-shot re-bootstrap | `FileTransferContext.jsx` | When `requestChunkFromPeer` finds 0 connected peers and 0 holders, triggers a single `peerManager.joinWorkspace()` with full auth credentials, waits 3 seconds, then checks peers again. Bounded to one attempt per request |

### Retry Ceiling Analysis

| Layer | Attempts | Delay |
|-------|----------|-------|
| useFileDownload retry loop | 4 per chunk (1 + 3 retries) | 2s, 4s, 8s between retries |
| FileTransferContext re-bootstrap | 1 per `requestChunkFromPeer` call | 3s wait for peers |
| **Total worst-case per chunk** | **4 × 1 = 4 network attempts** | **~17s max** |

### Cross-Platform Matrix Verified

| Scenario | Primary Path | Status |
|----------|-------------|--------|
| Web ↔ Web | WebSocket relay → WebRTC | ✅ Fully wired |
| Web ↔ Native | WebSocket relay → WebRTC | ✅ Fully wired |
| Native ↔ Web | WebSocket relay → WebRTC | ✅ Fully wired |
| Native ↔ Native | Hyperswarm (DHT) → WebSocket relay | ✅ Fully wired |

---

## 🧪 Tests

### New Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `tests/share-link-race-fix.test.js` | 27 | `getKeyFromUrl` storage, `handleIdentitySelected` wiring, `processPendingShareLink` auto-switch, share link effect else branch, `isShareLinkFragment` patterns, import verification |
| `tests/file-download-retry.test.js` | 25 | `useFileDownload` retry constants/backoff, `FileTransferContext` re-bootstrap logic, combined retry ceiling analysis |
| **Total new** | **52** | |

### Full Suite Results

| Metric | Value |
|--------|-------|
| Test suites | 163 passed |
| Tests | 5,244 passed, 6 skipped |
| Failures | 0 |
| Time | ~57s |

---

## 🔧 Technical Details

### Modified Files

| File | Purpose | Changes |
|------|---------|---------|
| `frontend/src/AppNew.jsx` | Main app component | 5 changes — `getKeyFromUrl` storage, `processPendingShareLink` auto-switch, `handleIdentitySelected` wiring, share link effect else branch, `processPendingShareLinkRef` |
| `frontend/src/hooks/useFileDownload.js` | File download hook | Retry loop with exponential backoff (MAX_RETRIES=3, BASE_DELAY=2000ms) |
| `frontend/src/contexts/FileTransferContext.jsx` | File transfer context | One-shot re-bootstrap when 0 connected peers |
| `tests/share-link-race-fix.test.js` | Share link race fix tests | 27 new tests |
| `tests/file-download-retry.test.js` | File download retry tests | 25 new tests |
| `package.json` | Version bump | 1.8.8 → 1.8.9 |

### New Imports in AppNew.jsx

```
parseShareLinkAsync, isCompressedLink  (from './utils/sharing')
```

### New sessionStorage Keys

| Key | Purpose | Lifetime |
|-----|---------|----------|
| `pendingShareLink` | Full share link URL preserved before fragment overwrite | Cleared after processing or 5-minute expiry |
| `pendingShareLinkExpiry` | Timestamp for `pendingShareLink` validity | Cleared with `pendingShareLink` |

---

## 📊 Statistics

| Metric | Value |
|--------|-------|
| Files changed | 6 |
| Insertions | ~280 |
| Deletions | ~15 |
| New tests | 52 |
| Test suites | 163 |
| Tests passing | 5,244 |

## 📋 Cumulative Feature Summary (v1.5 → v1.8.9)

| Version | Highlights |
|---------|------------|
| v1.5.0 | Inventory system, cross-app search |
| v1.5.13 | Clickable share links, relay mesh |
| v1.6.1 | File storage & transfer, chunk seeding |
| v1.7.0 | Mobile PWA, Capacitor bridge, responsive design |
| v1.7.3 | Workspace permissions, presence awareness |
| v1.7.4 | Fortune Sheet integration, multi-sheet support |
| v1.7.5 | Kanban boards with drag-and-drop |
| v1.7.7 | Public documentation site (night-jar.co) |
| v1.7.8 | Mobile bottom sheets, virtual keyboard handling |
| v1.7.9 | CSS custom properties, light/dark theme polish |
| v1.7.10 | E2E Playwright tests, mobile tap targets |
| v1.8.2 | Critical app launch crash fix, NativeBridge corrections |
| v1.8.3 | Copy link fix, ARIA roles, test selector cleanup |
| v1.8.4 | Critical spreadsheet sync fix (full-sheet JSON path) |
| v1.8.5 | Spreadsheet presence overlay, mobile keyboard fixes |
| v1.8.7 | Web P2P file transfer fix (Issue #17) |
| v1.8.8 | Automatic stale-build detection for PWA clients |
| **v1.8.9** | **Share link race condition fix + file download retry (Issue #18)** |
