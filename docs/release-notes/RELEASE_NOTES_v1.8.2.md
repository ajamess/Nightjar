# Release Notes - v1.8.2

**Release Date:** 2026-02-22

This patch release fixes a critical crash at app launch caused by a JavaScript Temporal Dead Zone (TDZ) violation in the main sidebar component, corrects four Platform → NativeBridge import mismatches introduced in v1.8.1, and adds support for the `warning` block type in the public-site Help Page system.

---

## Bug Fixes

### Critical: App Launch Crash — ReferenceError: Cannot access 'rt' before initialization

**Commit:** `3957062`

The app crashed immediately on launch with a `ReferenceError: Cannot access 'rt' before initialization`. This was a Temporal Dead Zone (TDZ) violation inside `HierarchicalSidebar.jsx`: the function `handleDocumentDrop` referenced `handleDndDragEnd` before it was declared.

**Root Cause:** `handleDocumentDrop` was defined *before* `handleDndDragEnd` in the component body, but `handleDocumentDrop` called `handleDndDragEnd` internally. Because both are declared with `const` (arrow functions), JavaScript's TDZ rules prevent forward references at runtime.

**Fix:** Moved the declaration of `handleDocumentDrop` to appear *after* `handleDndDragEnd` in the component body.

| File | Change |
|------|--------|
| `frontend/src/components/sidebar/HierarchicalSidebar.jsx` | Reordered: `handleDocumentDrop` moved after `handleDndDragEnd` |

---

### Platform Import Corrections — 4 Files

**Commit:** `3957062`

Four files were importing from or calling the deprecated `Platform` module instead of the correct `NativeBridge` module introduced in v1.8.0. These incorrect imports caused runtime errors on native (Electron/Capacitor) targets.

| File | Before | After |
|------|--------|-------|
| `frontend/src/components/sidebar/HierarchicalSidebar.jsx` | `import Platform` | `import NativeBridge` |
| `frontend/src/components/modals/ResponsiveModal.jsx` | `Platform.isNative()` | `NativeBridge.isNative()` |
| `frontend/src/hooks/usePlatform.js` | `import Platform` | `import NativeBridge` |
| `frontend/src/utils/platformUtils.js` | `Platform.getInfo()` | `NativeBridge.getInfo()` |

---

## Improvements

### Warning Block Type — Help Page System

The public-site `getting-started.json` content file used a `warning` block type that was not yet handled by the Help Page renderer, causing silent render failures for that section.

**Changes:**

| File | Change |
|------|--------|
| `frontend/src/components/common/HelpPage.jsx` | Added `case 'warning':` renderer using amber-styled container |
| `frontend/src/components/common/HelpPage.css` | Added `.help-page__warning` styles (dark + light theme) |
| `tests/public-site-content.test.js` | Added `'warning'` to `VALID_BLOCK_TYPES` |

The warning block renders with an amber background (`rgba(245, 158, 11, 0.12)`) and amber border, with a ⚠️ icon prefix and full light-theme support via `[data-theme="light"]` override.

---

## Maintenance

### Release Notes Consolidation

**Commit:** `4866d61`

All previously root-level `RELEASE_NOTES_*.md` files were moved into `docs/release-notes/` for consistent organization. The `generate-release-notes.js` script and `CLAUDE.md` were updated to reflect the new default output path.

| File | Action |
|------|--------|
| `RELEASE_NOTES_v1.7.14.md` (root) | Moved to `docs/release-notes/` |
| `RELEASE_NOTES_v1.8.0.md` (root) | Moved to `docs/release-notes/` |
| `RELEASE_NOTES_v1.8.1.md` (root) | Moved to `docs/release-notes/` |
| `scripts/generate-release-notes.js` | Default output path updated |
| `CLAUDE.md` | Release notes path documentation updated |

---

## Documentation

- `README.md` — Added `### v1.8.2 - Critical App Launch Crash Fix` to the Changelog section
- Updated public-site HTML pages (22 files) rebuilt from content JSON

---

## Technical Details

### Modified Files

| Category | Files Changed |
|----------|---------------|
| Sidebar component | `HierarchicalSidebar.jsx` |
| Modals | `ResponsiveModal.jsx` |
| Hooks | `usePlatform.js` |
| Utilities | `platformUtils.js` |
| Help Page | `HelpPage.jsx`, `HelpPage.css` |
| Tests | `tests/public-site-content.test.js` |
| Public site | 22 rebuilt HTML pages |
| Documentation | `README.md`, `CLAUDE.md` |
| Scripts | `generate-release-notes.js` |

---

## Statistics

| Metric | Value |
|--------|-------|
| Commits since v1.8.1 | 3 |
| Files changed | ~35 |
| Test suites | 157 |
| Tests passing | 5,034 / 5,048 |
| Pre-existing failures | 4 (unrelated to this release) |

---

## Upgrade Notes

This is a **patch release**. No breaking changes. No migration steps required.

- Drop-in upgrade from v1.8.1
- The app would previously crash immediately on launch — this release resolves that completely
- If you self-host the public site, rebuilt HTML files are included

---

## Build Targets

| Platform | Status |
|----------|--------|
| Windows (Electron) | ✅ Supported |
| macOS (Electron) | ✅ Supported |
| Linux (Electron) | ✅ Supported |
| Web (PWA) | ✅ Supported |
| iOS (Capacitor) | ✅ Supported |
| Android (Capacitor) | ✅ Supported |
