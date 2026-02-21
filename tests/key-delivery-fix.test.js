/**
 * Test Suite: Key Delivery Fix (Issue #5)
 *
 * Validates the fix for the "Missing key" error when web app clients
 * (e.g., phone browser) try to deliver encryption keys to the server
 * via POST /api/rooms/:roomName/key.
 *
 * Root cause: express.json() body-parsing middleware was registered AFTER
 * the key delivery route, so req.body was always undefined → 400 "Missing key".
 *
 * Fix: Move express.json() before all POST routes and add inline middleware
 * on the key delivery route as belt-and-suspenders.
 */

import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Server source analysis ──────────────────────────────────────────────────

const serverSource = readFileSync(
  resolve(process.cwd(), 'server/unified/index.js'), 'utf8'
);

const serverLines = serverSource.split('\n');

/**
 * Find the first line number (1-based) that contains the given string.
 */
function findLineNumber(needle) {
  const idx = serverLines.findIndex(l => l.includes(needle));
  return idx === -1 ? -1 : idx + 1;
}

describe('Key Delivery Fix — Issue #5', () => {

  // ── Server middleware ordering ──────────────────────────────────────────

  describe('express.json() middleware ordering', () => {

    test('global express.json() is registered before the key delivery route', () => {
      const jsonMiddlewareLine = findLineNumber('app.use(express.json(');
      const keyRouteLine = findLineNumber("'/api/rooms/:roomName/key'");

      expect(jsonMiddlewareLine).toBeGreaterThan(0);
      expect(keyRouteLine).toBeGreaterThan(0);
      expect(jsonMiddlewareLine).toBeLessThan(keyRouteLine);
    });

    test('key delivery route has inline express.json() middleware', () => {
      // Belt-and-suspenders: the route itself also parses JSON
      const keyRouteSource = serverLines.find(l =>
        l.includes('/api/rooms/:roomName/key') && l.includes('app.post(')
      );
      expect(keyRouteSource).toBeDefined();
      expect(keyRouteSource).toContain('express.json(');
    });

    test('global express.json() is registered before CORS middleware or right after it', () => {
      const corsLine = findLineNumber("'/api'");
      const jsonLine = findLineNumber('app.use(express.json(');
      // JSON parser should be very close to CORS (within 15 lines)
      expect(jsonLine).toBeGreaterThan(0);
      expect(corsLine).toBeGreaterThan(0);
      expect(jsonLine - corsLine).toBeLessThan(15);
    });

    test('there is no duplicate global express.json() registration after POST routes', () => {
      // Find ALL app.use(express.json(...)) lines
      const jsonLines = serverLines
        .map((l, i) => ({ line: i + 1, content: l }))
        .filter(({ content }) =>
          content.includes('app.use(express.json(') && !content.trim().startsWith('//')
        );

      // Should be exactly ONE global registration
      expect(jsonLines.length).toBe(1);
    });
  });

  // ── Key delivery route structure ────────────────────────────────────────

  describe('key delivery route', () => {

    test('route validates req.body.key exists', () => {
      expect(serverSource).toContain("const { key: keyBase64");
      expect(serverSource).toContain("'Missing key'");
    });

    test('route accepts key, publicKey, signature, and timestamp fields', () => {
      expect(serverSource).toContain('key: keyBase64');
      expect(serverSource).toContain('publicKey: pubKeyBase64');
      expect(serverSource).toContain('signature: sigBase64');
      expect(serverSource).toContain('timestamp');
    });

    test('route returns success response on valid key delivery', () => {
      // Should have a success response
      expect(serverSource).toContain("{ success: true }");
    });
  });

  // ── CORS headers ────────────────────────────────────────────────────────

  describe('CORS headers', () => {

    test('CORS allows Authorization header for API endpoints', () => {
      expect(serverSource).toContain('Authorization');
      expect(serverSource).toContain('Access-Control-Allow-Headers');
    });

    test('CORS allows Content-Type header', () => {
      expect(serverSource).toContain('Content-Type');
    });
  });
});

// ── Client-side key delivery resilience ─────────────────────────────────────

const clientSource = readFileSync(
  resolve(process.cwd(), 'frontend/src/utils/websocket.js'), 'utf8'
);

describe('Client Key Delivery Resilience', () => {

  test('deliverKeyToServer has retry logic with maxRetries parameter', () => {
    expect(clientSource).toContain('maxRetries');
    expect(clientSource).toContain('attempt');
  });

  test('retry uses exponential backoff', () => {
    expect(clientSource).toContain('Math.pow(2,');
  });

  test('internal _deliverKeyToServerOnce function exists', () => {
    expect(clientSource).toContain('_deliverKeyToServerOnce');
  });

  test('sends Content-Type: application/json header', () => {
    expect(clientSource).toContain("'Content-Type': 'application/json'");
  });

  test('sends JSON-stringified body with key field', () => {
    expect(clientSource).toContain('JSON.stringify(body)');
    expect(clientSource).toContain('key: keyBase64');
  });

  test('skips delivery in Electron mode without serverUrl', () => {
    expect(clientSource).toContain('isElectron() && !serverUrl');
  });

  test('logs retry attempts with room name prefix', () => {
    expect(clientSource).toContain('[KeyDelivery] Retry');
  });

  test('logs final failure after all attempts exhausted', () => {
    expect(clientSource).toContain('All');
    expect(clientSource).toContain('attempts failed');
  });
});

// ── useWorkspaceSync key delivery integration ───────────────────────────────

const syncSource = readFileSync(
  resolve(process.cwd(), 'frontend/src/hooks/useWorkspaceSync.js'), 'utf8'
);

describe('useWorkspaceSync Key Delivery Integration', () => {

  test('delivers keys for workspace-meta room', () => {
    expect(syncSource).toContain('deliverKeyToServer(roomName, keyBase64');
  });

  test('delivers keys for workspace-folders room', () => {
    expect(syncSource).toContain('deliverKeyToServer(`workspace-folders:');
  });

  test('delivers keys in web mode (non-Electron or with serverUrl)', () => {
    expect(syncSource).toContain("!isElectron() || serverUrl");
  });

  test('retrieves encryption key from stored keychain', () => {
    expect(syncSource).toContain('getStoredKeyChain(workspaceId)');
    expect(syncSource).toContain('keyChain?.workspaceKey');
  });
});
