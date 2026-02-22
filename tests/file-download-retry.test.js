/**
 * Tests for Issue #18 — File Download Retry & Re-Bootstrap Fix
 * 
 * Validates the fixes from v1.8.8:
 * 1. useFileDownload retry with exponential backoff (3 retries: 2s, 4s, 8s)
 * 2. FileTransferContext re-bootstrap when 0 connected peers
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rootDir = path.resolve(__dirname, '..');
const readFile = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf-8');

const downloadSource = readFile('frontend/src/hooks/useFileDownload.js');
const transferSource = readFile('frontend/src/contexts/FileTransferContext.jsx');

// ---------------------------------------------------------------------------
// 1. useFileDownload — retry with exponential backoff
// ---------------------------------------------------------------------------
describe('useFileDownload: P2P chunk retry with backoff', () => {
  test('defines MAX_RETRIES constant', () => {
    expect(downloadSource).toContain('MAX_RETRIES');
    // Should be 3 retries
    expect(downloadSource).toMatch(/MAX_RETRIES\s*=\s*3/);
  });

  test('defines BASE_DELAY_MS for exponential backoff', () => {
    expect(downloadSource).toContain('BASE_DELAY_MS');
    // Should be 2000ms (2 seconds)
    expect(downloadSource).toMatch(/BASE_DELAY_MS\s*=\s*2000/);
  });

  test('has retry loop around requestChunkFromPeer', () => {
    // Should have a for loop with attempt counter
    expect(downloadSource).toMatch(/for\s*\(\s*let\s+attempt\s*=\s*0;\s*attempt\s*<=\s*MAX_RETRIES;\s*attempt\+\+\)/);
  });

  test('uses exponential backoff between retries', () => {
    // delay = BASE_DELAY_MS * Math.pow(2, attempt)
    expect(downloadSource).toContain('Math.pow(2, attempt)');
    expect(downloadSource).toContain('BASE_DELAY_MS * Math.pow(2, attempt)');
  });

  test('breaks out of retry loop on success', () => {
    // After successful chunk retrieval, should break
    expect(downloadSource).toContain('break; // Success — exit retry loop');
  });

  test('only waits if chunk not received and retries remain', () => {
    // Should check !chunkData && attempt < MAX_RETRIES before delay
    expect(downloadSource).toContain('!chunkData && attempt < MAX_RETRIES');
  });

  test('logs retry attempts with attempt number', () => {
    // Should log retry information
    expect(downloadSource).toContain('retry');
    expect(downloadSource).toMatch(/attempt\s*\+\s*1/);
  });

  test('stores chunk locally after successful P2P retrieval', () => {
    // After receiving chunk, should store in IndexedDB
    const storeMatch = downloadSource.match(
      /chunkData\s*=\s*await\s+requestChunkFromPeer[\s\S]*?db\.transaction\('chunks',\s*'readwrite'\)/
    );
    expect(storeMatch).toBeTruthy();
  });

  test('passes holder hints to requestChunkFromPeer', () => {
    // Should extract holders from chunkAvailability
    expect(downloadSource).toContain('chunkAvailability');
    expect(downloadSource).toContain('holders');
  });

  test('still throws if all retries exhausted and chunk unavailable', () => {
    // After retry loop, if chunkData is still null, should throw
    expect(downloadSource).toContain('Chunk ${i} not available locally or from peers');
  });
});

// ---------------------------------------------------------------------------
// 2. FileTransferContext — re-bootstrap on zero peers
// ---------------------------------------------------------------------------
describe('FileTransferContext: re-bootstrap when peers disconnected', () => {
  test('attempts re-bootstrap when 0 connected peers and 0 holders', () => {
    // Should detect the zero-peers condition
    expect(transferSource).toContain('connectedPeers.length === 0 && holders.length === 0');
    // Should log the re-bootstrap attempt
    expect(transferSource).toContain('one-shot re-bootstrap');
  });

  test('uses serverUrlRef and workspaceKeyRef for re-bootstrap', () => {
    // Should read from refs (not stale closure values)
    const rebootstrapSection = transferSource.match(
      /one-shot re-bootstrap[\s\S]*?joinWorkspace/
    );
    expect(rebootstrapSection).toBeTruthy();
    const section = rebootstrapSection[0];
    expect(section).toContain('serverUrlRef.current');
    expect(section).toContain('workspaceKeyRef.current');
  });

  test('computes auth token for re-bootstrap', () => {
    const rebootstrapSection = transferSource.match(
      /one-shot re-bootstrap[\s\S]*?joinWorkspace/
    );
    expect(rebootstrapSection).toBeTruthy();
    const section = rebootstrapSection[0];
    expect(section).toContain('computeRoomAuthToken');
    expect(section).toContain('authToken');
  });

  test('calls peerManager.joinWorkspace for re-bootstrap', () => {
    const rebootstrapSection = transferSource.match(
      /one-shot re-bootstrap[\s\S]*?await peerManager\.joinWorkspace\(/
    );
    expect(rebootstrapSection).toBeTruthy();
  });

  test('waits for connections after re-bootstrap (3 seconds)', () => {
    // Should have a timeout to allow connections to establish
    expect(transferSource).toMatch(/setTimeout\(resolve,\s*3000\)/);
    // Within the re-bootstrap section
    const rebootstrapSection = transferSource.match(
      /one-shot re-bootstrap[\s\S]*?setTimeout\(resolve,\s*3000\)/
    );
    expect(rebootstrapSection).toBeTruthy();
  });

  test('checks peer count after re-bootstrap', () => {
    // Should call getConnectedPeers again after waiting
    const rebootstrapSection = transferSource.match(
      /Re-bootstrap complete[\s\S]*?getConnectedPeers/
    );
    expect(rebootstrapSection).toBeTruthy();
  });

  test('returns null if re-bootstrap yields no peers', () => {
    expect(transferSource).toContain('Re-bootstrap did not yield peers');
    // Should return null
    const nullReturn = transferSource.match(
      /Re-bootstrap did not yield peers[\s\S]*?return null/
    );
    expect(nullReturn).toBeTruthy();
  });

  test('returns null if no serverUrl or workspaceKey available', () => {
    expect(transferSource).toContain('No serverUrl or workspaceKey for re-bootstrap');
    const nullReturn = transferSource.match(
      /No serverUrl or workspaceKey[\s\S]*?return null/
    );
    expect(nullReturn).toBeTruthy();
  });

  test('handles re-bootstrap errors gracefully', () => {
    expect(transferSource).toContain('Re-bootstrap failed:');
    // Should catch errors and return null
    const catchReturn = transferSource.match(
      /Re-bootstrap failed[\s\S]*?return null/
    );
    expect(catchReturn).toBeTruthy();
  });

  test('updates connectedPeers after successful re-bootstrap', () => {
    // Should reassign connectedPeers with new peers found
    expect(transferSource).toContain('connectedPeers = newPeers');
  });

  test('uses let for connectedPeers (mutable for re-bootstrap)', () => {
    // connectedPeers should be let, not const
    expect(transferSource).toMatch(/let\s+connectedPeers\s*=\s*peerManager\.getConnectedPeers/);
  });
});

// ---------------------------------------------------------------------------
// 3. Combined retry ceiling — bounded behavior
// ---------------------------------------------------------------------------
describe('Combined retry behavior: bounded and correct', () => {
  test('useFileDownload retry count is bounded', () => {
    // MAX_RETRIES = 3, loop is attempt <= MAX_RETRIES = 4 attempts max
    expect(downloadSource).toMatch(/MAX_RETRIES\s*=\s*3/);
    expect(downloadSource).toMatch(/attempt\s*<=\s*MAX_RETRIES/);
  });

  test('re-bootstrap is one-shot per requestChunkFromPeer call', () => {
    // The re-bootstrap should only happen once (no loop around it)
    // It's inside an if block that checks connectedPeers.length === 0
    // After re-bootstrap, connectedPeers is either updated or null is returned
    // Count actual re-bootstrap trigger points (the joinWorkspace call inside the re-bootstrap block)
    const rebootTriggers = (transferSource.match(/one-shot re-bootstrap[\s\S]*?await peerManager\.joinWorkspace/g) || []).length;
    expect(rebootTriggers).toBe(1); // Only one re-bootstrap execution path
  });

  test('FileTransferContext has its own internal retry (MAX_CHUNK_RETRIES)', () => {
    // The requestChunkFromPeer has its own retry loop for individual peer requests
    expect(transferSource).toContain('MAX_CHUNK_RETRIES');
  });

  test('backoff delays are reasonable', () => {
    // BASE_DELAY_MS = 2000, exponential: 2s, 4s, 8s
    // Total worst case: 2 + 4 + 8 = 14 seconds of waiting
    const baseDelay = downloadSource.match(/BASE_DELAY_MS\s*=\s*(\d+)/);
    expect(baseDelay).toBeTruthy();
    expect(parseInt(baseDelay[1])).toBe(2000);
    
    // Verify exponential: pow(2, 0) = 1 → 2s, pow(2, 1) = 2 → 4s, pow(2, 2) = 4 → 8s
    expect(downloadSource).toContain('Math.pow(2, attempt)');
  });
});
