#!/usr/bin/env node
/**
 * generate-screenshots.js — Captures real app screenshots for the landing page
 *
 * Launches the Vite dev server, drives the actual Nightjar app through onboarding,
 * workspace/document creation, and captures each screen at 1920×1080 as WebP.
 *
 * Usage:
 *   node scripts/generate-screenshots.js
 *
 * Output:
 *   frontend/public-site/screenshots/*.webp
 *   frontend/public-site/screenshots/manifest.json
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'frontend', 'public-site', 'screenshots');
const WIDTH = 1920;
const HEIGHT = 1080;
const WEBP_QUALITY = 85;
const DEV_SERVER_URL = 'http://127.0.0.1:5174';
const PIN = '123456';

// ── Screenshot definitions ──────────────────────────────────────────────────
const SCREENSHOTS = [
  {
    id: 'workspace-overview',
    title: 'Workspace Overview',
    description: 'Your encrypted home base — folders, documents, and quick actions at a glance',
    category: 'workspaces',
  },
  {
    id: 'text-editor',
    title: 'Rich Text Editor',
    description: 'Collaborative real-time editing with formatting, headings, lists, and code blocks',
    category: 'documents',
  },
  {
    id: 'spreadsheet',
    title: 'Spreadsheet',
    description: 'Full-featured spreadsheet with formulas, formatting, and real-time collaboration',
    category: 'documents',
  },
  {
    id: 'kanban-board',
    title: 'Kanban Board',
    description: 'Visual task management with drag-and-drop cards, tags, and assignees',
    category: 'documents',
  },
  {
    id: 'chat-panel',
    title: 'Team Chat',
    description: 'End-to-end encrypted team messaging — right inside your workspace',
    category: 'collaboration',
  },
  {
    id: 'inventory-list',
    title: 'Inventory Management',
    description: 'Track products, stock levels, and locations with real-time search and filters',
    category: 'inventory',
  },
  {
    id: 'sharing-panel',
    title: 'Sharing & Invites',
    description: 'Share your workspace via encrypted invite links or scannable QR codes',
    category: 'sharing',
  },
  {
    id: 'help-page',
    title: 'Built-in Help',
    description: 'Comprehensive documentation and keyboard shortcuts — always one keystroke away',
    category: 'navigation',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) { console.log(`  📸 ${msg}`); }
function warn(msg) { console.warn(`  ⚠️  ${msg}`); }

/** Wait for the dev server to respond */
async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Dev server at ${url} didn't start within ${timeoutMs / 1000}s`);
}

/** Start the Vite dev server as a child process */
function startDevServer() {
  log('Starting Vite dev server...');
  const isWin = process.platform === 'win32';
  const child = spawn(isWin ? 'npx.cmd' : 'npx', ['vite', '--host', '127.0.0.1', '--port', '5174'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
    shell: isWin,
  });
  child.stdout.on('data', d => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`  [vite] ${line}\n`);
  });
  child.stderr.on('data', d => {
    const line = d.toString().trim();
    if (line && !line.includes('ExperimentalWarning')) process.stderr.write(`  [vite] ${line}\n`);
  });
  return child;
}

/** Save a screenshot buffer to WebP */
async function saveScreenshot(pngBuffer, filename) {
  const outPath = path.join(OUTPUT_DIR, filename);
  if (sharp) {
    await sharp(pngBuffer).webp({ quality: WEBP_QUALITY }).toFile(outPath);
  } else {
    // Fallback: save as PNG with .webp extension (still viewable)
    fs.writeFileSync(outPath, pngBuffer);
    warn(`sharp not available — saved ${filename} as raw PNG`);
  }
  const stat = fs.statSync(outPath);
  return { path: outPath, sizeKB: Math.round(stat.size / 1024) };
}

/** Short wait */
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** Safe click — wait for selector then click */
async function safeClick(page, selector, opts = {}) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 15000, ...opts });
  await page.click(selector);
}

/** Type into a PIN input (6-digit auto-advance fields) */
async function enterPIN(page, pin) {
  for (let i = 0; i < pin.length; i++) {
    const input = page.locator(`[data-testid="pin-digit-${i}"]`);
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill(pin[i]);
    await wait(80);
  }
}

/** Try multiple selectors, click the first one found */
async function clickFirst(page, selectors, timeout = 5000) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: timeout / selectors.length }).catch(() => false)) {
        await el.click();
        return true;
      }
    } catch {}
  }
  return false;
}

/** Take a debug screenshot for troubleshooting */
async function debugScreenshot(page, name) {
  const buf = await page.screenshot({ type: 'png' });
  const debugPath = path.join(OUTPUT_DIR, `_debug_${name}.png`);
  fs.writeFileSync(debugPath, buf);
  log(`  [debug] Saved ${debugPath}`);
}

// ── Main Flow ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🦜 Nightjar Real Screenshot Generator\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Start Vite dev server
  const devServer = startDevServer();
  let browser;

  try {
    await waitForServer(DEV_SERVER_URL);
    log('Dev server is ready\n');

    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    const page = await context.newPage();

    // Suppress console noise from the app
    page.on('pageerror', () => {});

    // Clear any previous state
    await page.goto(DEV_SERVER_URL);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    try {
      await page.evaluate(async () => {
        if (indexedDB.databases) {
          const dbs = await indexedDB.databases();
          for (const db of dbs) indexedDB.deleteDatabase(db.name);
        }
      });
    } catch {}
    await page.reload();
    await wait(2000);
    log('Cleared previous state');

    // ════════════════════════════════════════════════════════════════════
    //  ONBOARDING
    // ════════════════════════════════════════════════════════════════════
    log('Running onboarding flow...');

    // Wait for the onboarding overlay to appear
    await page.waitForSelector('.onboarding-overlay', { state: 'visible', timeout: 30000 });
    await wait(1500);

    // Click "Create New Identity"
    await safeClick(page, 'button:has-text("Create New Identity")');
    await wait(800);

    // Fill display name
    const nameInput = page.locator('#handle, [data-testid="identity-name-input"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill('Sarah Chen');
    await wait(300);

    // Click Next to go to PIN step
    await safeClick(page, '[data-testid="confirm-identity-btn"], button:has-text("Next: Set Up PIN")');
    await wait(800);

    // Enter PIN (first time)
    await enterPIN(page, PIN);
    await wait(2000);

    // Confirm PIN (second time)
    await enterPIN(page, PIN);
    await wait(3000);

    // Recovery phrase step — check checkbox and continue
    try {
      await page.waitForSelector('.recovery-phrase-grid, .seed-phrase', { state: 'visible', timeout: 10000 });
      await wait(800);

      // Check the "I have saved my recovery phrase" checkbox
      const checkbox = page.locator('[data-testid="understood-checkbox"], input[type="checkbox"]').first();
      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await checkbox.check({ force: true });
        await wait(300);
      }

      // Click Continue
      await safeClick(page, '[data-testid="continue-btn"], button:has-text("Continue")');
      await wait(3000);
    } catch (e) {
      warn('Recovery phrase step variant: ' + e.message);
      await debugScreenshot(page, 'after-pin');
    }

    // Wait for onboarding to finish
    try {
      await page.waitForSelector('.onboarding-overlay', { state: 'detached', timeout: 20000 });
    } catch {
      // May have already detached
    }
    await wait(3000);
    log('✓ Onboarding complete\n');

    // ════════════════════════════════════════════════════════════════════
    //  CREATE WORKSPACE
    // ════════════════════════════════════════════════════════════════════
    log('Creating workspace...');

    // Try clicking "Create Workspace" — shown on the welcome/empty state
    let wsCreated = false;
    try {
      await safeClick(page, 'button:has-text("Create Workspace")');
      await wait(800);
      wsCreated = true;
    } catch {
      // Maybe we need the dropdown
      try {
        await safeClick(page, '.workspace-dropdown-trigger');
        await wait(300);
        await safeClick(page, 'button:has-text("Create New Workspace")');
        await wait(800);
        wsCreated = true;
      } catch (e) {
        warn('Could not open create workspace dialog: ' + e.message);
        await debugScreenshot(page, 'ws-create-fail');
      }
    }

    if (wsCreated) {
      const wsNameInput = page.locator('[data-testid="workspace-name-input"], input[placeholder="My Workspace"]').first();
      await wsNameInput.waitFor({ state: 'visible', timeout: 5000 });
      await wsNameInput.fill('Product Catalog — Spring 2026');
      await wait(300);

      // Submit
      const submitBtn = page.locator('[data-testid="create-workspace-submit"], button:has-text("Create Workspace")').last();
      await submitBtn.click();
      await wait(4000);

      // Wait for sidebar
      try {
        await page.waitForSelector('.hierarchical-sidebar', { state: 'visible', timeout: 15000 });
      } catch {}
      await wait(2000);
      log('✓ Workspace created\n');
    }

    // ════════════════════════════════════════════════════════════════════
    //  CREATE FOLDERS
    // ════════════════════════════════════════════════════════════════════
    log('Creating folders...');
    const folderNames = ['Operations', 'Finance', 'Product Design', 'Warehouse', 'Team'];

    for (const name of folderNames) {
      try {
        // Click the Folder button in the sidebar
        const folderBtn = page.locator('[data-testid="new-folder-btn"], button:has-text("Folder")').first();
        if (await folderBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await folderBtn.click();
          await wait(500);

          const folderInput = page.locator('.create-folder__input, input[placeholder="My Folder"]').first();
          await folderInput.waitFor({ state: 'visible', timeout: 3000 });
          await folderInput.fill(name);
          await wait(200);

          await safeClick(page, '.create-folder__btn--primary, button:has-text("Create Folder")');
          await wait(1000);
        }
      } catch (e) {
        warn(`Folder "${name}": ${e.message}`);
        await page.keyboard.press('Escape');
        await wait(500);
      }
    }
    log('✓ Folders created\n');

    // ════════════════════════════════════════════════════════════════════
    //  CREATE DOCUMENTS
    // ════════════════════════════════════════════════════════════════════
    log('Creating documents...');

    const documents = [
      { name: 'Sprint Planning — Feb 17', type: 'Document' },
      { name: 'Q1 Revenue Tracker', type: 'Spreadsheet' },
      { name: 'Shipping Cost Calculator', type: 'Spreadsheet' },
      { name: 'Product Catalog — Spring 2026', type: 'Document' },
      { name: 'Spring Product Launch', type: 'Document' },
      { name: 'Design Pipeline', type: 'Kanban Board' },
      { name: 'Inventory Valuation', type: 'Inventory System' },
      { name: 'Welcome & Onboarding Guide', type: 'Document' },
    ];

    for (const doc of documents) {
      try {
        // Dismiss any leftover overlays first
        const overlay = page.locator('.create-document-overlay, .create-folder-overlay, .create-workspace__overlay');
        if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
          await page.keyboard.press('Escape');
          await wait(500);
        }

        // Click "New" in sidebar
        const newBtn = page.locator('[data-testid="new-document-btn"]').first();
        await newBtn.click();
        await wait(600);

        // Select document type — map display names to data-testid keys
        const typeMap = {
          'Document': 'text', 'Spreadsheet': 'sheet', 'Kanban Board': 'kanban',
          'Inventory System': 'inventory', 'File Storage': 'files'
        };
        const typeKey = typeMap[doc.type] || doc.type.toLowerCase();
        const typeBtn = page.locator(`[data-testid="doc-type-${typeKey}"], .document-type-option:has-text("${doc.type}")`).first();
        await typeBtn.click();
        await wait(400);

        // Fill name
        const docInput = page.locator('[data-testid="document-name-input"], .create-document-field__input').first();
        await docInput.waitFor({ state: 'visible', timeout: 3000 });
        await docInput.clear();
        await docInput.fill(doc.name);
        await wait(200);

        // Submit
        const createBtn = page.locator('[data-testid="create-document-confirm"], .create-document-btn--primary').first();
        await createBtn.click();
        await wait(2000);
      } catch (e) {
        warn(`Doc "${doc.name}": ${e.message}`);
        // Dismiss any stuck overlay
        await page.keyboard.press('Escape');
        await wait(500);
      }
    }
    log('✓ Documents created\n');

    // ════════════════════════════════════════════════════════════════════
    //  CAPTURE SCREENSHOTS
    // ════════════════════════════════════════════════════════════════════
    const results = [];

    // --- 1: Workspace Overview (no doc selected) ---
    log('Capturing screenshots...\n');
    try {
      log('  [1/8] Workspace Overview');
      // Press Escape to deselect any open document
      await page.keyboard.press('Escape');
      await wait(500);
      await page.keyboard.press('Escape');
      await wait(1000);

      const buf = await page.screenshot({ type: 'png' });
      const res = await saveScreenshot(buf, 'workspace-overview.webp');
      results.push({ ...SCREENSHOTS[0], sizeKB: res.sizeKB });
      log('  ✓ workspace-overview');
    } catch (e) {
      warn(`  ✗ workspace-overview: ${e.message}`);
      results.push(SCREENSHOTS[0]);
    }

    // --- 2: Text Editor ---
    try {
      log('  [2/8] Rich Text Editor');
      // Click on Sprint Planning document in sidebar
      const textDoc = page.locator('.hierarchical-sidebar').getByText('Sprint Planning', { exact: false }).first();
      await textDoc.click();
      await wait(2500);

      // Type demo content
      const editor = page.locator('.tiptap, .ProseMirror, [contenteditable="true"]').first();
      if (await editor.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editor.click();
        await wait(300);

        await page.keyboard.type('# Sprint Planning — Week of Feb 17', { delay: 8 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type('## Goals for this Sprint', { delay: 8 });
        await page.keyboard.press('Enter');
        await page.keyboard.type('- [ ] Finalize Q1 product catalog layout', { delay: 8 });
        await page.keyboard.press('Enter');
        await page.keyboard.type('- [ ] Review shipping cost estimates with logistics', { delay: 8 });
        await page.keyboard.press('Enter');
        await page.keyboard.type('- [x] Update brand guidelines for Spring collection', { delay: 8 });
        await page.keyboard.press('Enter');
        await page.keyboard.type('- [ ] Coordinate with warehouse on inventory sync', { delay: 8 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type('## Notes', { delay: 8 });
        await page.keyboard.press('Enter');
        await page.keyboard.type('The new product line includes 12 items across 3 categories. We need to finalize pricing by Friday and have the catalog ready for review by the 24th.', { delay: 4 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type('> "Design is not just what it looks like and feels like. Design is how it works." — Steve Jobs', { delay: 4 });
        await wait(800);
      }

      const buf = await page.screenshot({ type: 'png' });
      const res = await saveScreenshot(buf, 'text-editor.webp');
      results.push({ ...SCREENSHOTS[1], sizeKB: res.sizeKB });
      log('  ✓ text-editor');
    } catch (e) {
      warn(`  ✗ text-editor: ${e.message}`);
      results.push(SCREENSHOTS[1]);
    }

    // --- 3: Spreadsheet ---
    try {
      log('  [3/8] Spreadsheet');
      const sheetDoc = page.locator('.hierarchical-sidebar').getByText('Q1 Revenue', { exact: false }).first();
      await sheetDoc.click();
      await wait(4000); // Fortune Sheet needs extra loading time

      // Try to interact with the spreadsheet canvas
      const sheet = page.locator('.fortune-sheet-container, .luckysheet-cell-main, canvas').first();
      if (await sheet.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Click near top-left to activate a cell
        await sheet.click({ position: { x: 80, y: 40 } });
        await wait(300);
        await page.keyboard.type('Product', { delay: 15 });
        await page.keyboard.press('Tab');
        await page.keyboard.type('Category', { delay: 15 });
        await page.keyboard.press('Tab');
        await page.keyboard.type('Q1 Sales', { delay: 15 });
        await page.keyboard.press('Tab');
        await page.keyboard.type('Revenue', { delay: 15 });
        await page.keyboard.press('Enter');

        const rows = [
          ['Widget Pro', 'Hardware', '1,247', '$62,350'],
          ['CloudSync', 'Software', '892', '$44,600'],
          ['DataVault', 'Storage', '654', '$32,700'],
          ['NetGuard', 'Security', '431', '$21,550'],
          ['AutoPilot', 'Automation', '318', '$15,900'],
        ];
        for (const row of rows) {
          for (let i = 0; i < row.length; i++) {
            await page.keyboard.type(row[i], { delay: 10 });
            if (i < row.length - 1) await page.keyboard.press('Tab');
          }
          await page.keyboard.press('Enter');
        }
        await wait(500);
        // Click away to deselect
        await sheet.click({ position: { x: 600, y: 300 } });
        await wait(300);
      }

      const buf = await page.screenshot({ type: 'png' });
      const res = await saveScreenshot(buf, 'spreadsheet.webp');
      results.push({ ...SCREENSHOTS[2], sizeKB: res.sizeKB });
      log('  ✓ spreadsheet');
    } catch (e) {
      warn(`  ✗ spreadsheet: ${e.message}`);
      results.push(SCREENSHOTS[2]);
    }

    // --- 4: Kanban Board ---
    try {
      log('  [4/8] Kanban Board');
      const kanbanDoc = page.locator('.hierarchical-sidebar').getByText('Design Pipeline', { exact: false }).first();
      await kanbanDoc.click();
      await wait(2500);

      // Try adding cards — the kanban may show empty columns or a setup state
      try {
        // Look for add column or add card buttons
        const addCol = page.locator('button:has-text("Add Column"), button:has-text("+ Column"), button:has-text("Add List"), button:has-text("+ Add Column")').first();
        if (await addCol.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Add some columns
          for (const colName of ['To Do', 'In Progress', 'Review', 'Done']) {
            await addCol.click();
            await wait(300);
            const colInput = page.locator('input:visible').last();
            if (await colInput.isVisible({ timeout: 1000 }).catch(() => false)) {
              await colInput.fill(colName);
              await page.keyboard.press('Enter');
              await wait(500);
            }
          }
        }

        // Try adding cards to the first column
        const addCard = page.locator('button:has-text("Add Card"), button:has-text("+ Add Card"), button:has-text("+ Add")').first();
        if (await addCard.isVisible({ timeout: 2000 }).catch(() => false)) {
          const cardNames = [
            'Design product badge mockups',
            'Photograph new catalog items',
            'Review Spring color palette',
          ];
          for (const cardName of cardNames) {
            await addCard.click();
            await wait(300);
            const cardInput = page.locator('input:visible, textarea:visible').last();
            if (await cardInput.isVisible({ timeout: 1000 }).catch(() => false)) {
              await cardInput.fill(cardName);
              await page.keyboard.press('Enter');
              await wait(500);
            }
          }
        }
      } catch (e) {
        warn(`  Kanban content: ${e.message}`);
      }
      await wait(1000);

      const buf = await page.screenshot({ type: 'png' });
      const res = await saveScreenshot(buf, 'kanban-board.webp');
      results.push({ ...SCREENSHOTS[3], sizeKB: res.sizeKB });
      log('  ✓ kanban-board');
    } catch (e) {
      warn(`  ✗ kanban-board: ${e.message}`);
      results.push(SCREENSHOTS[3]);
    }

    // --- 5: Chat Panel ---
    try {
      log('  [5/8] Team Chat');
      // Open chat bubble
      const opened = await clickFirst(page, [
        '.chat-bubble-minimized',
        '.chat-minimized',
        'button[title*="Chat"]',
        'button[aria-label*="Chat"]',
      ], 5000);

      if (opened) await wait(1000);

      // Send some chat messages
      const chatInput = page.locator('.chat-input, input[placeholder*="message"], textarea[placeholder*="message"], input[placeholder*="Type"]').first();
      if (await chatInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const messages = [
          'Hey team! The spring catalog designs are looking great 🎨',
          'Let me know when the inventory counts are updated',
          'Meeting moved to 3pm — check the kanban board for updated tasks',
        ];
        for (const msg of messages) {
          await chatInput.fill(msg);
          await wait(200);
          await chatInput.press('Enter');
          await wait(600);
        }
      }
      await wait(800);

      const buf = await page.screenshot({ type: 'png' });
      const res = await saveScreenshot(buf, 'chat-panel.webp');
      results.push({ ...SCREENSHOTS[4], sizeKB: res.sizeKB });
      log('  ✓ chat-panel');
    } catch (e) {
      warn(`  ✗ chat-panel: ${e.message}`);
      results.push(SCREENSHOTS[4]);
    }

    // --- 6: Inventory ---
    try {
      log('  [6/8] Inventory Management');
      // Close chat if open
      await clickFirst(page, [
        '.chat-minimize-btn',
        'button[title*="Minimize"]',
      ], 1000);
      await wait(300);

      const invDoc = page.locator('.hierarchical-sidebar').getByText('Inventory', { exact: false }).first();
      await invDoc.click();
      await wait(2500);

      // Try adding items
      try {
        const addBtn = page.locator('button:has-text("Add Item"), button:has-text("+ Add"), button:has-text("New Item"), button:has-text("Add")').first();
        if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          const items = [
            { name: 'Widget Pro — Blue', sku: 'WP-001-BL', qty: '145' },
            { name: 'Widget Pro — Red', sku: 'WP-001-RD', qty: '89' },
            { name: 'CloudSync Module', sku: 'CS-200', qty: '312' },
            { name: 'DataVault Drive 1TB', sku: 'DV-1TB', qty: '67' },
          ];
          for (const item of items) {
            await addBtn.click();
            await wait(500);
            // Fill whatever fields are visible
            const nameField = page.locator('input[placeholder*="name"], input[name="name"], input[name="itemName"]').first();
            if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
              await nameField.fill(item.name);
              // Try filling SKU and quantity if fields exist
              const skuField = page.locator('input[placeholder*="SKU"], input[name="sku"]').first();
              if (await skuField.isVisible({ timeout: 500 }).catch(() => false)) {
                await skuField.fill(item.sku);
              }
              const qtyField = page.locator('input[placeholder*="quantity"], input[name="quantity"], input[type="number"]').first();
              if (await qtyField.isVisible({ timeout: 500 }).catch(() => false)) {
                await qtyField.fill(item.qty);
              }
              // Submit
              await page.keyboard.press('Enter');
              await wait(800);
            }
          }
        }
      } catch (e) {
        warn(`  Inventory content: ${e.message}`);
      }
      await wait(500);

      const buf = await page.screenshot({ type: 'png' });
      const res = await saveScreenshot(buf, 'inventory-list.webp');
      results.push({ ...SCREENSHOTS[5], sizeKB: res.sizeKB });
      log('  ✓ inventory-list');
    } catch (e) {
      warn(`  ✗ inventory-list: ${e.message}`);
      results.push(SCREENSHOTS[5]);
    }

    // --- 7: Sharing Panel (Workspace Settings) ---
    try {
      log('  [7/8] Sharing & Invites');
      const opened = await clickFirst(page, [
        'button[title="Share Workspace"]',
        '.hierarchical-sidebar__action-btn--share',
        '.hierarchical-sidebar__settings-btn',
        'button[title="App Settings"]',
        'button[title*="Settings"]',
      ], 5000);

      if (!opened) {
        await clickFirst(page, ['button:has-text("⚙")', '.settings-btn'], 3000);
      }
      await wait(2000);

      // Wait for settings panel
      try {
        await page.waitForSelector('.workspace-settings, .workspace-settings__overlay', {
          state: 'visible', timeout: 5000
        });
      } catch {}
      await wait(1000);

      const buf = await page.screenshot({ type: 'png' });
      const res = await saveScreenshot(buf, 'sharing-panel.webp');
      results.push({ ...SCREENSHOTS[6], sizeKB: res.sizeKB });
      log('  ✓ sharing-panel');

      // Close
      await page.keyboard.press('Escape');
      await wait(500);
    } catch (e) {
      warn(`  ✗ sharing-panel: ${e.message}`);
      results.push(SCREENSHOTS[6]);
    }

    // --- 8: Help Page ---
    try {
      log('  [8/8] Built-in Help');
      // Try F1 or click the help button
      await page.keyboard.press('F1');
      await wait(2000);

      try {
        await page.waitForSelector('.help-page-overlay, .help-page-modal, [data-testid="help-overlay"]', {
          state: 'visible', timeout: 5000
        });
      } catch {}
      await wait(800);

      const buf = await page.screenshot({ type: 'png' });
      const res = await saveScreenshot(buf, 'help-page.webp');
      results.push({ ...SCREENSHOTS[7], sizeKB: res.sizeKB });
      log('  ✓ help-page');

      await page.keyboard.press('Escape');
    } catch (e) {
      warn(`  ✗ help-page: ${e.message}`);
      results.push(SCREENSHOTS[7]);
    }

    // ════════════════════════════════════════════════════════════════════
    //  GENERATE MANIFEST
    // ════════════════════════════════════════════════════════════════════
    let totalSizeKB = 0;
    let captured = 0;
    const manifestScreenshots = SCREENSHOTS.map((def, i) => {
      const filename = `${def.id}.webp`;
      const filePath = path.join(OUTPUT_DIR, filename);
      let sizeKB = 0;
      if (fs.existsSync(filePath)) {
        sizeKB = Math.round(fs.statSync(filePath).size / 1024);
        totalSizeKB += sizeKB;
        captured++;
      }
      return {
        id: def.id,
        title: def.title,
        description: def.description,
        category: def.category,
        filename,
        sizeKB,
        width: WIDTH,
        height: HEIGHT,
      };
    });

    const manifest = {
      generated: new Date().toISOString(),
      resolution: `${WIDTH}x${HEIGHT}`,
      format: 'webp',
      quality: WEBP_QUALITY,
      screenshots: manifestScreenshots,
      stats: { total: SCREENSHOTS.length, captured, failed: SCREENSHOTS.length - captured, totalSizeKB },
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log(`\n  ══════════════════════════════════════`);
    console.log(`  ✅ ${captured}/${SCREENSHOTS.length} screenshots captured`);
    console.log(`  📦 Total size: ${totalSizeKB} KB`);
    console.log(`  📁 Output: ${OUTPUT_DIR}`);
    console.log(`  ══════════════════════════════════════\n`);

    // Cleanup debug screenshots
    const debugFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('_debug_'));
    for (const f of debugFiles) fs.unlinkSync(path.join(OUTPUT_DIR, f));

    await browser.close();
  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    if (browser) await browser.close().catch(() => {});
    process.exitCode = 1;
  } finally {
    // Kill the dev server
    if (process.platform === 'win32') {
      try { spawn('taskkill', ['/pid', String(devServer.pid), '/f', '/t'], { shell: true }); } catch {}
    } else {
      devServer.kill('SIGTERM');
      try { process.kill(-devServer.pid); } catch {}
    }
    log('Dev server stopped');
  }
}

main();
