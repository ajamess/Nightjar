# Source Code Bug Audit via Test Analysis

**Date:** 2026-02-19  
**Scope:** Functional bugs in source code revealed by test file analysis  
**Method:** Cross-referencing test mocks/assertions against actual implementation

---

## 🔴 CRITICAL (Security / Data Loss)

### 1. Authorization Bypass: Test ACTION_REQUIREMENTS Diverges from Source — Missing Actions in Production

**Test file:** `tests/authorizationBypass.test.js`  
**Source file:** `frontend/src/types/workspace.ts`

The test defines **14 actions** in its local `ACTION_REQUIREMENTS`:
```
kick-member, manage-settings, rename-workspace, change-workspace-icon
```
The production `PermissionAction` type in `workspace.ts` defines only **10 actions** and is **missing all four** of those. The `canPerformAction()` function in source will return `undefined` for the `required` variable when passed `'kick-member'`, `'manage-settings'`, `'rename-workspace'`, or `'change-workspace-icon'`.

This means `hasAtLeastPermission(permission, undefined)` is called. Depending on implementation, this could either **allow anyone** to perform these actions or **deny everyone** — but neither behavior is correct. The test passes because it uses its **own local copy** of the permission logic, completely decoupled from production code.

**Likely Bug:** Kick, rename-workspace, manage-settings, and change-workspace-icon actions have **no server-side/CRDT-side enforcement** through the canonical `canPerformAction()`. Any peer could inject these operations.  
**Severity:** 🔴 Critical — permission bypass in a P2P collaborative app

---

### 2. secureStorage Test Reimplements All Logic Locally — Real Module Never Tested

**Test file:** `tests/secureStorage.test.js`  
**Source file:** `frontend/src/utils/secureStorage.js`

The entire 692-line test file **never imports the actual `secureStorage` module**. Every test redefines `secureSet`, `secureGet`, `secureHas`, `secureClear`, `migrateToSecure`, and `sanitizeObject` as inline anonymous functions within the test. The real exported `secureSet`/`secureGet` from `secureStorage.js` is untested.

**Specific divergence found:** The test's `secureGet` mock on failed decryption does `delete mockLocalStorage[key]` (removes encrypted data). The **actual** `secureGet` explicitly does the opposite: `// do NOT remove the encrypted data`. This means:
- A bug in real `secureGet` that silently drops data would be undetected.
- The test claims "invalid data is removed on decryption failure" — the **opposite** of what production does.

**Likely Bug:** No integration test validates real `secureStorage` behavior; the real module could have regressions no test catches. Deletion-on-failure divergence means the test suite provides false confidence.  
**Severity:** 🔴 Critical — encrypted data handling for identity storage is untested

---

### 3. authorizationBypass Tests Are Entirely Self-Contained — Production Permission Logic Is Not Exercised

**Test file:** `tests/authorizationBypass.test.js`  
**Source file:** `frontend/src/types/workspace.ts`, `frontend/src/hooks/usePermission.js`

The test defines `canPerformAction`, `isAtLeast`, `getPermissionLevel`, and `PERMISSION_LEVELS` as **local functions** (lines 18–61). It never imports from `workspace.ts` or `usePermission.js`. If the production permission implementation drifted (e.g., someone added a backdoor or broke the level hierarchy), these tests would still pass.

The **real** `canPerformAction` in `workspace.ts` takes `(permission, action)` (permission first, action second). The **test** version takes `(action, permission)` (action first, permission second). This reversed parameter order means the test exercises a **different API surface** than production.

**Likely Bug:** Any regression in production `canPerformAction` is invisible to tests.  
**Severity:** 🔴 Critical — authorization logic is tested in isolation from production code

---

## 🟠 HIGH (Functional Bugs)

### 4. Deletion Test Reveals isElectron() Usage Bug Pattern

**Test file:** `tests/deletion.test.js` (lines 224–239, "isElectronMode variable should be boolean not function")  
**Source file:** `frontend/src/AppNew.jsx`

The test explicitly documents a known bug pattern:
```js
// WRONG: if (!isElectron) - function is always truthy
// CORRECT: if (!isElectron())
```

While `AppNew.jsx` line 338 correctly calls `const isElectronMode = isElectron()`, the test's existence suggests this bug **was found in production** and may exist in other files. A grep across the codebase should verify no other file uses `isElectron` without calling it.

**Likely Bug:** Possible remaining instances of `if (!isElectron)` (truthy function reference) instead of `if (!isElectron())` in other files, causing web-mode sync to be skipped.  
**Severity:** 🟠 High — would cause silent sync failure in web mode

---

### 5. Deletion Test's Electron-Mode Mock Diverges from Production: syncRemoveDocument Is Always Called

**Test file:** `tests/deletion.test.js` (lines 142–191)  
**Source file:** `frontend/src/AppNew.jsx` (lines 1379–1401)

The test's mock `deleteDocument` does:
```js
if (!isElectronMode) { syncRemoveDocumentMock(docId); }
```
This means the test says "in Electron mode, don't sync via Yjs."

But the **actual** `deleteDocument` in `AppNew.jsx` does:
```js
syncRemoveDocument(docId);  // ALWAYS — no isElectronMode guard
```
The production code **always** calls `syncRemoveDocument` regardless of mode, then **additionally** notifies the sidecar in Electron mode.

The test asserts `syncRemoveDocumentMock` is NOT called in Electron mode, which is **wrong** relative to the current source. Either:
- The test is stale (was correct for an older version), or
- The production code changed without the test being updated.

**Likely Bug:** Test provides false validation. If someone "fixed" production to match the test, Electron-mode deletions would stop propagating to P2P peers.  
**Severity:** 🟠 High — test/source mismatch around deletion sync; could mislead future developers

---

### 6. P2P Sync Test (`p2p-sync.test.js`) Is a Manual Integration Test, Not a Jest Test

**Test file:** `tests/p2p-sync.test.js`  
**Source file:** `backend/p2p.js`, `backend/crypto.js`

This file uses `require('ws')` and makes actual WebSocket connections to `ws://localhost:8080` and `ws://localhost:8081`. It defines its own `test()` function (line 148) and tracks results manually. **It is not a Jest test** and will never run in `npx jest`. The file header even says `Run with: node tests/p2p-sync.test.js`.

This means the critical P2P sync path (multi-client CRDT sync, conflict resolution, encryption of Yjs updates over WebSocket) has **zero automated test coverage** in the CI pipeline.

**Likely Bug:** P2P sync regressions would go undetected in automated testing.  
**Severity:** 🟠 High — core sync functionality has no automated coverage

---

### 7. `p2p-sync.test.js` Uses Deprecated `uint8ArrayToString` API That Doesn't Match Production

**Test file:** `tests/p2p-sync.test.js` (line 89)  

The test sends session keys as:
```js
uint8ArrayToString(this.sessionKey, 'base64')
```
But its own `uint8ArrayToString` (line 23) is `TextDecoder.decode(arr)` — it **ignores the second argument** ('base64'). This means the session key is sent as UTF-8 decoded bytes instead of base64, which would fail against any real server expecting base64.

**Likely Bug:** If this test were ever run against a real server, the session key exchange would fail due to encoding mismatch.  
**Severity:** 🟠 High — reveals an API contract misunderstanding in the P2P key exchange

---

## 🟡 MEDIUM

### 8. Security Test Prototype Pollution "Prevention" Test Actually Tests Inline Code, Not `sanitizeObject()`

**Test file:** `tests/security.test.js` (lines 144–161)  
**Source file:** `frontend/src/utils/secureStorage.js` (sanitizeObject)

The test does:
```js
const parsed = JSON.parse(malicious);
const sanitized = { ...parsed };
delete sanitized.__proto__;
delete sanitized.constructor;
```
This tests the test's own inline sanitization logic, NOT the real `sanitizeObject()` from `secureStorage.js`. The real `sanitizeObject` creates a `clone = {}` and skips dangerous keys, while the test's approach uses spread + delete. These have different behaviors (e.g., `__proto__` on a spread copy behaves differently than direct property access).

**Likely Bug:** Prototype pollution sanitization is not tested against the real function; subtle bypass vectors may exist.  
**Severity:** 🟡 Medium

---

### 9. Three Different `secureWipe` Implementations with Different Pass Counts

**Test file:** `tests/security.test.js` (tests backend 2-pass version)  
**Source files:** `frontend/src/utils/cryptoUtils.js` (4-pass), `backend/crypto.js` (2-pass), `frontend/src/utils/secureStorage.js` (2-pass)

Three different `secureWipe` implementations exist:
- `backend/crypto.js`: random → zeros (2 passes)
- `frontend/src/utils/secureStorage.js`: random → zeros (2 passes)
- `frontend/src/utils/cryptoUtils.js`: random → zeros → 0xFF → zeros (4 passes)

The security test only validates the backend version. The frontend `cryptoUtils.js` version is more thorough but untested. This inconsistency means sensitive key material may not be reliably wiped depending on which `secureWipe` is called.

**Likely Bug:** Inconsistent security-sensitive function implementations; modules may import the wrong version.  
**Severity:** 🟡 Medium

---

### 10. Stale Collaborator Cleanup Boundary Untested

**Test file:** `tests/collaboratorSync.test.js` (line 370)  
**Source file:** `frontend/src/utils/collaboratorSync.js` (line 341)

The test sets `lastSeen` to 8 days ago. The source threshold is 7 days. This passes, but:
- No test validates the **boundary case** — a collaborator at exactly 7 days.
- No test validates that a collaborator at 6 days 23 hours is NOT marked offline.

If someone changed the threshold from 7 to 14 days, the 8-day test would still pass.

**Likely Bug:** Stale threshold boundary is unvalidated; a threshold change would silently pass tests.  
**Severity:** 🟡 Medium

---

### 11. CRDT-Layer Permission Downgrade Not Protected

**Test file:** `tests/collaboratorSync.test.js`  
**Source file:** `frontend/src/utils/collaboratorSync.js`

The test validates that `addCollaborator` does not downgrade permissions (owner→viewer). However, there is no test for a **malicious peer** calling `collaboratorsMap.set()` directly (bypassing `addCollaborator`) via a Yjs CRDT merge. In a P2P app, any peer can write to the Y.Map. A malicious peer could:
```js
collaboratorsMap.set(ownerKey, { ...existing, permission: 'viewer' });
```
This would bypass the `addCollaborator` guard entirely.

**Likely Bug:** Permission downgrade protection exists only in application-layer helper functions, not in the CRDT layer.  
**Severity:** 🟡 Medium — fundamental to P2P threat model

---

## 🟢 LOW

### 12. Mnemonic Case-Sensitivity Test Asserts Type Only, Not Correctness

**Test file:** `tests/edge-cases.test.js` (lines 127–135)  
**Source file:** `frontend/src/utils/identity.js`

The test for case-insensitive mnemonic handling only asserts `typeof isValid === 'boolean'`. It doesn't check whether the result is `true` or `false`. This test passes regardless of behavior.

**Severity:** 🟢 Low

---

### 13. Error-Handling Tests Use Always-Passing Assertions

**Test file:** `tests/error-handling.test.js` (multiple locations)

Several tests follow this pattern:
```js
const result = (() => { try { fn(); return 'succeeded'; } catch { return 'threw'; } })();
expect(['succeeded', 'threw']).toContain(result);
```
This assertion **always passes** — every code path leads to either 'succeeded' or 'threw', both of which are in the expected array.

**Severity:** 🟢 Low

---

## Summary Table

| # | Severity | Issue | Source File(s) |
|---|----------|-------|----------------|
| 1 | 🔴 Critical | 4 actions missing from production ACTION_REQUIREMENTS | `workspace.ts` |
| 2 | 🔴 Critical | `secureStorage` tests never import real module; decryption-failure behavior inverted | `secureStorage.js` |
| 3 | 🔴 Critical | Auth tests use local `canPerformAction` with reversed param order vs production | `workspace.ts` |
| 4 | 🟠 High | `isElectron` function-vs-invocation bug may exist beyond AppNew | Multiple |
| 5 | 🟠 High | Deletion test claims Electron skips Yjs sync; production always syncs | `AppNew.jsx` |
| 6 | 🟠 High | P2P sync test is manual, not Jest — zero automated sync coverage | `p2p.js` |
| 7 | 🟠 High | P2P test uses wrong session key encoding (ignores 'base64' arg) | P2P key exchange |
| 8 | 🟡 Medium | Prototype pollution test doesn't exercise real `sanitizeObject` | `secureStorage.js` |
| 9 | 🟡 Medium | Three different `secureWipe` implementations with different pass counts | Multiple |
| 10 | 🟡 Medium | Stale collaborator cleanup threshold boundary untested | `collaboratorSync.js` |
| 11 | 🟡 Medium | CRDT-layer permission downgrade not protected | `collaboratorSync.js` |
| 12 | 🟢 Low | Mnemonic case test asserts type only | `identity.js` |
| 13 | 🟢 Low | Error-handling tests use always-passing assertions | Multiple |
