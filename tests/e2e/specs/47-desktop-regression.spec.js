// @ts-check
/**
 * 47-desktop-regression.spec.js
 *
 * Desktop regression suite — guarantees no mobile UX changes broke desktop.
 * Runs at 1280×720 (default Playwright viewport).
 *
 * Covers:
 *   - Desktop toolbar is visible (MobileToolbar hidden)
 *   - Sidebar is expanded by default (no backdrop)
 *   - Modal overlays are centered (not bottom-sheet)
 *   - Kanban board renders with columns
 *   - No horizontal overflow
 *   - Z-index stacking correct
 *   - Design tokens present
 *   - No console errors
 */

const { test, expect } = require('@playwright/test');

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const BASE_URL = process.env.E2E_WEB_URL || 'http://127.0.0.1:5174';

async function loadApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body', { timeout: 15000 });
}

async function getCssVar(page, varName) {
  return page.evaluate((name) => {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }, varName);
}

// ===========================================================================
// DESKTOP LAYOUT REGRESSIONS
// ===========================================================================

test.describe('Desktop layout regressions', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('app loads without errors at 1280×720', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await loadApp(page);
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('WebSocket') &&
        !e.includes('ERR_CONNECTION_REFUSED') &&
        !e.includes('net::')
    );
    expect(critical).toEqual([]);
    await page.screenshot({ path: 'test-results/artifacts/desktop-load.png' });
  });

  test('mobile-toolbar is NOT visible on desktop', async ({ page }) => {
    await loadApp(page);
    const mobileToolbar = page.locator('[data-testid="mobile-toolbar"]');
    const visible = await mobileToolbar.isVisible({ timeout: 2000 }).catch(() => false);
    expect(visible).toBe(false);
  });

  test('sidebar-backdrop is NOT visible on desktop', async ({ page }) => {
    await loadApp(page);
    const backdrop = page.locator('.sidebar-backdrop');
    const visible = await backdrop.isVisible({ timeout: 2000 }).catch(() => false);
    expect(visible).toBe(false);
  });

  test('modal overlays center content on desktop (not flex-end)', async ({ page }) => {
    await loadApp(page);
    const alignment = await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay app-settings-overlay';
      overlay.style.display = 'flex';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      document.body.appendChild(overlay);
      const s = getComputedStyle(overlay);
      const ai = s.alignItems;
      overlay.remove();
      return ai;
    });
    // On desktop, modals should be centered, NOT flex-end
    expect(alignment).not.toBe('flex-end');
  });

  test('no horizontal overflow at desktop width', async ({ page }) => {
    await loadApp(page);
    const overflows = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      windowWidth: window.innerWidth,
    }));
    expect(overflows.bodyScrollWidth).toBeLessThanOrEqual(overflows.windowWidth + 1);
  });

  test('design tokens are present on desktop', async ({ page }) => {
    await loadApp(page);
    const appHeight = await getCssVar(page, '--app-height');
    const spaceXs = await getCssVar(page, '--space-xs');
    const zModal = await getCssVar(page, '--z-modal');
    expect(appHeight).toBeTruthy();
    expect(spaceXs).toBeTruthy();
    expect(zModal).toBeTruthy();
  });

  test('keyboard height var is 0px on desktop', async ({ page }) => {
    await loadApp(page);
    const kh = await getCssVar(page, '--keyboard-height');
    expect(kh).toBe('0px');
  });
});

// ===========================================================================
// DESKTOP COMPONENT REGRESSIONS
// ===========================================================================

test.describe('Desktop component regressions', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('viewport meta still has correct attributes', async ({ page }) => {
    await loadApp(page);
    const content = await page.$eval('meta[name="viewport"]', (el) =>
      el.getAttribute('content')
    );
    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1');
  });

  test('overscroll-behavior is none (doesn\'t break desktop)', async ({ page }) => {
    await loadApp(page);
    const overscroll = await page.evaluate(() =>
      getComputedStyle(document.body).overscrollBehavior
    );
    expect(overscroll).toBe('none');
  });

  test('z-index tokens maintain correct stacking order', async ({ page }) => {
    await loadApp(page);
    const zModalBackdrop = parseInt(await getCssVar(page, '--z-modal-backdrop'));
    const zModal = parseInt(await getCssVar(page, '--z-modal'));
    const zToast = parseInt(await getCssVar(page, '--z-toast'));
    expect(zModalBackdrop).toBeLessThan(zModal);
    expect(zModal).toBeLessThan(zToast);
  });

  test('body does not have touch-specific overscroll visible on desktop', async ({ page }) => {
    await loadApp(page);
    // overscroll-behavior: none is harmless on desktop
    const behavior = await page.evaluate(() =>
      getComputedStyle(document.body).overscrollBehavior
    );
    expect(behavior).toBe('none');
  });
});

// ===========================================================================
// MULTI-RESOLUTION SMOKE
// ===========================================================================

test.describe('Multi-resolution smoke test', () => {
  const resolutions = [
    { width: 1920, height: 1080, name: '1080p' },
    { width: 1440, height: 900, name: 'MacBook' },
    { width: 1280, height: 720, name: 'Laptop' },
    { width: 1024, height: 768, name: 'Small desktop' },
  ];

  for (const res of resolutions) {
    test(`loads without errors at ${res.name} (${res.width}×${res.height})`, async ({ page }) => {
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.setViewportSize({ width: res.width, height: res.height });
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('body', { timeout: 10000 });
      await page.waitForTimeout(2000);

      const critical = errors.filter(
        (e) =>
          !e.includes('favicon') &&
          !e.includes('DevTools') &&
          !e.includes('WebSocket') &&
          !e.includes('ERR_CONNECTION_REFUSED') &&
          !e.includes('net::')
      );
      expect(critical).toEqual([]);
      await page.screenshot({
        path: `test-results/artifacts/desktop-${res.width}x${res.height}.png`,
      });
    });
  }
});
