# Release Notes — v1.8.5

**Release Date:** February 21, 2026

Follow-up to v1.8.4's spreadsheet sync fix, addressing the remaining two bugs from Issue #16: misaligned cell presence overlays and the mobile virtual keyboard covering spreadsheet input fields.

---

## 🐛 Bug Fixes

### Spreadsheet Presence Overlay Misalignment
- **Cell presence overlay was "slightly misaligned" on different cells** — The overlay showing which cell a collaborator has selected drifted further from the actual cell the further the selection was from the origin (row 0, col 0)
- **Root cause**: `computePresenceOverlays()` computed cell positions by cumulatively summing `getRowHeight()` and `getColumnWidth()` values, but Fortune Sheet renders 1px grid lines between each row and column. These border pixels were not accounted for, causing a cumulative drift of +1px per row vertically and +1px per column horizontally
- **Fix**: Added `+ r` to the vertical position and `+ c` to the horizontal position in the cumulative calculation, matching Fortune Sheet's internal coordinate system

### Mobile Keyboard Overlaying Input Fields
- **Virtual keyboard covered spreadsheet cells on mobile** — When tapping a cell to edit on Android/iOS, the on-screen keyboard would overlay the bottom portion of the sheet, hiding the cell being edited
- **Root cause**: The `useVirtualKeyboard` hook correctly sets `--keyboard-height` CSS variable, but the Sheet component's container used `height: 100%` with no keyboard adjustment, so the sheet extended behind the keyboard
- **Fix (CSS)**: Changed `.sheet-container` height to `calc(100% - var(--keyboard-height, 0px))`, which shrinks the sheet when the keyboard opens. Added smooth transition on mobile (`transition: height 0.15s ease-out`) and `scroll-margin-bottom` on Fortune Sheet's input box
- **Fix (Hook)**: Extended `scrollCursorIntoView()` in `useVirtualKeyboard.js` to detect Fortune Sheet's active cell input (`.luckysheet-input-box textarea/input`) in addition to the existing TipTap cursor detection, ensuring the edited cell scrolls into view above the keyboard

---

## 🔧 Technical Details

### Modified Files
| File | Changes |
|------|---------|
| [frontend/src/components/Sheet.jsx](frontend/src/components/Sheet.jsx) | Grid line correction (+r, +c) in presence overlay positioning |
| [frontend/src/components/Sheet.css](frontend/src/components/Sheet.css) | Keyboard-aware container height, mobile transition, scroll-margin |
| [frontend/src/hooks/useVirtualKeyboard.js](frontend/src/hooks/useVirtualKeyboard.js) | Fortune Sheet input detection in scrollCursorIntoView |

---

## 📊 Statistics
| Metric | Value |
|--------|-------|
| Files changed | 5 |
| Insertions | 23 |
| Deletions | 6 |
| Test suites | 158 |
| Tests passing | 5,063 |

## 📋 Cumulative Feature Summary (v1.5 → v1.8.5)
| Version | Highlights |
|---------|------------|
| v1.5.0 | Kanban boards, spreadsheet import/export groundwork |
| v1.6.0 | Comments system, presence indicators |
| v1.7.0 | Inventory feature, workspace permissions |
| v1.8.0 | Mobile web app (PWA), hamburger menu, dvh units |
| v1.8.3 | Copy link fix, ARIA alertdialog roles |
| v1.8.4 | Critical spreadsheet sync fix (Issue #16 — data sync) |
| **v1.8.5** | **Presence overlay alignment + mobile keyboard fixes (Issue #16 — remaining items)** |

## 🚀 Upgrade Notes
- No breaking changes
- Backward compatible — existing spreadsheet data and sync unaffected
- The `--keyboard-height` CSS variable is already set by the app-level `useVirtualKeyboard` hook; no additional setup required

## 📦 Build Targets
| Platform | Formats |
|----------|---------|
| Windows | `.exe` (NSIS installer) |
| macOS | `.dmg`, `.zip` (x64 + arm64) |
| Linux | `.AppImage`, `.deb` |
