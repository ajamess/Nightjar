/**
 * Stale-build detection tests
 *
 * Covers the /api/version server endpoint and the client-side
 * version-comparison + reload-guard logic added in main.jsx.
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ROOT = join(__dirname, '..');

const RELOAD_GUARD_KEY = 'nightjar:version-reload';

// ---------------------------------------------------------------------------
// 1. Server endpoint source verification
// ---------------------------------------------------------------------------
describe('/api/version server endpoint', () => {
  const serverSource = readFileSync(
    join(ROOT, 'server/unified/index.js'),
    'utf8',
  );

  test('endpoint route is registered', () => {
    expect(serverSource).toContain("/api/version'");
  });

  test('reads version from package.json', () => {
    expect(serverSource).toContain("readFileSync(join(__dirname, '../../package.json')");
  });

  test('returns JSON with a version field', () => {
    expect(serverSource).toContain('res.json({ version: pkg.version })');
  });

  test('returns 500 on read failure', () => {
    expect(serverSource).toContain("res.status(500).json({ error: 'version unavailable' })");
  });

  test('package.json is reachable from the server directory', () => {
    const serverDir = join(ROOT, 'server/unified');
    const pkgPath = join(serverDir, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    expect(pkg).toHaveProperty('version');
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// ---------------------------------------------------------------------------
// 2. __APP_VERSION__ build-time define
// ---------------------------------------------------------------------------
describe('__APP_VERSION__ build define', () => {
  const viteSource = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');

  test('vite.config.js defines __APP_VERSION__', () => {
    expect(viteSource).toContain('__APP_VERSION__');
  });

  test('value is sourced from package.json version', () => {
    expect(viteSource).toMatch(/require\(.+package\.json.+\)\.version/);
  });
});

// ---------------------------------------------------------------------------
// 3. Client-side stale-build detection logic (main.jsx source checks)
// ---------------------------------------------------------------------------
describe('Client stale-build detection (source)', () => {
  const mainSource = readFileSync(
    join(ROOT, 'frontend/src/main.jsx'),
    'utf8',
  );

  test('only runs on the web (Electron guard)', () => {
    // The entire block lives inside  if ('serviceWorker' in navigator && !window.electronAPI)
    expect(mainSource).toContain('!window.electronAPI');
  });

  test('uses sessionStorage guard key', () => {
    expect(mainSource).toContain(RELOAD_GUARD_KEY);
  });

  test('fetches ./api/version with cache: no-store', () => {
    expect(mainSource).toContain("fetch('./api/version', { cache: 'no-store' })");
  });

  test('uses strict inequality for version comparison', () => {
    expect(mainSource).toContain('data.version !== clientVersion');
  });

  test('dispatches nightjar:toast before reloading', () => {
    expect(mainSource).toMatch(/dispatchEvent.*nightjar:toast[\s\S]*?Updating to latest/);
  });

  test('calls navigator.serviceWorker.getRegistration for SW update', () => {
    expect(mainSource).toContain('navigator.serviceWorker.getRegistration()');
  });

  test('clears guard after successful update', () => {
    expect(mainSource).toContain('sessionStorage.removeItem(RELOAD_GUARD_KEY)');
  });
});

// ---------------------------------------------------------------------------
// 4. Behavioural unit tests — simulate the detection logic
// ---------------------------------------------------------------------------
describe('Stale-build detection behaviour', () => {
  let originalFetch;
  let originalReload;
  let originalGetRegistration;
  let dispatchedToasts;

  // Re-usable mock helpers
  const mockFetch = (responseBody, ok = true) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(responseBody),
    });
  };

  const mockFetchReject = () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
  };

  // Extracted logic from main.jsx to test as a pure function
  const runDetection = async (clientVersion, options = {}) => {
    const { guardValue = null } = options;

    // Set up sessionStorage
    if (guardValue) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, guardValue);
    } else {
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
    }

    let reloaded = false;
    let toastDispatched = null;
    let swUpdateCalled = false;

    // Capture toast events
    const handler = (e) => { toastDispatched = e.detail; };
    window.addEventListener('nightjar:toast', handler);

    // Mock reload
    const originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, reload: jest.fn(() => { reloaded = true; }) };

    // Mock service worker
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const origNav = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: jest.fn().mockResolvedValue({ update: mockUpdate }),
      },
      configurable: true,
    });

    const alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY);

    if (clientVersion && !alreadyReloaded) {
      try {
        const r = await fetch('./api/version', { cache: 'no-store' });
        const data = r.ok ? await r.json() : null;
        if (data?.version && data.version !== clientVersion) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, data.version);
          window.dispatchEvent(new CustomEvent('nightjar:toast', {
            detail: { message: '🔄 Updating to latest version…', type: 'info' },
          }));
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
          } catch { /* ignore */ }
          // Don't actually delay — just mark
          reloaded = true;
          swUpdateCalled = mockUpdate.mock.calls.length > 0;
        }
      } catch { /* fetch failed, silent */ }
    } else if (alreadyReloaded && clientVersion && alreadyReloaded === clientVersion) {
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
    }

    window.removeEventListener('nightjar:toast', handler);

    // Restore
    window.location = originalLocation;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: origNav,
      configurable: true,
    });

    return {
      reloaded,
      toastDispatched,
      swUpdateCalled,
      guardValue: sessionStorage.getItem(RELOAD_GUARD_KEY),
    };
  };

  beforeEach(() => {
    dispatchedToasts = [];
    sessionStorage.clear();
  });

  // -- Scenario A: versions match → no reload
  test('no reload when client version matches server version', async () => {
    mockFetch({ version: '1.8.7' });
    const result = await runDetection('1.8.7');
    expect(result.reloaded).toBe(false);
    expect(result.toastDispatched).toBeNull();
    expect(result.guardValue).toBeNull();
  });

  // -- Scenario B: version mismatch → reload
  test('triggers reload when server has newer version', async () => {
    mockFetch({ version: '1.8.8' });
    const result = await runDetection('1.8.7');
    expect(result.reloaded).toBe(true);
    expect(result.toastDispatched).toEqual({
      message: '🔄 Updating to latest version…',
      type: 'info',
    });
    expect(result.guardValue).toBe('1.8.8');
    expect(result.swUpdateCalled).toBe(true);
  });

  // -- Scenario C: guard already set + version matches → clear guard
  test('clears guard when client version matches guard', async () => {
    mockFetch({ version: '1.8.8' });
    const result = await runDetection('1.8.8', { guardValue: '1.8.8' });
    expect(result.reloaded).toBe(false);
    expect(result.guardValue).toBeNull(); // guard cleared
  });

  // -- Scenario D: guard already set + version does NOT match → leave guard, no retry
  test('leaves guard in place when client still stale after reload', async () => {
    mockFetch({ version: '1.8.8' });
    const result = await runDetection('1.8.7', { guardValue: '1.8.8' });
    expect(result.reloaded).toBe(false);
    expect(result.guardValue).toBe('1.8.8'); // guard untouched
  });

  // -- Scenario E: fetch failure → silent, no reload
  test('silently ignores fetch failures', async () => {
    mockFetchReject();
    const result = await runDetection('1.8.7');
    expect(result.reloaded).toBe(false);
    expect(result.toastDispatched).toBeNull();
  });

  // -- Scenario F: server returns non-OK → no reload
  test('handles non-OK server responses gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'version unavailable' }),
    });
    const result = await runDetection('1.8.7');
    expect(result.reloaded).toBe(false);
  });

  // -- Scenario G: clientVersion is null (dev mode) → skip entirely
  test('skips detection when __APP_VERSION__ is not defined', async () => {
    mockFetch({ version: '1.8.8' });
    const result = await runDetection(null);
    expect(result.reloaded).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // -- Scenario H: server returns empty body → no reload
  test('handles missing version field in server response', async () => {
    mockFetch({});
    const result = await runDetection('1.8.7');
    expect(result.reloaded).toBe(false);
  });

  // -- Scenario I: server version is older (downgrade) → still triggers
  // Strict inequality means any mismatch triggers, not just "newer"
  test('triggers reload on any version mismatch (including downgrade)', async () => {
    mockFetch({ version: '1.8.6' });
    const result = await runDetection('1.8.7');
    expect(result.reloaded).toBe(true);
    expect(result.guardValue).toBe('1.8.6');
  });
});
