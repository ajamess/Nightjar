# Nightjar v1.7.14 Release Notes

**Release Date:** February 20, 2026

This release delivers a **comprehensive mobile UX optimization pass** building on the responsive breakpoints introduced in v1.7.13. It fixes z-index stacking bugs, repairs broken nav rails on mobile viewports, introduces a **mobile card view** for the AllRequests admin table, prevents **iOS auto-zoom** on form inputs, adds **momentum scrolling** where it was missing, repositions toasts to clear the bottom nav, and ships a full **Progressive Web App (PWA) manifest** with generated icons.

---

## 📱 Mobile Card View for AllRequests

- **Responsive card layout** — On viewports ≤768px, the AllRequests admin table is replaced with a vertically-scrolling card list. Each card displays request ID, status badge, item name, requester, and date.
- **Status color variants** — Cards show colored left borders for status states: green (approved/shipped), red (cancelled/blocked), amber (urgent), blue (active).
- **SlidePanel drill-in** — Tapping a card on mobile opens the request detail in a full-screen SlidePanel instead of the desktop table-row expand.
- **New `useIsMobile` hook** — A reusable React hook (`frontend/src/hooks/useIsMobile.js`) that uses `window.matchMedia` to detect viewport widths. Defaults to 768px breakpoint, supports custom values, and includes Safari `addListener` fallback.

---

## 🔧 Z-index Stacking Fixes

Three overlay components had z-index hardcoded to `100`, which collided with dropdowns and toolbars in the new z-index scale:

| Component | Before | After |
|-----------|--------|-------|
| SlidePanel overlay | `z-index: 100` | `z-index: var(--z-modal-backdrop, 900)` |
| ProducerDashboard overlay | `z-index: 100` | `z-index: var(--z-modal-backdrop, 900)` |
| ProducerMyRequests overlay | `z-index: 100` | `z-index: var(--z-modal-backdrop, 900)` |

---

## 🧭 Nav Rail Mobile Fixes

### InventoryNavRail
- **Hidden scrollbar** — Added `scrollbar-width: none` and `::-webkit-scrollbar { display: none }` for clean horizontal scrolling on mobile.
- **Z-index layer** — Added `z-index: var(--z-fixed, 300)` so the nav rail sits above content during scroll.
- **Flex-shrink prevention** — Nav items now have `flex-shrink: 0` and `min-width: 56px` to prevent icon compression on narrow viewports.

### FileStorageNavRail
- **Class name bug fix** — The mobile media query targeted `.file-storage-nav-rail__item` (BEM syntax) but the actual class is `.file-storage-nav-item` (flat naming). Corrected the selector so mobile styles now apply.
- **Breakpoint standardized** — Changed from `600px` to `768px` to match the project-wide mobile breakpoint.
- **Z-index layer** — Added `z-index: var(--z-fixed, 300)` for proper stacking.
- **Header and divider hiding** — `.file-storage-nav-header` and `.file-storage-nav-divider` are now `display: none` on mobile to save vertical space.

---

## 🍎 iOS Zoom Prevention & Touch Improvements

- **`touch-action: manipulation`** — Applied to `<html>` to prevent double-tap zoom and 300ms tap delay across the entire app.
- **`-webkit-tap-highlight-color: transparent`** — Removes the blue/gray tap highlight rectangle on iOS and Android.
- **16px minimum font-size on inputs** — All `<input>`, `<select>`, and `<textarea>` elements are forced to `font-size: 16px !important` at ≤768px, preventing iOS Safari from auto-zooming when focusing form fields.
- **Hover guard for touch devices** — Added `@media (hover: none)` guard to suppress `:hover` background transitions that cause sticky hover states on mobile.

---

## 📐 Breakpoint Standardization

Three components still used `600px` as their mobile breakpoint instead of the project-wide `768px`:

| Component | Before | After |
|-----------|--------|-------|
| BulkTagDialog | `@media (max-width: 600px)` | `@media (max-width: 768px)` |
| CatalogManager | `@media (max-width: 600px)` | `@media (max-width: 768px)` |
| SubmitRequest | `@media (max-width: 600px)` | `@media (max-width: 768px)` |

---

## 🌊 Momentum Scrolling & Toast Positioning

- **`-webkit-overflow-scrolling: touch`** — Added to SlidePanel body and AllRequests table-wrap for smooth inertial scrolling on iOS.
- **Toast offset increased** — Mobile toast bottom offset changed from `40px` to `80px` so notifications clear the bottom nav rail instead of overlapping it.

---

## 🌐 Progressive Web App (PWA)

- **`manifest.json`** — Full PWA manifest with `display: standalone`, theme color `#6366f1`, background color `#0f0f17`, and icon declarations (192×192, 512×512, 512×512 maskable).
- **Generated icons** — Three PNG icons generated from `assets/icons/nightjar-square-512.png` using sharp:
  - `nightjar-192.png` (192×192, purpose: any)
  - `nightjar-512.png` (512×512, purpose: any)
  - `apple-touch-icon.png` (180×180, Apple home screen)
- **Meta tags** — Added to `index.html`: `<link rel="manifest">`, `<meta name="theme-color">`, `<meta name="apple-mobile-web-app-capable">`, `<meta name="apple-mobile-web-app-status-bar-style">`, `<meta name="apple-mobile-web-app-title">`, `<link rel="apple-touch-icon">`.
- **Icon generation script** — `scripts/generate-pwa-icons.js` automates future icon regeneration.

---

## 🏷️ TODO Tags for Deferred Work

Three items from the mobile audit were tagged as TODOs for a future iteration rather than implemented now:

| Location | TODO |
|----------|------|
| `index.html` | Viewport `viewport-fit=cover` for iOS safe-area support |
| `global.css` | `overscroll-behavior: none` and `dvh` units for true mobile viewport height |
| `index.css` | Vite boilerplate CSS cleanup that conflicts with app styles |
| `Chat.css` | Chat bubble overlapping nav rail, keyboard-aware repositioning |

---

## 🧪 Testing

### Unit Tests (Jest)
- **`tests/hooks/useIsMobile.test.js`** — 5 tests covering default breakpoint match, custom breakpoint, reactive viewport changes, and cleanup on unmount.
- **`tests/mobile-optimizations-v1.7.14.test.js`** — 51 tests across 10 describe blocks verifying every change: z-index values, nav rail classes, card view markup, CSS properties, breakpoints, iOS zoom rules, momentum scrolling, toast offset, PWA manifest, TODO tags, hook structure, and build output.

### E2E Tests (Playwright)
- **`tests/e2e/specs/45-mobile-optimizations.spec.js`** — 8 tests at iPhone X viewport (375×812) verifying PWA manifest link, theme-color meta, apple-mobile-web-app-capable, apple-touch-icon, manifest.json fetchability and validity, touch-action on html, tap-highlight-color transparency, and PWA icon serving.

---

## 📁 New Files

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useIsMobile.js` | Reusable mobile viewport detection hook (26 lines) |
| `frontend/public/manifest.json` | PWA manifest (28 lines) |
| `frontend/public/nightjar-192.png` | PWA icon 192×192 |
| `frontend/public/nightjar-512.png` | PWA icon 512×512 |
| `frontend/public/apple-touch-icon.png` | Apple touch icon 180×180 |
| `scripts/generate-pwa-icons.js` | PWA icon generation script (42 lines) |
| `tests/hooks/useIsMobile.test.js` | useIsMobile hook tests (106 lines) |
| `tests/mobile-optimizations-v1.7.14.test.js` | Comprehensive mobile test suite (369 lines) |
| `tests/e2e/specs/45-mobile-optimizations.spec.js` | E2E mobile viewport tests (87 lines) |

## 📁 Modified Files

| File | Changes |
|------|---------|
| `frontend/index.html` | PWA meta tags, TODO for viewport-fit |
| `frontend/src/styles/global.css` | touch-action, tap-highlight, iOS zoom guard, hover guard, toast offset, TODO for dvh |
| `frontend/src/index.css` | TODO for Vite boilerplate cleanup |
| `frontend/src/components/Chat.css` | TODO for chat positioning |
| `frontend/src/components/inventory/common/SlidePanel.css` | z-index fix, momentum scrolling |
| `frontend/src/components/inventory/producer/ProducerDashboard.css` | z-index fix |
| `frontend/src/components/inventory/producer/ProducerMyRequests.css` | z-index fix |
| `frontend/src/components/inventory/InventoryNavRail.css` | scrollbar hiding, z-index, flex-shrink |
| `frontend/src/components/files/FileStorageNavRail.css` | class name fix, breakpoint, z-index, header hiding |
| `frontend/src/components/inventory/admin/AllRequests.jsx` | useIsMobile + card view + SlidePanel drill-in |
| `frontend/src/components/inventory/admin/AllRequests.css` | Card styles, iOS zoom, momentum scrolling |
| `frontend/src/components/files/BulkTagDialog.css` | Breakpoint 600→768 |
| `frontend/src/components/inventory/admin/CatalogManager.css` | Breakpoint 600→768 |
| `frontend/src/components/inventory/requestor/SubmitRequest.css` | Breakpoint 600→768 |
| `package.json` | Version 1.7.13 → 1.7.14 |

---

## 📊 Statistics

- **24 files changed**
- **947 insertions(+)**
- **58 deletions(−)**
- **1 commit**
- **56 unit tests added, 8 E2E tests added**

---

## 🚀 Upgrade Notes

This release is fully backward compatible with v1.7.13. No migration steps required.

The new PWA manifest enables "Add to Home Screen" on iOS and Android. Users can install Nightjar as a standalone app from their mobile browser.

The `useIsMobile` hook is available for any component that needs responsive behavior beyond CSS media queries. Import from `frontend/src/hooks/useIsMobile.js`.
