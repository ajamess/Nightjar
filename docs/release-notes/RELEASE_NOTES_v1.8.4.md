# Release Notes — v1.8.4

## Critical Spreadsheet Sync Fix (Issue #16)

**Date**: 2025-07-15

### Summary

Fixes the critical bug where spreadsheet cells typed on one device never appeared on the other device. Text documents continued to sync correctly because they use native Yjs bindings (y-prosemirror), but spreadsheets relied on a dual-path sync architecture that had a fatal false-positive bug.

### Root Cause Analysis

The spreadsheet sync used two paths:
- **Path A (Y.Array ops)**: Fortune Sheet's `onOp` callback → push to Y.Array → remote peer calls `applyOp()`
- **Path B (Full-sheet JSON)**: Full sheet data → Y.Map `sheet-data` → remote peer calls `setData()`

**5 root causes were identified:**

| # | Root Cause | Severity |
|---|-----------|----------|
| 1 | Fortune Sheet's `applyOp()` internally catches Immer errors (minified error 15) and swallows them — never re-throws | Critical |
| 2 | `opsAppliedThisCycle` was set to `true` unconditionally since `applyOp` doesn't throw back to our code | Critical |
| 3 | The full-sheet `setData()` fallback path was skipped based on the false-positive `opsAppliedThisCycle` flag | Critical |
| 4 | Immer patch path `data/{sheetIndex}/{row}/{col}` is invalid when sheet IDs mismatch between peers | Critical |
| 5 | Sheet IDs generated with `Date.now() + Math.random()` cause both peers to race-create Sheet1 with different IDs | High |

### What Changed

#### 1. Removed the broken op-based sync path
- Removed Y.Array `sheet-ops` observer (`handleOpsChange`)
- Removed `handleOp` callback and `onOp` prop from `<Workbook>`
- Removed `opsAppliedThisCycle` variable and its false-positive skip logic
- Removed `isApplyingRemoteOps` ref (no longer needed)
- Full-sheet Y.Map path is now the **sole sync mechanism**

#### 2. Made sheet IDs deterministic
- `generateSheetId()` now returns `"sheet_1"`, `"sheet_2"`, etc.
- Both peers produce identical default sheets, eliminating Y.Map conflicts on initial creation

#### 3. Legacy cleanup on initialization
- Stale ops in Y.Array `sheet-ops` are cleaned up on component mount
- Legacy `pendingOps` key on Y.Map is cleaned up on component mount

### How Sync Works Now

```
Peer A types in cell
    → Fortune Sheet onChange fires
    → handleChange → debouncedSaveToYjs (300ms)
    → getAllSheets() → convertDataToCelldata() (sparse)
    → ysheet.set('sheets', ...) + composite version stamp
    → Yjs syncs Y.Map via WebSocket
    → Peer B's observeDeep fires updateFromYjs
    → version check (skip own echo, skip already-loaded)
    → convertCelldataToData() → setData(sheets)
    → Fortune Sheet re-renders with new data ✅
```

### Files Changed
- `frontend/src/components/Sheet.jsx` — Core sync architecture fix
- `tests/sheet.test.js` — Updated mock (removed `onOp`), updated test for new architecture
- `tests/sheet-sync-issue16.test.js` — 40 new sync tests (NEW)
- `docs/specs/SPREADSHEET_IMPLEMENTATION_PLAN.md` — Updated sync strategy documentation

### Test Results
- **158 test suites** — all passing
- **5,063 tests** — all passing (6 skipped)
- **40 new tests** covering:
  - Deterministic sheet IDs
  - Single cell sync, multi-cell sync, bidirectional sync
  - Three-way peer sync
  - Version tracking and self-echo prevention
  - Legacy Y.Array/Y.Map cleanup
  - Empty sheet, large sheet (1000 cells), complex cell values
  - Cell overwrite, cell deletion, multi-sheet documents
  - Offline reconnection, rapid sequential saves
  - celldata ↔ data conversion round-trip

### Platform Matrix
The fix applies equally to all sync scenarios since the Yjs protocol is platform-agnostic:
- ✅ Web ↔ Web
- ✅ Web ↔ Native (Electron)
- ✅ Native ↔ Web
- ✅ Native ↔ Native

### Future Improvements
The current full-sheet JSON approach is reliable but has last-writer-wins semantics at the sheet level. A future improvement (noted in code as TODO) would be to use Yjs native types per cell (Y.Map per sheet, key = `r,c`) for true CRDT cell-level conflict resolution.
