# Test Coverage Audit Report

**Date:** 2026-02-19  
**Scope:** `tests/` directory — unit, component, and integration tests  
**Jest config:** `testRegex: tests/.*\.test\.(js|jsx)$`, integration tests excluded via `testPathIgnorePatterns`

---

## Summary

| Category | Issues Found |
|---|---|
| Broken/Dead Imports | 0 |
| Mock Mismatches | 3 |
| Missing Cleanup (timer/listener leaks) | 8 |
| Flaky Test Patterns | 7 |
| Dead / Placeholder Tests | 6 |
| Untested Source Files (significant logic) | 12 |

---

## 1. Mock Mismatches

### 1a. `crypto.subtle.digest` mock returns static bytes — doesn't vary with input

| Field | Value |
|---|---|
| **Severity** | Medium |
| **File** | `tests/setup.js` |
| **Lines** | 10–17 |
| **Description** | The global `crypto.subtle.digest` mock always returns the same 32-byte buffer (`[0,1,2,...,31]`). Any test that depends on hashes being different for different inputs (e.g. `generateTopic` in `p2p-services.test.js`) silently passes with meaningless data. This is why the three `generateTopic` tests are skipped. |
| **Fix** | Replace the static mock with an input-dependent hash (e.g. XOR-fold the input bytes). Unskip the three `test.skip` tests in `p2p-services.test.js:374-389`. |

### 1b. `p2p-services.test.js` — duplicate `crypto` setup vs `setup.js`

| Field | Value |
|---|---|
| **Severity** | Low |
| **File** | `tests/p2p-services.test.js` |
| **Lines** | 17–45 |
| **Description** | This file re-declares `global.crypto` with its own `subtle` mock *after* `setup.js` already sets one. The two mocks behave slightly differently (one has `importKey`/`deriveKey`, the other has `encrypt`/`decrypt`). This creates fragile ordering and could silently diverge from the real API surface. |
| **Fix** | Consolidate: either extend the shared `setup.js` mock, or use `jest.spyOn(crypto.subtle, 'digest')` per-test instead of a full replacement. |

### 1c. `TorSettings.test.js` — mock `electronAPI.tor` missing `setMode` method

| Field | Value |
|---|---|
| **Severity** | Low |
| **File** | `tests/components/Settings/TorSettings.test.js` |
| **Lines** | 31–42 |
| **Description** | The mock defines `getStatus`, `start`, `stop`, `newIdentity`, `onBootstrap` but the actual `TorSettings.jsx` component may call `setMode()` or other IPC methods added in later releases. Any new electronAPI method added to the component will silently receive `undefined`, making tests pass vacuously. |
| **Fix** | Add a catch-all `jest.fn()` for unknown methods, or keep mock in sync with actual IPC API surface. |

---

## 2. Missing Cleanup — Timer & Listener Leaks

### 2a. `TorSettings.test.js` — `setTimeout` used, no `afterEach` or `useRealTimers`

| Field | Value |
|---|---|
| **Severity** | High |
| **File** | `tests/components/Settings/TorSettings.test.js` |
| **Lines** | entire file (368 lines) |
| **Description** | The component under test uses `setTimeout` for polling Tor status. No `afterEach` with cleanup or `jest.useFakeTimers()` is present. Leaked timers can cause "Cannot log after tests are done" warnings and flaky failures in subsequent test files. |
| **Fix** | Add `beforeEach(() => jest.useFakeTimers())` and `afterEach(() => jest.useRealTimers())` or at minimum add `afterEach(() => jest.clearAllTimers())`. |

### 2b. `file-transfer.test.js` — `setTimeout` in IndexedDB mock, no cleanup

| Field | Value |
|---|---|
| **Severity** | Medium |
| **File** | `tests/file-transfer.test.js` |
| **Lines** | 48, 67, 84, 380 |
| **Description** | Multiple `setTimeout(..., 0)` calls are used to simulate async IDB callbacks. The file has no `afterEach`, so if a test fails mid-flight, pending `setTimeout` callbacks continue to fire into the next test's scope. |
| **Fix** | Use `jest.useFakeTimers()` + `jest.runAllTimers()` in each test, or switch to `Promise.resolve().then(...)` which is synchronous in the microtask queue. |

### 2c. `cross-app-search.test.js` — arbitrary `setTimeout(r, 100)` without fake timers

| Field | Value |
|---|---|
| **Severity** | Medium |
| **File** | `tests/cross-app-search.test.js` |
| **Lines** | 531 |
| **Description** | `await new Promise(r => setTimeout(r, 100))` is used to "wait for async to finish." No fake timers, no `afterEach`. If the async operation takes >100ms on a slow CI machine, the test becomes flaky. |
| **Fix** | Replace with `await waitFor(() => { ... })` from `@testing-library/react`, or use `jest.useFakeTimers()` and `jest.advanceTimersByTime(100)`. |

### 2d. `p2p-context.test.js` — `setTimeout(r, 100)` without cleanup

| Field | Value |
|---|---|
| **Severity** | Medium |
| **File** | `tests/p2p-context.test.js` |
| **Lines** | 396 |
| **Description** | Same pattern: `await new Promise(r => setTimeout(r, 100))` to "give time for async operations." No `afterEach`, no fake timers. Timer leaks into subsequent tests. |
| **Fix** | Replace with `await waitFor(...)` or `jest.advanceTimersByTime`. |

### 2e. `producer-shipping-workflow.test.jsx` — multiple `setTimeout(r, 100)` without cleanup

| Field | Value |
|---|---|
| **Severity** | Medium |
| **File** | `tests/producer-shipping-workflow.test.jsx` |
| **Lines** | 1200, 1525, 1553 |
| **Description** | Three instances of `await new Promise(resolve => setTimeout(resolve, 100))` as a "wait for async" pattern. 1618-line file with no `afterEach` block. |
| **Fix** | Replace all three with `await waitFor(() => { expect(...) })`. This is idiomatic and self-cleaning. |

### 2f. `sheet.test.js` — `setTimeout` in provider mock, no timer cleanup

| Field | Value |
|---|---|
| **Severity** | Low |
| **File** | `tests/sheet.test.js` |
| **Lines** | 60 |
| **Description** | `setTimeout(() => handler(true), 0)` is used inside the mock provider to simulate sync. `afterEach` calls `jest.clearAllMocks()` but not `jest.clearAllTimers()`. If a test fails before the timeout fires, the callback leaks. |
| **Fix** | Add `jest.clearAllTimers()` to the `afterEach` block, or use `jest.useFakeTimers()`. |

### 2g. `presence-awareness.test.js` — `setInterval` used in throttle tests without cleanup

| Field | Value |
|---|---|
| **Severity** | Low |
| **File** | `tests/presence-awareness.test.js` |
| **Lines** | 719, 756 |
| **Description** | Throttle implementation tests create `setTimeout` inside inline function bodies. `afterEach` restores real timers (good), but the inline `throttle.timer` references are never explicitly cleared. |
| **Fix** | Add explicit `clearTimeout(throttle.timer)` at end of each test, or ensure `jest.useRealTimers()` in `afterEach` clears them (it does for fake timers only). |

### 2h. `relay-bridge.test.js` — `setTimeout` assigned to map but never cleared on test failure

| Field | Value |
|---|---|
| **Severity** | Low |
| **File** | `tests/relay-bridge.test.js` |
| **Lines** | 290 |
| **Description** | `bridge.retryTimeouts.set('test-room', setTimeout(() => {}, 10000))` creates a 10s timer. Tests use fake timers (good), but if `jest.useRealTimers()` is called without advancing, the real 10s timer runs in background. |
| **Fix** | Add `jest.runOnlyPendingTimers()` before `jest.useRealTimers()` in the affected `afterEach`. |

---

## 3. Flaky Test Patterns

### 3a. Real `setTimeout` waits instead of `waitFor`

| Field | Value |
|---|---|
| **Severity** | High |
| **Files** | See below |
| **Description** | The pattern `await new Promise(r => setTimeout(r, N))` is inherently flaky — it assumes operations complete within N ms. On slow CI, this fails. |

| File | Line | Wait (ms) |
|---|---|---|
| `tests/cross-app-search.test.js` | 531 | 100 |
| `tests/p2p-context.test.js` | 396 | 100 |
| `tests/producer-shipping-workflow.test.jsx` | 1200, 1525, 1553 | 100 |
| `tests/p2p-sync.test.js` | 194 | 1000 |
| `tests/p2p-sync.test.js` | 304 | 500 |

**Fix:** Replace with `waitFor(() => expect(...))` or `jest.useFakeTimers()` + `jest.advanceTimersByTime()`.

### 3b. `p2p-sync.test.js` — connects to real `localhost` WebSocket servers

| Field | Value |
|---|---|
| **Severity** | High |
| **File** | `tests/p2p-sync.test.js` |
| **Lines** | 27–28, 42, 76 |
| **Description** | Opens real WebSocket connections to `ws://localhost:8080` and `ws://localhost:8081`. Tests will fail/hang if the sidecar isn't running. The file has a custom test runner (`if (require.main === module)`) and a Jest placeholder that only tests `module.exports` exists. **This file is effectively a manual integration test misclassified as a unit test.** |
| **Fix** | Move to `tests/integration/` (already excluded by `testPathIgnorePatterns`), or add proper mocking. The Jest placeholder at line 355 is misleading — it always passes but tests nothing. |

### 3c. `integration/cross-platform-sync.test.js` — spawns real servers

| Field | Value |
|---|---|
| **Severity** | Info |
| **File** | `tests/integration/cross-platform-sync.test.js` |
| **Lines** | 104, 223–224 |
| **Description** | Creates real `WebSocket` and `net.createServer()`. This is fine because it's in `tests/integration/` (excluded from Jest), but if someone runs `jest --no-coverage` without the ignore pattern, these will fail or hang. |
| **Fix** | No action needed — already excluded. Consider adding a comment header. |

---

## 4. Dead / Placeholder Tests

### 4a. `test-html2canvas-mock.test.js` — infrastructure test, not a feature test

| Field | Value |
|---|---|
| **Severity** | Low |
| **File** | `tests/test-html2canvas-mock.test.js` |
| **Lines** | 1–16 |
| **Description** | This file only tests that the `html2canvas` mock works. It's a debugging artifact, not a meaningful test. Adds ~200ms to test runtime for zero coverage value. |
| **Fix** | Delete or move to a `__tests_infra__/` directory excluded from CI. |

### 4b. `ui-components.test.js` — two `test.skip` placeholders

| Field | Value |
|---|---|
| **Severity** | Low |
| **File** | `tests/ui-components.test.js` |
| **Lines** | 351, 372 |
| **Description** | `test.skip('placeholder - requires component import')` — these were written as TODOs but never implemented. `WorkspaceSwitcher` and `WorkspaceSettings` are imported dynamically with a try/catch that silently swallows errors. |
| **Fix** | Implement proper tests or delete the placeholders. `WorkspaceSwitcher` already has a dedicated test file at `tests/components/workspace-switcher.test.jsx`. |

### 4c. `ui-components.test.js` — file-reading tests instead of component tests

| Field | Value |
|---|---|
| **Severity** | Medium |
| **File** | `tests/ui-components.test.js` |
| **Lines** | 383–450 |
| **Description** | Tests like "HierarchicalSidebar Sheet Support" and "Breadcrumbs Sheet Support" use `fs.readFileSync` to grep source code for strings like `item.type === 'sheet'`. These are fragile text-match tests, not behavioral tests. They'll break if code is reformatted and pass even if the logic is wrong. |
| **Fix** | Replace with actual render+assert tests that verify the component outputs the 📊 icon when given a `sheet` type item. |

### 4d. `p2p-services.test.js` — three `test.skip` for `generateTopic`

| Field | Value |
|---|---|
| **Severity** | Medium |
| **File** | `tests/p2p-services.test.js` |
| **Lines** | 374, 381, 387 |
| **Description** | Three core topic-generation tests are permanently skipped with the comment "require native crypto.subtle which isn't available in jsdom." But the file already mocks `crypto.subtle` at line 17. The mock just returns static bytes, making the tests meaningless. |
| **Fix** | Fix the `crypto.subtle.digest` mock to be input-dependent (see §1a), then unskip. |

### 4e. `p2p-sync.test.js` — Jest placeholder tests nothing

| Field | Value |
|---|---|
| **Severity** | Medium |
| **File** | `tests/p2p-sync.test.js` |
| **Lines** | 355–366 |
| **Description** | The only code Jest actually runs is: `expect(module.exports).toBeDefined()`. The real tests are in a custom runner that requires a running server. This inflates test count without testing anything. |
| **Fix** | Move to `tests/integration/` or add `// @jest-ignore` comment and remove from jest matching. |

### 4f. Non-test files in `tests/` matching `.test.` pattern

| Field | Value |
|---|---|
| **Severity** | Info |
| **File** | `tests/multi-window-test.js`, `tests/test-ip-detection.js`, `tests/test-p2p-networking.js` |
| **Description** | These are manual CLI scripts (they call `process.exit()`) that happen to be in the test directory. They don't match Jest's `testRegex` pattern (no `.test.js` suffix for the latter two), so they don't run. `multi-window-test.js` also doesn't match. No harm, but clutter. |
| **Fix** | Move to `scripts/` or `tests/manual/`. |

---

## 5. Source Files with No Test Coverage

Files with **significant logic** (>150 lines) that have zero test references:

| Source File | Lines | Risk | Priority |
|---|---|---|---|
| `providers/WebRTCProvider.js` | 715 | **High** — WebRTC connection logic, ICE handling, reconnection | P1 |
| `providers/WebIdentityStore.js` | 467 | **High** — Identity persistence, key storage, crypto operations | P1 |
| `providers/PersistenceManager.js` | 296 | **High** — IndexedDB persistence, data migration | P1 |
| `providers/SyncProvider.js` | 290 | **High** — Yjs sync provider, conflict resolution | P1 |
| `hooks/usePeerManager.js` | 243 | **Medium** — Peer lifecycle management | P2 |
| `components/ErrorBoundary.jsx` | 176 | **Medium** — Error catching, crash reporting | P2 |
| `components/LockScreen.jsx` | ~150 | **Medium** — Authentication gate, PIN verification | P2 |
| `components/KanbanCardEditor.jsx` | ~200 | **Low** — UI component | P3 |
| `components/Share/EntityShareDialog.jsx` | ~180 | **Low** — UI component | P3 |
| `utils/changelogStore.js` | ~100 | **Low** — Simple CRUD store | P3 |
| `utils/secureLogger.js` | ~80 | **Low** — Logging wrapper | P3 |
| `components/RecoveryCodeModal.jsx` | ~120 | **Low** — UI component | P3 |

### Untested analytics components (medium-complexity):
- `components/inventory/analytics/ProducerResponseTime.jsx`
- `components/inventory/analytics/StatusTransitions.jsx`
- `components/inventory/analytics/UnitsShippedByType.jsx`

---

## 6. Recommendations (Priority Order)

1. **Fix timer leaks** in `TorSettings.test.js`, `file-transfer.test.js`, and `producer-shipping-workflow.test.jsx` — these are the most likely cause of intermittent CI failures.

2. **Replace all `setTimeout(r, N)` wait patterns** with `waitFor()` — 7 instances across 4 files.

3. **Move `p2p-sync.test.js`** to `tests/integration/` — it's a manual integration test masquerading as a unit test.

4. **Write tests for providers** — `WebRTCProvider.js` (715 lines), `WebIdentityStore.js` (467 lines), `PersistenceManager.js` (296 lines), and `SyncProvider.js` (290 lines) are critical infrastructure with zero test coverage.

5. **Fix `crypto.subtle.digest` mock** in `setup.js` to be input-dependent, then unskip the 3 `generateTopic` tests.

6. **Replace fs.readFileSync source-grepping tests** in `ui-components.test.js` with actual component render tests.

7. **Delete `test-html2canvas-mock.test.js`** — it's a debugging artifact.
