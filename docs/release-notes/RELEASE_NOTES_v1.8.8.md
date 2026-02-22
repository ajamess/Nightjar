# Release Notes — v1.8.8

**Release Date:** July 2025

Adds automatic stale-build detection for web (PWA) clients. When a user opens
Nightjar and their cached bundle is outdated, the app silently checks the
server's `/api/version` endpoint, triggers a service-worker update, and reloads
— all within one second, before the user starts editing.

---

## 🔄 Automatic Stale-Build Detection

Web clients running from a service-worker cache can get stuck on an old
build indefinitely. This release adds a **one-shot version check on fresh
launch** that compares the compiled-in `__APP_VERSION__` against the server's
live version and transparently reloads when they differ.

| Aspect | Detail |
|--------|--------|
| Trigger | Fresh page load (not during editing) |
| Comparison | Strict inequality (`!==`) — catches upgrades **and** rollbacks |
| Loop prevention | `sessionStorage` guard key `nightjar:version-reload` — prevents infinite reloads if the SW fails to update |
| Electron / Capacitor | Skipped — desktop and mobile native apps have their own update mechanisms |
| Dev mode | Skipped — `__APP_VERSION__` is undefined when running `vite dev` |
| Offline / fetch failure | Silently ignored — app continues normally |
| User feedback | Info toast "🔄 Updating to latest version…" shown during the 1 s reload delay |

### Flow

```
Fresh load → fetch /api/version (no-store) → compare versions
  ├─ Match     → do nothing
  └─ Mismatch  → set guard → toast → SW update → reload after 1 s
                  ├─ Guard matches new version → clear guard (success)
                  └─ Guard doesn't match       → leave guard (prevent loop)
```

## 🔧 Technical Details

### New Server Endpoint

`GET /api/version` — reads `package.json` from disk and returns
`{ "version": "x.y.z" }`. Returns `500` with `{ "error": "version unavailable" }`
on read failure.

### New Files

| File | Purpose |
|------|---------|
| `tests/stale-build-detection.test.js` | 23 tests — endpoint source checks, build define, source assertions, 9 behavioural scenarios |

### Modified Files

| File | Change |
|------|--------|
| `server/unified/index.js` | +11 lines — `/api/version` endpoint after `/health` |
| `frontend/src/main.jsx` | +43 lines — stale-build detection block inside the existing `!window.electronAPI` guard |
| `frontend/public-site/content/self-hosting.json` | Added tip about automatic client updates |
| `package.json` | Version bump 1.8.7 → 1.8.8 |

## 📖 Documentation

- Self-hosting page updated with note that web clients auto-detect new builds
- No other documentation pages affected (feature is transparent to users)

## 📊 Statistics

| Metric | Value |
|--------|-------|
| Files changed | 5 |
| Insertions | ~70 |
| Deletions | 0 |
| Commits | 1 |
| Test suites | 161 |
| Tests passing | 5,192 |
| New tests | 23 |

## 📋 Cumulative Feature Summary (v1.5 → v1.8.8)

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
| **v1.8.8** | **Automatic stale-build detection for PWA clients** |

## 🚀 Upgrade Notes

- **Fully backward-compatible** — no breaking changes
- The `/api/version` endpoint is unauthenticated (returns only the version string)
- Existing service-worker caches will be refreshed automatically on the first
  load after the server is updated to v1.8.8+

## 📦 Build Targets

| Platform | Formats |
|----------|---------|
| Windows | `.exe` (NSIS installer) |
| macOS | `.dmg`, `.zip` (x64 + arm64) |
| Linux | `.AppImage`, `.deb` |
| Web | PWA (service worker + manifest) |
