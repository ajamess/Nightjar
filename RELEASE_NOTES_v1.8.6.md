# Release Notes — v1.8.6

**Mobile Refinements Round 2**

Second round of mobile-native PWA refinements, addressing 14 items from the comprehensive mobile audit.

---

## Changes

### Touch Targets (Accessibility)
- **Comments panel**: All action buttons (Reply, Resolve, Unresolve, Delete) now enforce 44×44px minimum touch targets on `pointer: coarse` devices
- **ConfirmDialog**: Confirmation buttons enforce 44×44px minimum on touch devices
- **Emoji picker**: Emoji buttons in `UnifiedPicker` now have 40×40px minimum width/height on touch devices
- **Kanban drag**: TouchSensor activation delay reduced from 200ms → 150ms with 8px tolerance (up from 5px) for snappier card dragging

### iOS Safari Fixes
- **Auto-zoom prevention**: `.chat-input` font-size 16px rule moved from ≤480px to ≤768px media query — prevents iOS zoom on focus for tablet-width devices
- **MobileToolbar link field**: Font-size increased from 14px → 16px to prevent iOS auto-zoom
- **Global momentum scrolling**: Added `* { -webkit-overflow-scrolling: touch; }` wildcard rule for smooth scrolling on all iOS overflow containers

### Performance
- **Lazy-loaded images**: Added `loading="lazy"` to all `<img>` elements across 6 components (AppNew, HierarchicalSidebar, OnboardingFlow, EntityShareDialog, IdentitySettings, NightjarMascot)

### Scroll Behavior
- **Context menu overscroll containment**: Added `overscroll-behavior: contain` to mobile bottom-sheet context menus, preventing background page scroll when swiping within a menu

### Accessibility
- **prefers-reduced-motion**: Sidebar slide transition disabled for users who prefer reduced motion
- **inputmode="search"**: SearchPalette input now hints the search keyboard layout on mobile

### PWA & Offline
- **Offline-ready toast**: Service worker `onOfflineReady` event now surfaces as a visible toast notification instead of a console.log
- **Network status toasts**: Added `online`/`offline` event listeners that show toast notifications when connectivity changes ("Back online" / "You are offline — changes will sync when reconnected")
- **ToastContext event bridge**: New `nightjar:toast` custom event listener allows non-React code (e.g., SW registration in main.jsx) to trigger toast notifications

### SEO & Metadata
- **Meta description**: Added `<meta name="description">` to `index.html` for search engines and social media link previews
- **Manifest screenshots placeholder**: Added empty `screenshots` array to `manifest.json` (ready for future Android richer install UI)

### Code Quality
- **Body scroll-lock TODOs**: Added TODO comments in Chat.jsx and Comments.jsx for future implementation of `document.body.style.overflow = 'hidden'` when panels are full-screen on mobile

---

## Files Changed

| File | Changes |
|------|---------|
| `frontend/index.html` | Added `<meta name="description">` |
| `frontend/public/manifest.json` | Added empty `screenshots` array |
| `frontend/src/main.jsx` | Offline toast + network status listeners |
| `frontend/src/contexts/ToastContext.jsx` | `nightjar:toast` event bridge |
| `frontend/src/AppNew.jsx` | `loading="lazy"` on 2 img tags |
| `frontend/src/components/Chat.jsx` | Scroll-lock TODO |
| `frontend/src/components/Chat.css` | `.chat-input` font-size 16px moved to 768px block |
| `frontend/src/components/Comments.jsx` | Scroll-lock TODO |
| `frontend/src/components/Comments.css` | `pointer: coarse` 44px touch targets |
| `frontend/src/components/HierarchicalSidebar.jsx` | `loading="lazy"` |
| `frontend/src/components/Kanban.jsx` | TouchSensor delay 150ms/tolerance 8px |
| `frontend/src/components/MobileToolbar.css` | Link field font-size 16px |
| `frontend/src/components/NightjarMascot.jsx` | `loading="lazy"` |
| `frontend/src/components/SearchPalette.jsx` | `inputMode="search"` |
| `frontend/src/components/Sidebar.css` | `prefers-reduced-motion` block |
| `frontend/src/components/Onboarding/OnboardingFlow.jsx` | `loading="lazy"` |
| `frontend/src/components/Settings/IdentitySettings.jsx` | `loading="lazy"` |
| `frontend/src/components/Share/EntityShareDialog.jsx` | `loading="lazy"` |
| `frontend/src/components/common/ConfirmDialog.css` | `pointer: coarse` 44px buttons |
| `frontend/src/components/common/UnifiedPicker.css` | Emoji button 40px min |
| `frontend/src/styles/global.css` | `-webkit-overflow-scrolling: touch` wildcard |
| `frontend/src/styles/mobile-modals.css` | Context menu `overscroll-behavior: contain` |

## Tests

- **35 new tests** in `tests/mobile-refinements-v1.8.6.test.jsx` covering all 14 steps
- **Full suite**: 160 suites, 5148 tests passing, 0 failures
