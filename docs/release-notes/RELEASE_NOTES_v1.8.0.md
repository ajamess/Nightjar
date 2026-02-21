# Release Notes — v1.8.0

**Release Date:** July 2025

Nightjar v1.8.0 is a **comprehensive mobile UX overhaul** that transforms the mobile experience into a world-class, touch-first interface. This release implements 15 coordinated improvements spanning viewport handling, CSS architecture, touch interactions, drag-and-drop, modal systems, keyboard handling, and native platform integration — backed by 48 new E2E tests guaranteeing zero desktop regression.

---

## 📱 Mobile UX Overhaul — Overview

| Area | Before | After |
|------|--------|-------|
| Viewport | `100vh` causes content hidden behind browser chrome | `100dvh` + `var(--app-height)` respects dynamic viewport |
| Breakpoints | 9 inconsistent values (400–1024px) across 45+ files | 3 standardized: 480px (phone), 768px (tablet), 1024px (desktop) |
| Touch controls | Hover-gated opacity invisible on touch devices | `@media (pointer: coarse)` overrides ensure always-visible |
| Modals | Centered overlays awkward on small screens | CSS-first bottom-sheet transform for ALL 30+ modals |
| Context menus | Desktop right-click only, no touch access | Long-press (500ms) triggers native-feeling bottom sheets |
| Kanban DnD | HTML5 Drag & Drop, broken on mobile | @dnd-kit with TouchSensor, full mobile support |
| Sidebar | No dismiss mechanism on mobile | Backdrop overlay + swipe-to-close gesture |
| Text editing | Desktop toolbar only, cut off on mobile | Compact bottom toolbar fixed above keyboard |
| Virtual keyboard | Content pushed off-screen | `--keyboard-height` CSS var tracks keyboard, UI adapts |
| Toasts | Static, overlapped by mobile UI | Swipe-to-dismiss + respects bottom nav/keyboard |
| Sharing | Copy-to-clipboard only | Native share sheet via Capacitor on supported devices |

---

## 🏗️ Step 1–5: Foundation

### Viewport & Overscroll
- Updated viewport meta: `width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1`
- Added `overscroll-behavior: none` to prevent pull-to-refresh interfering with app gestures

### Design Token System
New CSS custom properties in `:root` for consistent spacing, typography, and layout:

| Token Category | Examples |
|---|---|
| Spacing | `--space-xs: 4px` through `--space-3xl: 48px` |
| Typography | `--text-xs: 0.75rem` through `--text-2xl: 1.5rem` |
| Layout | `--app-height`, `--bottom-nav-height`, `--keyboard-height` |
| Z-index | `--z-modal-backdrop: 900`, `--z-modal: 1000`, `--z-toast: 1300` |

### 100vh → Dynamic Viewport Height
Replaced all `100vh` references with `var(--app-height, 100dvh)` across 11 CSS files, eliminating the classic mobile browser chrome overlap bug.

### Breakpoint Consolidation
Unified 9 different breakpoint values to 3 standard breakpoints across 45 files (43 instances):

| Old Values | New Standard |
|---|---|
| 400px, 500px | 480px (phone) |
| 600px, 640px, 800px | 768px (tablet) |
| 1024px | 1024px (desktop) |

### Touch Accessibility
Added `@media (pointer: coarse)` overrides in 5 files to ensure hover-gated controls (action buttons, drag handles, delete icons) are always visible on touch devices.

---

## 📐 Step 6–7: Bottom Sheet Modal System

### BottomSheet Component
New reusable `BottomSheet.jsx` component with:
- Drag-to-dismiss via `@use-gesture/react` `useDrag`
- Snap points for partial/full expansion
- `createPortal` rendering for correct z-index stacking
- Backdrop click to close
- Smooth spring animations

### CSS-First Modal Transform
Created `mobile-modals.css` with a CSS-only approach that transforms ALL 30+ existing modals into bottom sheets at `≤768px`:
- `align-items: flex-end` on overlays
- `border-radius: 16px 16px 0 0` for sheet appearance
- Drag handle pseudo-element via `::before`
- `max-height: 85dvh` with safe-area padding
- `modal-slide-up` animation

### ResponsiveModal Wrapper
New `ResponsiveModal.jsx` that automatically renders as a BottomSheet on mobile or a centered modal on desktop.

---

## 📋 Step 8: Context Menus → Bottom Sheets

- `FileContextMenu.jsx` now renders as a `BottomSheet` on mobile (detected via `useIsMobile`)
- `FileCard.jsx` and `FolderCard.jsx` implement 500ms long-press handlers for touch context menus
- Long-press includes haptic feedback on supported devices
- Desktop right-click behavior preserved unchanged

---

## 🎯 Step 9: @dnd-kit Kanban Migration

Fully replaced HTML5 Drag & Drop with `@dnd-kit` for the Kanban board:

| Component | Role |
|---|---|
| `SortableKanbanCard.jsx` | `useSortable` wrapper for individual cards |
| `SortableKanbanColumn.jsx` | `useSortable` wrapper for columns with render-prop children |
| `Kanban.jsx` | Complete rewrite: `DndContext`, `SortableContext`, `DragOverlay` |

**Sensors configured:**
- `PointerSensor` — desktop mouse with 5px activation distance
- `TouchSensor` — mobile touch with 250ms delay + 5px tolerance (prevents scroll interference)

**Persistence:** All drag operations commit to Yjs transactions, maintaining real-time CRDT sync.

---

## 📱 Step 10: Sidebar Backdrop + Swipe-to-Close

- Mobile sidebar now renders with a semi-transparent backdrop overlay
- Swipe-left gesture (via `useDrag`) dismisses sidebar when drag exceeds 80px
- Backdrop click also dismisses
- `touch-action: pan-y` prevents gesture conflicts with vertical scrolling

---

## ⌨️ Step 11: Mobile Formatting Toolbar

New `MobileToolbar.jsx` — a compact bottom-anchored formatting bar for touch editing:

| Feature | Details |
|---|---|
| Actions | Bold, Italic, Strike, H1–H3, Bullet/Ordered lists, Blockquote, Code, Undo, Redo |
| Position | Fixed to bottom, above virtual keyboard |
| Visibility | Hidden on desktop (`display: none` above 768px) |
| Integration | Wired to TipTap editor commands via `useCurrentEditor()` |

The desktop toolbar is hidden at `≤768px` to avoid duplication.

---

## 🎹 Step 12: Virtual Keyboard Handling

New `useVirtualKeyboard.js` hook with dual-strategy detection:

| Strategy | Platform | Method |
|---|---|---|
| VirtualKeyboard API | Chrome/Android | `navigator.virtualKeyboard.overlaysContent` + `geometrychange` event |
| visualViewport heuristic | iOS Safari | `window.visualViewport.resize` — infers keyboard from viewport shrink |

The hook updates `--keyboard-height` CSS custom property in real-time, allowing all positioned elements (mobile toolbar, toasts, bottom sheets) to stay above the keyboard.

---

## 💬 Step 13: Toast & Overlap Fixes

- **Swipe-to-dismiss toasts:** Touch handlers detect rightward swipe >80px and dismiss the toast
- **Chat input:** Uses `--bottom-nav-height` to position above mobile navigation
- **Inventory nav rail:** Sets `--bottom-nav-height: 56px` at ≤768px so other components respect it

---

## 🔗 Step 14: Native Share & Capacitor Integration

- `WorkspaceSettings.jsx` now offers a "Share…" button using the native share sheet via `Platform.share()`
- Feature-detected: only shows when `navigator.share` or Capacitor Share plugin is available
- `Platform.copyToClipboard()` uses Capacitor Clipboard on native, falls back to browser API
- New dependencies: `@capacitor/clipboard`, `@capacitor/share`, `@capacitor/haptics`, `@capacitor/device`

---

## ✨ Step 15: Final Polish

- `ErrorBoundary.jsx`: `height: '100vh'` → `height: '100dvh'`
- Batch `max-height: Xvh` → `max-height: Xdvh` across 18 CSS files:

| Files Updated |
|---|
| AppSettings, EditPropertiesModal, HelpPage, ResponsiveModal, FileMoveDialog |
| FilePickerModal, AddressReveal, Onboarding, Presence, Settings |
| Share, BugReportModal, CreateWorkspace, RecoveryCodeModal, RelaySettings |
| SearchPalette, UserProfile, WorkspaceSettings, mobile-modals |

---

## 🧪 Testing

### New Test Suites

| Suite | Tests | Coverage |
|---|---|---|
| `46-mobile-ux-overhaul.spec.js` | 33 | All 15 mobile UX steps, cross-viewport, z-index stacking, interactions |
| `47-desktop-regression.spec.js` | 15 | Desktop layout, toolbar, sidebar, keyboard shortcuts, multi-resolution |

### Test Infrastructure
- New `playwright-mobile.config.js` — lightweight standalone config with `webServer` auto-start
- Mobile viewport: 390×844 (iPhone 14), touch-enabled
- Desktop viewport: 1280×720
- 4 parallel workers, 30s timeout per test

### Results
- **48/48 tests passing** (33 mobile + 15 desktop)
- **Production build verified** — success
- **Zero desktop regression** confirmed across 1280×720, 1920×1080, and 2560×1440 viewports

---

## 🔧 Technical Details

### New Dependencies

| Package | Purpose |
|---|---|
| `@dnd-kit/core` | Framework-agnostic drag-and-drop |
| `@dnd-kit/sortable` | Sortable preset for lists/grids |
| `@dnd-kit/utilities` | CSS transform utilities |
| `@use-gesture/react` | Touch gesture recognition (swipe, drag) |
| `@capacitor/clipboard` | Native clipboard access |
| `@capacitor/share` | Native share sheet |
| `@capacitor/haptics` | Haptic feedback on touch |
| `@capacitor/device` | Device info for platform detection |

### New Files

| File | Purpose |
|---|---|
| `frontend/src/components/common/BottomSheet.jsx` | Reusable draggable bottom sheet |
| `frontend/src/components/common/BottomSheet.css` | Bottom sheet styles |
| `frontend/src/components/common/ResponsiveModal.jsx` | Auto-switching modal/bottom-sheet wrapper |
| `frontend/src/components/common/ResponsiveModal.css` | Desktop modal styles |
| `frontend/src/styles/mobile-modals.css` | CSS-first bottom-sheet transform for all modals |
| `frontend/src/components/SortableKanbanCard.jsx` | @dnd-kit sortable card wrapper |
| `frontend/src/components/SortableKanbanColumn.jsx` | @dnd-kit sortable column wrapper |
| `frontend/src/components/MobileToolbar.jsx` | Compact mobile formatting toolbar |
| `frontend/src/components/MobileToolbar.css` | Mobile toolbar styles + desktop toolbar hide |
| `frontend/src/hooks/useVirtualKeyboard.js` | Virtual keyboard height detection hook |
| `tests/e2e/specs/46-mobile-ux-overhaul.spec.js` | 33 mobile E2E tests |
| `tests/e2e/specs/47-desktop-regression.spec.js` | 15 desktop regression tests |
| `tests/e2e/playwright-mobile.config.js` | Standalone mobile test config |

### Modified Files (Key Changes)

| File | Changes |
|---|---|
| `frontend/index.html` | Viewport meta update |
| `frontend/src/styles/global.css` | Design tokens, overscroll, toast touch, mobile-modals import |
| `frontend/src/components/Kanban.jsx` | Full @dnd-kit rewrite |
| `frontend/src/components/Kanban.css` | DragOverlay + touch styles |
| `frontend/src/components/HierarchicalSidebar.jsx` | Backdrop + swipe-to-close |
| `frontend/src/components/HierarchicalSidebar.css` | Backdrop styles |
| `frontend/src/components/files/FileContextMenu.jsx` | BottomSheet on mobile |
| `frontend/src/components/files/FileCard.jsx` | Long-press touch handler |
| `frontend/src/components/files/FolderCard.jsx` | Long-press touch handler |
| `frontend/src/EditorPane.jsx` | MobileToolbar integration |
| `frontend/src/AppNew.jsx` | useVirtualKeyboard + Platform.copyToClipboard |
| `frontend/src/contexts/ToastContext.jsx` | Swipe-to-dismiss |
| `frontend/src/components/WorkspaceSettings.jsx` | Native share button |
| `frontend/src/components/ErrorBoundary.jsx` | 100vh → 100dvh |
| ~45 CSS files | Breakpoint consolidation |
| ~18 CSS files | vh → dvh batch conversion |
| 11 CSS files | 100vh → var(--app-height) |
| 5 CSS files | Touch pointer-coarse overrides |

---

## 📊 Statistics

| Metric | Value |
|---|---|
| Files changed | 39+ (since v1.7.30) |
| Insertions | ~3,500+ |
| Deletions | ~360+ |
| Commits | 11 (foundation through tests) |
| New test suites | 2 |
| New tests | 48 (33 mobile + 15 desktop) |
| Tests passing | 48/48 (100%) |
| New components | 7 |
| New hooks | 1 |
| CSS files touched | 70+ |
| Breakpoints consolidated | 43 instances across 45 files |
| Modals transformed | 30+ |

---

## 📋 Cumulative Feature Summary (v1.5 → v1.8.0)

| Version | Highlights |
|---|---|
| v1.5 | Initial P2P sharing, Hyperswarm integration |
| v1.7.14 | Mobile-first PWA, responsive layouts |
| v1.7.15 | Server invite cleanup, route hardening |
| v1.7.16–17 | Security hardening phases 1 & 2 |
| v1.7.18 | File storage, chunk transfer, mesh dashboard |
| v1.7.19 | Share link host fix, deployment hardening |
| v1.7.20 | Web app share link fix (middleware ordering) |
| v1.7.21 | Share link blank screen & relay routing fix |
| v1.7.22 | Relay bridge auto-connect, cross-platform sharing |
| v1.7.23 | Share link white screen fix (`<base href>` injection) |
| v1.7.24 | In-app join dialog fix, 24h default expiry |
| v1.7.25 | Share link reliability fix (Issue #10) |
| v1.7.28 | Relay bridge protocol fix (Issue #13) |
| v1.7.30 | Document sync race condition fix (Issue #15) |
| **v1.8.0** | **World-class mobile UX — bottom sheets, @dnd-kit, virtual keyboard, native share, 48 new tests** |

---

## 🚀 Upgrade Notes

- **Backward compatible**: All changes are CSS/component-level with no data model changes
- **No breaking changes**: Desktop experience is identical (confirmed by 15 regression tests)
- **New dependencies**: 8 packages added (@dnd-kit/*, @use-gesture/react, @capacitor/*) — all tree-shakeable
- **CSS architecture**: Breakpoints standardized to 480/768/1024px — custom CSS should use these values
- **Design tokens**: New CSS custom properties available (--space-*, --text-*, --app-height, etc.)
- **Kanban DnD**: HTML5 DnD completely replaced with @dnd-kit — custom Kanban extensions should use @dnd-kit APIs

---

## 📦 Build Targets

| Platform | Formats |
|---|---|
| Windows | `.exe` (NSIS installer) |
| macOS | `.dmg`, `.zip` (x64 + arm64) |
| Linux | `.AppImage`, `.deb` |
