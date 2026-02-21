# Nightjar v1.7.28 Release Notes

**Release Date:** July 2025

This release fixes the **definitive root cause** of cross-platform sharing failure (Issue #13). Despite all relay auth, key delivery, and room name fixes in v1.7.25–v1.7.27, workspace data never actually reached the relay server because the sidecar's relay bridge used the **wrong wire protocol**.

---

## 🔥 Root Cause — Relay Bridge Protocol Mismatch

The y-websocket wire protocol uses a **two-layer binary format**:

| Layer | Type | Value | Description |
|-------|------|-------|-------------|
| **Outer** | `messageSync` | `0` | Sync protocol payload follows |
| **Outer** | `messageAwareness` | `1` | Awareness update follows |
| **Inner** (sync only) | `syncStep1` | `0` | State vector exchange |
| **Inner** (sync only) | `syncStep2` | `1` | State diff |
| **Inner** (sync only) | `syncUpdate` | `2` | Incremental Yjs update |

**The relay bridge (`sidecar/relay-bridge.js`) confused these two layers**, treating inner sync-protocol constants as outer message types:

### Bug 1: Outgoing SyncStep2 Responses
- **Before**: Sent `[1, diff]` (inner syncStep2 as outer type)
- **Server read**: Outer type `1` = `messageAwareness` → misinterpreted as awareness update
- **After**: Sent `[0, 1, diff]` (`messageSync` prefix + inner syncStep2)

### Bug 2: Outgoing Update Forwards
- **Before**: Sent `[2, update]` (inner syncUpdate as outer type)
- **Server read**: Outer type `2` = unhandled → **silently dropped**
- **After**: Sent `[0, 2, update]` (`messageSync` prefix + inner syncUpdate)

### Bug 3: Outgoing Awareness
- **Before**: Sent `[3, data]` (completely invented outer type)
- **Server read**: Outer type `3` = unhandled → silently dropped
- **After**: Sent `[1, data]` (`messageAwareness`)

### Bug 4: Incoming Message Dispatch
- **Before**: `case 0:` and `case 1:` both fell through to sync handler
- **Effect**: Server awareness messages (outer type 1) were fed into `readSyncMessage` → corrupted
- **After**: `case 0:` (messageSync) → sync handler; `case 1:` (messageAwareness) → awareness handler

### Result
**Data NEVER flowed from sidecar → relay server.** The server's Yjs doc stayed empty. When web clients connected and synced, they received nothing — exactly matching the Issue #13 diagnostic logs showing `documentsCount: 0, workspaceInfo: {}, membersCount: 0`.

---

## 🔧 Fixes

### 1. Relay Bridge Protocol Fix (`sidecar/relay-bridge.js`)
- Rewrote `_setupSync()` to use correct two-layer message encoding
- All outgoing sync messages now include the `messageSync = 0` outer prefix
- Update forwarding uses `syncProtocol.writeUpdate()` instead of raw byte writes
- Awareness messages use `messageAwareness = 1` (not `3`)
- Incoming message dispatch correctly separates sync (0) from awareness (1)
- Added comprehensive protocol documentation in code comments

### 2. Server Key Retention (`server/unified/index.js`)
- `writeState` no longer deletes encryption keys from `documentKeys` when a doc is destroyed
- Previously, when all clients disconnected from a room, the key was deleted
- This meant reconnecting clients couldn't decrypt persisted state
- Keys now persist in memory for the server's lifetime, enabling seamless reconnection

---

## 🧪 Testing

### New Test File: `tests/relay-bridge-protocol.test.js` (38 tests)

| Section | Tests | Description |
|---------|-------|-------------|
| Static Analysis | 9 | Verify source code uses correct protocol constants and patterns |
| Wire Protocol Encoding | 7 | Binary message format verification for all message types |
| Full Sync Round-Trip | 4 | End-to-end sync simulation: sidecar → server → web client |
| Cross-Platform Matrix | 5 | Native↔Web, Web↔Web, Native↔Native, concurrent edits |
| Server Key Retention | 3 | Verify writeState doesn't delete keys |
| Protocol Compatibility | 5 | Verify relay bridge matches standard y-websocket format |
| Edge Cases | 4 | Empty docs, large docs, echo prevention |

### Updated Test: `tests/relay-auth-sync.test.js`
- Updated `relay-bridge still validates update size` → `relay-bridge uses standard sync protocol`

### Full Suite
- **155 test suites, 4953 tests passing** (6 skipped, 0 failed)

---

## 📁 Files Changed

| File | Change |
|------|--------|
| `sidecar/relay-bridge.js` | Rewrote `_setupSync()` with correct two-layer wire protocol |
| `server/unified/index.js` | Removed `documentKeys.delete()` from `writeState` |
| `tests/relay-bridge-protocol.test.js` | **NEW** — 38 protocol verification tests |
| `tests/relay-auth-sync.test.js` | Updated 1 test for new protocol |
| `package.json` | Version bump to 1.7.28 |

---

## 🔍 How This Was Found

Issue #13 diagnostic logs showed the web client connecting to the relay server successfully (auth tokens matched, room name correct) but receiving completely empty workspace data. Deep analysis of the y-websocket server's `messageListener` revealed it reads an OUTER message type first, then dispatches. The relay bridge was sending messages with INNER sync-protocol types as the OUTER type, causing every data-bearing message to be either misinterpreted or silently dropped.
