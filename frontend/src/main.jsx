import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppNew.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { WorkspaceSyncProvider } from './contexts/WorkspaceSyncContext'
import { FolderProvider } from './contexts/FolderContext'
import { PermissionProvider } from './contexts/PermissionContext'
import { IdentityProvider } from './contexts/IdentityContext'
import { ToastProvider } from './contexts/ToastContext'
import PermissionWatcher from './components/PermissionWatcher'

// Register PWA service worker (web only — no-op inside Electron / Capacitor)
if ('serviceWorker' in navigator && !window.electronAPI) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onRegisteredSW(swUrl, r) {
        // Check for updates every hour
        if (r) setInterval(() => r.update(), 60 * 60 * 1000);
      },
      onOfflineReady() {
        // Surface offline-ready status as a toast (picked up by ToastProvider)
        window.dispatchEvent(new CustomEvent('nightjar:toast', {
          detail: { message: '\u2705 App ready for offline use', type: 'success' },
        }));
      },
    });
  }).catch(() => {
    // PWA registration unavailable (e.g. dev mode with devOptions.enabled=false)
  });

  // Network status listener — notify user when connectivity changes
  window.addEventListener('online', () => {
    window.dispatchEvent(new CustomEvent('nightjar:toast', {
      detail: { message: '\ud83c\udf10 Back online', type: 'success' },
    }));
  });
  window.addEventListener('offline', () => {
    window.dispatchEvent(new CustomEvent('nightjar:toast', {
      detail: { message: '\ud83d\udcf4 You are offline — changes will sync when reconnected', type: 'warning' },
    }));
  });

  // ── Stale-build detection ────────────────────────────────────────────────
  // On fresh launch, compare the compiled-in version against the server's
  // current version.  If they differ the user is running a cached build;
  // force the SW to fetch the new assets and reload the page.
  //
  // A sessionStorage guard prevents infinite reload loops if the fetch or
  // SW update fails to produce a matching version.
  // ────────────────────────────────────────────────────────────────────────
  const RELOAD_GUARD_KEY = 'nightjar:version-reload';
  const alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY);
  const clientVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;

  if (clientVersion && !alreadyReloaded) {
    fetch('./api/version', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.version && data.version !== clientVersion) {
          // Mark that we are about to reload so we don't loop
          sessionStorage.setItem(RELOAD_GUARD_KEY, data.version);

          window.dispatchEvent(new CustomEvent('nightjar:toast', {
            detail: { message: '\ud83d\udd04 Updating to latest version\u2026', type: 'info' },
          }));

          // Ask the SW to fetch the new assets, then reload
          navigator.serviceWorker.getRegistration()
            .then(reg => reg?.update())
            .catch(() => {})
            .finally(() => {
              setTimeout(() => window.location.reload(), 1000);
            });
        }
      })
      .catch(() => {
        // Fetch failed (offline, dev server, CORS) — silently ignore
      });
  } else if (alreadyReloaded && clientVersion && alreadyReloaded === clientVersion) {
    // Reload succeeded and we're now on the expected version — clear the guard
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  }
  // If alreadyReloaded is set but doesn't match clientVersion, we leave the
  // guard in place for this session to prevent further reload attempts.
}

// Apply saved theme BEFORE first render to prevent flash of wrong theme
// (AppSettings module only loads after identity selection, so IdentitySelector
//  would otherwise always render with the default dark theme)
try {
  const saved = JSON.parse(localStorage.getItem('Nightjar-app-settings') || '{}');
  const theme = saved.theme || 'system';
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!prefersDark) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
} catch (e) {
  // Ignore - will fall through to default dark theme
}

/**
 * Application providers in dependency order:
 * 1. ErrorBoundary - Catch React render errors (no deps)
 * 2. IdentityProvider - User identity (no deps)
 * 3. WorkspaceProvider - Workspaces (needs identity)
 * 4. WorkspaceSyncProvider - Synced workspace data via Yjs (needs workspace, identity)
 * 5. FolderProvider - Folders (needs workspace, can consume sync data)
 * 6. PermissionProvider - Permissions (needs workspace, folder)
 * 7. ToastProvider - Toast notifications (no deps, but wraps app for access)
 * 
 * Note: PresenceProvider is now inside App where it can receive workspace awareness
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <IdentityProvider>
        <WorkspaceProvider>
          <WorkspaceSyncProvider>
            <FolderProvider>
              <PermissionProvider>
                <ToastProvider>
                  <PermissionWatcher />
                  <App />
                </ToastProvider>
              </PermissionProvider>
            </FolderProvider>
          </WorkspaceSyncProvider>
        </WorkspaceProvider>
      </IdentityProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
