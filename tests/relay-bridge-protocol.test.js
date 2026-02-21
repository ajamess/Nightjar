/**
 * Relay Bridge Protocol Fix Tests for v1.7.28 (Issue #13)
 *
 * ROOT CAUSE: The relay bridge in sidecar/relay-bridge.js used a WRONG
 * wire protocol for outgoing messages. The y-websocket protocol uses a
 * TWO-LAYER binary format:
 *
 *   OUTER layer (first varuint):
 *     messageSync      = 0  — sync-protocol payload follows
 *     messageAwareness = 1  — awareness update payload follows
 *
 *   INNER sync-protocol layer (second varuint, only when outer == 0):
 *     syncStep1  = 0  — state vector exchange
 *     syncStep2  = 1  — state diff
 *     syncUpdate = 2  — incremental Yjs update
 *
 * BUGS IN relay-bridge.js (before v1.7.28):
 *   1. Outgoing sync responses: sent [1, diff] instead of [0, 1, diff]
 *      → server misinterpreted as messageAwareness (outer type 1)
 *   2. Outgoing updates: sent [2, update] instead of [0, 2, update]
 *      → server silently dropped (outer type 2 not handled)
 *   3. Outgoing awareness: sent [3, data] instead of [1, data]
 *      → server silently dropped (outer type 3 not handled)
 *   4. Incoming dispatch: case 0/1 both went to sync handler
 *      → messageAwareness (1) from server was fed into readSyncMessage
 *
 * RESULT: Data NEVER flowed from sidecar → relay server. The server's
 * doc stayed empty. Web clients synced with an empty doc.
 *
 * ADDITIONAL FIX: Server no longer deletes encryption keys from memory
 * when a doc is destroyed (writeState). Keys persist so bindState can
 * decrypt data when clients reconnect.
 *
 * @jest-environment node
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Y = require('yjs');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');

const rootDir = path.resolve(__dirname, '..');
const readFile = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf-8');

// Read source files for static analysis
const relayBridgeSource = readFile('sidecar/relay-bridge.js');
const serverSource = readFile('server/unified/index.js');
const ywsUtilsSource = readFile('server/unified/node_modules/y-websocket/bin/utils.js');

// y-websocket protocol constants (must match both server and client)
const messageSync = 0;
const messageAwareness = 1;

// Inner sync protocol constants
const messageYjsSyncStep1 = 0;
const messageYjsSyncStep2 = 1;
const messageYjsUpdate = 2;


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Static Analysis — Verify relay bridge uses correct protocol
// ═══════════════════════════════════════════════════════════════════════════════

describe('Relay Bridge Protocol — Static Analysis', () => {

  test('relay bridge defines messageSync = 0 and messageAwareness = 1', () => {
    expect(relayBridgeSource).toContain('const messageSync = 0;');
    expect(relayBridgeSource).toContain('const messageAwareness = 1;');
  });

  test('relay bridge documents the two-layer wire protocol', () => {
    expect(relayBridgeSource).toContain('TWO-LAYER binary message format');
    expect(relayBridgeSource).toContain('OUTER layer');
    expect(relayBridgeSource).toContain('INNER sync-protocol layer');
  });

  test('incoming sync messages dispatched on case messageSync (not case 0/1 fallthrough)', () => {
    // Must use `case messageSync:` not `case 0: case 1:` combined
    expect(relayBridgeSource).toContain('case messageSync:');
    expect(relayBridgeSource).toContain('case messageAwareness:');
    // Old broken code used `case 0:` and `case 1:` for sync step 1/2
    expect(relayBridgeSource).not.toMatch(/case 0:.*sync step 1/);
    expect(relayBridgeSource).not.toMatch(/case 1:.*sync step 2/);
  });

  test('outgoing sync responses include messageSync prefix', () => {
    // The response encoder must have messageSync written before readSyncMessage
    expect(relayBridgeSource).toMatch(
      /encoding\.writeVarUint\(encoder, messageSync\);\s*\n\s*const syncMessageType = syncProtocol\.readSyncMessage/
    );
  });

  test('outgoing sync responses check length > 1 (not > 0)', () => {
    // With the messageSync prefix, an empty response has length 1 (just the prefix)
    // Old code checked > 0 which would always send the prefix byte
    expect(relayBridgeSource).toContain('encoding.length(encoder) > 1');
    expect(relayBridgeSource).not.toContain('encoding.length(encoder) > 0');
  });

  test('outgoing updates use syncProtocol.writeUpdate (not raw [2, data])', () => {
    // Must use the standard writeUpdate which writes [messageYjsUpdate, update]
    // inside a messageSync-prefixed message
    expect(relayBridgeSource).toContain('syncProtocol.writeUpdate(encoder, update)');
    // Old broken code wrote raw type 2
    expect(relayBridgeSource).not.toMatch(/writeVarUint\(encoder, 2\).*update message/);
  });

  test('outgoing updates are wrapped in messageSync', () => {
    // The update handler must write messageSync before writeUpdate
    const updateSection = relayBridgeSource.substring(
      relayBridgeSource.indexOf('Forward local Yjs updates'),
      relayBridgeSource.indexOf('Forward local awareness')
    );
    expect(updateSection).toContain('encoding.writeVarUint(encoder, messageSync)');
    expect(updateSection).toContain('syncProtocol.writeUpdate(encoder, update)');
  });

  test('outgoing awareness uses messageAwareness = 1 (not 3)', () => {
    // Initial awareness send
    expect(relayBridgeSource).toContain('encoding.writeVarUint(awarenessEncoder, messageAwareness)');
    // Awareness forwarding handler
    const awarenessSection = relayBridgeSource.substring(
      relayBridgeSource.indexOf('Forward local awareness')
    );
    expect(awarenessSection).toContain('encoding.writeVarUint(encoder, messageAwareness)');
    // Old broken code used type 3
    expect(relayBridgeSource).not.toMatch(/writeVarUint\(\w+, 3\)/);
  });

  test('initial SyncStep1 is prefixed with messageSync', () => {
    // Look for the initial sync step 1 sending section
    const initSection = relayBridgeSource.substring(
      relayBridgeSource.indexOf('Send initial sync step 1'),
      relayBridgeSource.indexOf('Send our current awareness')
    );
    expect(initSection).toContain('encoding.writeVarUint(encoder, messageSync)');
    expect(initSection).toContain('syncProtocol.writeSyncStep1(encoder, ydoc)');
  });

  test('incoming awareness handled separately from sync (not combined case)', () => {
    // Awareness messages (outer type 1) must be handled in their own case,
    // NOT combined with sync messages in a case 0: case 1: fallthrough
    const messageHandler = relayBridgeSource.substring(
      relayBridgeSource.indexOf('Handle incoming messages from the relay server'),
      relayBridgeSource.indexOf('Send initial sync step 1')
    );
    // Must have separate case for awareness
    expect(messageHandler).toContain('case messageAwareness:');
    expect(messageHandler).toContain('applyAwarenessUpdate');
    // The sync case and awareness case should be separate blocks
    const syncCase = messageHandler.indexOf('case messageSync:');
    const awarenessCase = messageHandler.indexOf('case messageAwareness:');
    expect(syncCase).toBeGreaterThan(-1);
    expect(awarenessCase).toBeGreaterThan(-1);
    expect(awarenessCase).toBeGreaterThan(syncCase);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Wire Protocol Encoding Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Wire Protocol Encoding', () => {

  test('SyncStep1 message has correct two-layer encoding', () => {
    const doc = new Y.Doc();
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);         // outer: messageSync
    syncProtocol.writeSyncStep1(encoder, doc);            // inner: syncStep1 + stateVector
    const message = encoding.toUint8Array(encoder);

    // Decode and verify structure
    const decoder = decoding.createDecoder(message);
    const outerType = decoding.readVarUint(decoder);
    expect(outerType).toBe(messageSync);                  // 0

    const innerType = decoding.readVarUint(decoder);
    expect(innerType).toBe(messageYjsSyncStep1);          // 0

    // Remaining bytes are the state vector
    const sv = decoding.readVarUint8Array(decoder);
    expect(sv).toBeDefined();
    doc.destroy();
  });

  test('SyncStep2 response has correct two-layer encoding', () => {
    const serverDoc = new Y.Doc();
    serverDoc.getMap('test').set('key', 'value');

    // Simulate: server sends SyncStep1 to client
    const serverEncoder = encoding.createEncoder();
    encoding.writeVarUint(serverEncoder, messageSync);
    syncProtocol.writeSyncStep1(serverEncoder, serverDoc);
    const serverMsg = encoding.toUint8Array(serverEncoder);

    // Client receives and processes server's SyncStep1
    const clientDoc = new Y.Doc();
    const clientDecoder = decoding.createDecoder(serverMsg);
    const outerType = decoding.readVarUint(clientDecoder); // consume messageSync
    expect(outerType).toBe(messageSync);

    // Build response with messageSync prefix (as fixed relay bridge does)
    const responseEncoder = encoding.createEncoder();
    encoding.writeVarUint(responseEncoder, messageSync);   // CRITICAL: outer prefix
    syncProtocol.readSyncMessage(clientDecoder, responseEncoder, clientDoc, null);
    const response = encoding.toUint8Array(responseEncoder);

    // Verify response structure
    const respDecoder = decoding.createDecoder(response);
    const respOuterType = decoding.readVarUint(respDecoder);
    expect(respOuterType).toBe(messageSync);               // outer: messageSync

    const respInnerType = decoding.readVarUint(respDecoder);
    expect(respInnerType).toBe(messageYjsSyncStep2);       // inner: syncStep2

    serverDoc.destroy();
    clientDoc.destroy();
  });

  test('SyncStep2 response WITHOUT messageSync prefix is misinterpreted', () => {
    // This verifies the OLD broken behavior: without the messageSync prefix,
    // the inner syncStep2 byte (1) is read as the OUTER type, which is messageAwareness
    const serverDoc = new Y.Doc();
    serverDoc.getMap('test').set('key', 'value');

    const serverEncoder = encoding.createEncoder();
    encoding.writeVarUint(serverEncoder, messageSync);
    syncProtocol.writeSyncStep1(serverEncoder, serverDoc);
    const serverMsg = encoding.toUint8Array(serverEncoder);

    // Client processes but does NOT add messageSync prefix (old broken behavior)
    const clientDoc = new Y.Doc();
    const clientDecoder = decoding.createDecoder(serverMsg);
    decoding.readVarUint(clientDecoder); // consume outer messageSync

    const brokenEncoder = encoding.createEncoder();
    // NO messageSync prefix — this was the bug
    syncProtocol.readSyncMessage(clientDecoder, brokenEncoder, clientDoc, null);
    const brokenResponse = encoding.toUint8Array(brokenEncoder);

    // First byte of broken response would be syncStep2 = 1, which server reads as messageAwareness
    const brokenDecoder = decoding.createDecoder(brokenResponse);
    const firstByte = decoding.readVarUint(brokenDecoder);
    expect(firstByte).toBe(1); // This is syncStep2, but server reads it as messageAwareness!
    expect(firstByte).toBe(messageAwareness); // Proves the misinterpretation

    serverDoc.destroy();
    clientDoc.destroy();
  });

  test('Update messages have correct two-layer encoding', () => {
    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    const update = Y.encodeStateAsUpdate(doc);

    // Correct encoding (as fixed relay bridge does)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);       // outer: messageSync
    syncProtocol.writeUpdate(encoder, update);          // inner: update + data
    const message = encoding.toUint8Array(encoder);

    // Verify structure
    const decoder = decoding.createDecoder(message);
    const outerType = decoding.readVarUint(decoder);
    expect(outerType).toBe(messageSync);

    const innerType = decoding.readVarUint(decoder);
    expect(innerType).toBe(messageYjsUpdate);           // 2

    const updateData = decoding.readVarUint8Array(decoder);
    expect(updateData.length).toBeGreaterThan(0);

    doc.destroy();
  });

  test('Update message WITHOUT messageSync prefix is silently dropped by server', () => {
    const update = new Uint8Array([1, 2, 3]);

    // Old broken encoding: [2, update] — no outer messageSync prefix
    const brokenEncoder = encoding.createEncoder();
    encoding.writeVarUint(brokenEncoder, 2); // messageYjsUpdate as OUTER type
    encoding.writeVarUint8Array(brokenEncoder, update);
    const brokenMessage = encoding.toUint8Array(brokenEncoder);

    // Server reads first byte as outer type
    const decoder = decoding.createDecoder(brokenMessage);
    const outerType = decoding.readVarUint(decoder);
    expect(outerType).toBe(2);
    // Server only handles 0 (messageSync) and 1 (messageAwareness)
    // Type 2 falls through the switch and is silently ignored
    expect(outerType).not.toBe(messageSync);
    expect(outerType).not.toBe(messageAwareness);
  });

  test('Awareness messages have correct encoding', () => {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState({ user: 'test' });

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);    // outer: messageAwareness = 1
    encoding.writeVarUint8Array(encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID])
    );
    const message = encoding.toUint8Array(encoder);

    // Verify structure
    const decoder = decoding.createDecoder(message);
    const outerType = decoding.readVarUint(decoder);
    expect(outerType).toBe(messageAwareness);            // 1

    const awarenessData = decoding.readVarUint8Array(decoder);
    expect(awarenessData.length).toBeGreaterThan(0);

    doc.destroy();
  });

  test('Awareness message with wrong type 3 is NOT messageAwareness', () => {
    // Verifies old broken behavior: type 3 was used for awareness
    const wrongType = 3;
    expect(wrongType).not.toBe(messageAwareness);
    // Server only handles 0 and 1, so type 3 would be silently dropped
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Full Sync Protocol Round-Trip Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Full Sync Protocol Round-Trip', () => {

  /**
   * Simulates the FIXED relay bridge's message handler.
   * Processes an incoming message and returns the response (if any).
   */
  function relayBridgeProcessMessage(data, ydoc) {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case messageSync: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync); // CRITICAL: outer prefix
        syncProtocol.readSyncMessage(decoder, encoder, ydoc, null);
        if (encoding.length(encoder) > 1) {
          return encoding.toUint8Array(encoder);
        }
        return null;
      }
      case messageAwareness: {
        // Just return the raw awareness data for verification
        return { type: 'awareness', data: decoding.readVarUint8Array(decoder) };
      }
      default:
        return null;
    }
  }

  /**
   * Simulates the server's messageListener.
   * Processes an incoming message and returns response data applied + response message.
   */
  function serverProcessMessage(data, doc) {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case messageSync: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, null);
        if (encoding.length(encoder) > 1) {
          return encoding.toUint8Array(encoder);
        }
        return null;
      }
      case messageAwareness: {
        return { type: 'awareness' };
      }
      default:
        return null;
    }
  }

  test('sidecar data reaches server through correct sync protocol', () => {
    // Simulate: sidecar has workspace data, server is empty
    const sidecarDoc = new Y.Doc();
    sidecarDoc.getMap('workspaceInfo').set('name', 'Test Workspace');
    sidecarDoc.getArray('documents').push([{ id: 'doc1', title: 'Test Doc' }]);

    const serverDoc = new Y.Doc();

    // Step 1: Server sends SyncStep1 to sidecar (on connection)
    const serverStep1Enc = encoding.createEncoder();
    encoding.writeVarUint(serverStep1Enc, messageSync);
    syncProtocol.writeSyncStep1(serverStep1Enc, serverDoc);
    const serverStep1 = encoding.toUint8Array(serverStep1Enc);

    // Step 2: Sidecar processes server's SyncStep1, generates SyncStep2 response
    const sidecarResponse = relayBridgeProcessMessage(serverStep1, sidecarDoc);
    expect(sidecarResponse).not.toBeNull();

    // Verify response is correctly formatted
    const respDecoder = decoding.createDecoder(sidecarResponse);
    expect(decoding.readVarUint(respDecoder)).toBe(messageSync); // outer type correct!

    // Step 3: Server processes sidecar's SyncStep2
    const serverResponse2 = serverProcessMessage(sidecarResponse, serverDoc);
    // Server may or may not have a response — doesn't matter

    // Step 4: Sidecar sends its own SyncStep1
    const sidecarStep1Enc = encoding.createEncoder();
    encoding.writeVarUint(sidecarStep1Enc, messageSync);
    syncProtocol.writeSyncStep1(sidecarStep1Enc, sidecarDoc);
    const sidecarStep1 = encoding.toUint8Array(sidecarStep1Enc);

    // Step 5: Server processes sidecar's SyncStep1
    const serverResponse = serverProcessMessage(sidecarStep1, serverDoc);
    if (serverResponse) {
      relayBridgeProcessMessage(serverResponse, sidecarDoc);
    }

    // VERIFY: Server now has the sidecar's data!
    expect(serverDoc.getMap('workspaceInfo').get('name')).toBe('Test Workspace');
    expect(serverDoc.getArray('documents').toArray()).toHaveLength(1);

    sidecarDoc.destroy();
    serverDoc.destroy();
  });

  test('web client receives sidecar data through server relay', () => {
    // Full flow: sidecar → server → web client
    const sidecarDoc = new Y.Doc();
    sidecarDoc.getMap('workspaceInfo').set('name', 'My Workspace');
    sidecarDoc.getMap('workspaceInfo').set('id', 'ws-123');
    sidecarDoc.getArray('documents').push([
      { id: 'doc1', title: 'Notes' },
      { id: 'doc2', title: 'Tasks' },
    ]);
    sidecarDoc.getMap('members').set('creator-pubkey', { role: 'owner' });

    const serverDoc = new Y.Doc();
    const webDoc = new Y.Doc();

    // Phase 1: Sidecar syncs with server
    // Server → Sidecar: SyncStep1
    const s2cStep1 = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, serverDoc);
      return encoding.toUint8Array(enc);
    })();
    const cResponse = relayBridgeProcessMessage(s2cStep1, sidecarDoc);
    if (cResponse) serverProcessMessage(cResponse, serverDoc);

    // Sidecar → Server: SyncStep1
    const c2sStep1 = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, sidecarDoc);
      return encoding.toUint8Array(enc);
    })();
    const sResponse = serverProcessMessage(c2sStep1, serverDoc);
    if (sResponse) relayBridgeProcessMessage(sResponse, sidecarDoc);

    // Server should now have all sidecar data
    expect(serverDoc.getMap('workspaceInfo').get('name')).toBe('My Workspace');
    expect(serverDoc.getArray('documents').toArray()).toHaveLength(2);
    expect(serverDoc.getMap('members').get('creator-pubkey')).toBeDefined();

    // Phase 2: Web client syncs with server (standard y-websocket protocol)
    // Server → Web: SyncStep1
    const s2wStep1 = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, serverDoc);
      return encoding.toUint8Array(enc);
    })();

    // Web client processes server's SyncStep1 (standard WebSocketProvider behavior)
    const webDecoder = decoding.createDecoder(s2wStep1);
    decoding.readVarUint(webDecoder); // consume messageSync
    const webRespEnc = encoding.createEncoder();
    encoding.writeVarUint(webRespEnc, messageSync);
    syncProtocol.readSyncMessage(webDecoder, webRespEnc, webDoc, null);
    if (encoding.length(webRespEnc) > 1) {
      serverProcessMessage(encoding.toUint8Array(webRespEnc), serverDoc);
    }

    // Web → Server: SyncStep1
    const w2sStep1 = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, webDoc);
      return encoding.toUint8Array(enc);
    })();
    const sResponse2 = serverProcessMessage(w2sStep1, serverDoc);
    if (sResponse2 && !(sResponse2 instanceof Object && sResponse2.type)) {
      const wDecoder = decoding.createDecoder(sResponse2);
      decoding.readVarUint(wDecoder);
      const wRespEnc = encoding.createEncoder();
      encoding.writeVarUint(wRespEnc, messageSync);
      syncProtocol.readSyncMessage(wDecoder, wRespEnc, webDoc, null);
    }

    // VERIFY: Web client has all the workspace data!
    expect(webDoc.getMap('workspaceInfo').get('name')).toBe('My Workspace');
    expect(webDoc.getMap('workspaceInfo').get('id')).toBe('ws-123');
    expect(webDoc.getArray('documents').toArray()).toHaveLength(2);
    expect(webDoc.getMap('members').get('creator-pubkey')).toBeDefined();

    sidecarDoc.destroy();
    serverDoc.destroy();
    webDoc.destroy();
  });

  test('incremental updates from sidecar reach server with correct protocol', () => {
    const sidecarDoc = new Y.Doc();
    const serverDoc = new Y.Doc();

    // Initial sync (both empty)
    const step1 = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, sidecarDoc);
      return encoding.toUint8Array(enc);
    })();
    const sResp = serverProcessMessage(step1, serverDoc);
    if (sResp) relayBridgeProcessMessage(sResp, sidecarDoc);

    // Sidecar makes an incremental change
    sidecarDoc.getMap('workspaceInfo').set('name', 'Updated Workspace');

    // Capture the update that would be forwarded
    const update = Y.encodeStateAsUpdate(sidecarDoc);

    // Format update with correct protocol (as fixed relay bridge does)
    const updateEnc = encoding.createEncoder();
    encoding.writeVarUint(updateEnc, messageSync);
    syncProtocol.writeUpdate(updateEnc, update);
    const updateMsg = encoding.toUint8Array(updateEnc);

    // Server processes the update
    const updateResp = serverProcessMessage(updateMsg, serverDoc);

    // Server should have the updated data
    expect(serverDoc.getMap('workspaceInfo').get('name')).toBe('Updated Workspace');

    sidecarDoc.destroy();
    serverDoc.destroy();
  });

  test('incremental updates with OLD broken protocol are silently dropped', () => {
    const sidecarDoc = new Y.Doc();
    const serverDoc = new Y.Doc();

    // Sidecar has data
    sidecarDoc.getMap('workspaceInfo').set('name', 'Workspace');
    const update = Y.encodeStateAsUpdate(sidecarDoc);

    // OLD BROKEN encoding: [2, update] — no messageSync prefix
    const brokenEnc = encoding.createEncoder();
    encoding.writeVarUint(brokenEnc, 2); // messageYjsUpdate as outer type (WRONG!)
    encoding.writeVarUint8Array(brokenEnc, update);
    const brokenMsg = encoding.toUint8Array(brokenEnc);

    // Server processes — returns null because outer type 2 is not handled
    const resp = serverProcessMessage(brokenMsg, serverDoc);
    expect(resp).toBeNull();

    // Server still has no data!
    expect(serverDoc.getMap('workspaceInfo').get('name')).toBeUndefined();

    sidecarDoc.destroy();
    serverDoc.destroy();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Cross-Platform Matrix Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cross-Platform Sync Matrix', () => {

  /**
   * Simulates a full bidirectional sync between two docs via a server relay.
   * Both client A and client B use the correct protocol.
   */
  function fullSync(docA, serverDoc, docB) {
    // A ↔ Server sync
    syncPair(docA, serverDoc);
    // B ↔ Server sync
    syncPair(docB, serverDoc);
    // One more round to propagate B's data through server to A
    syncPair(docA, serverDoc);
  }

  /**
   * Bidirectional sync between two docs using correct y-websocket protocol.
   */
  function syncPair(clientDoc, serverDoc) {
    // Client → Server: SyncStep1
    const c2s = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, clientDoc);
      return encoding.toUint8Array(enc);
    })();

    // Server processes client's SyncStep1, may respond with SyncStep2
    const sResp = (() => {
      const dec = decoding.createDecoder(c2s);
      decoding.readVarUint(dec); // consume messageSync
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.readSyncMessage(dec, enc, serverDoc, null);
      return encoding.length(enc) > 1 ? encoding.toUint8Array(enc) : null;
    })();

    // Client processes server's SyncStep2 (if any)
    if (sResp) {
      const dec = decoding.createDecoder(sResp);
      decoding.readVarUint(dec);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.readSyncMessage(dec, enc, clientDoc, null);
    }

    // Server → Client: SyncStep1
    const s2c = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, serverDoc);
      return encoding.toUint8Array(enc);
    })();

    // Client processes server's SyncStep1, responds with SyncStep2
    const cResp = (() => {
      const dec = decoding.createDecoder(s2c);
      decoding.readVarUint(dec);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.readSyncMessage(dec, enc, clientDoc, null);
      return encoding.length(enc) > 1 ? encoding.toUint8Array(enc) : null;
    })();

    // Server processes client's SyncStep2 (if any)
    if (cResp) {
      const dec = decoding.createDecoder(cResp);
      decoding.readVarUint(dec);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.readSyncMessage(dec, enc, serverDoc, null);
    }
  }

  test('native → web: workspace data syncs through relay', () => {
    const nativeDoc = new Y.Doc();
    const serverDoc = new Y.Doc();
    const webDoc = new Y.Doc();

    // Native creates workspace
    nativeDoc.getMap('workspaceInfo').set('name', 'Shared Workspace');
    nativeDoc.getMap('workspaceInfo').set('id', 'ws-native-1');
    nativeDoc.getArray('documents').push([{ id: 'doc1', title: 'Notes' }]);
    nativeDoc.getMap('members').set('native-user', { role: 'owner' });

    // Full sync: native ↔ server ↔ web
    fullSync(nativeDoc, serverDoc, webDoc);

    // Web client sees all native data
    expect(webDoc.getMap('workspaceInfo').get('name')).toBe('Shared Workspace');
    expect(webDoc.getArray('documents').toArray()).toHaveLength(1);
    expect(webDoc.getMap('members').get('native-user')).toBeDefined();

    nativeDoc.destroy();
    serverDoc.destroy();
    webDoc.destroy();
  });

  test('web → native: workspace changes sync back through relay', () => {
    const nativeDoc = new Y.Doc();
    const serverDoc = new Y.Doc();
    const webDoc = new Y.Doc();

    // Initial sync
    nativeDoc.getMap('workspaceInfo').set('name', 'Workspace');
    fullSync(nativeDoc, serverDoc, webDoc);

    // Web user adds a document
    webDoc.getArray('documents').push([{ id: 'doc-web-1', title: 'Web Doc' }]);
    webDoc.getMap('members').set('web-user', { role: 'member' });

    // Sync again
    fullSync(nativeDoc, serverDoc, webDoc);

    // Native sees web's changes
    expect(nativeDoc.getArray('documents').toArray()).toHaveLength(1);
    expect(nativeDoc.getMap('members').get('web-user')).toBeDefined();

    nativeDoc.destroy();
    serverDoc.destroy();
    webDoc.destroy();
  });

  test('web → web: two browser clients sync through relay', () => {
    const webDoc1 = new Y.Doc();
    const serverDoc = new Y.Doc();
    const webDoc2 = new Y.Doc();

    // Web client 1 creates workspace
    webDoc1.getMap('workspaceInfo').set('name', 'Browser Workspace');
    webDoc1.getArray('documents').push([{ id: 'd1', title: 'Doc 1' }]);

    // Full sync
    fullSync(webDoc1, serverDoc, webDoc2);

    // Web client 2 sees the data
    expect(webDoc2.getMap('workspaceInfo').get('name')).toBe('Browser Workspace');
    expect(webDoc2.getArray('documents').toArray()).toHaveLength(1);

    // Web client 2 adds data
    webDoc2.getArray('documents').push([{ id: 'd2', title: 'Doc 2' }]);
    fullSync(webDoc1, serverDoc, webDoc2);

    // Web client 1 sees the addition
    expect(webDoc1.getArray('documents').toArray()).toHaveLength(2);

    webDoc1.destroy();
    serverDoc.destroy();
    webDoc2.destroy();
  });

  test('native → native: two Electron clients sync through relay', () => {
    const native1 = new Y.Doc();
    const serverDoc = new Y.Doc();
    const native2 = new Y.Doc();

    // Native 1 creates workspace
    native1.getMap('workspaceInfo').set('name', 'Desktop Workspace');
    native1.getMap('workspaceInfo').set('id', 'ws-n2n');
    native1.getArray('documents').push([
      { id: 'd1', title: 'Project Plan' },
      { id: 'd2', title: 'Meeting Notes' },
    ]);

    // Full sync
    fullSync(native1, serverDoc, native2);

    // Native 2 sees everything
    expect(native2.getMap('workspaceInfo').get('name')).toBe('Desktop Workspace');
    expect(native2.getArray('documents').toArray()).toHaveLength(2);

    // Native 2 modifies
    native2.getMap('workspaceInfo').set('name', 'Renamed Workspace');
    native2.getArray('documents').push([{ id: 'd3', title: 'New Doc' }]);
    fullSync(native1, serverDoc, native2);

    // Native 1 sees modifications
    expect(native1.getMap('workspaceInfo').get('name')).toBe('Renamed Workspace');
    expect(native1.getArray('documents').toArray()).toHaveLength(3);

    native1.destroy();
    serverDoc.destroy();
    native2.destroy();
  });

  test('concurrent edits merge correctly through relay', () => {
    const docA = new Y.Doc();
    const serverDoc = new Y.Doc();
    const docB = new Y.Doc();

    // Initial sync
    docA.getMap('workspaceInfo').set('name', 'Collab');
    fullSync(docA, serverDoc, docB);

    // Both make concurrent edits (different keys — no conflict)
    docA.getMap('workspaceInfo').set('description', 'From A');
    docB.getMap('workspaceInfo').set('color', '#ff0000');
    docA.getArray('documents').push([{ id: 'a-doc', title: 'A Doc' }]);
    docB.getArray('documents').push([{ id: 'b-doc', title: 'B Doc' }]);

    // Sync
    fullSync(docA, serverDoc, docB);

    // Both see merged state
    expect(docA.getMap('workspaceInfo').get('description')).toBe('From A');
    expect(docA.getMap('workspaceInfo').get('color')).toBe('#ff0000');
    expect(docB.getMap('workspaceInfo').get('description')).toBe('From A');
    expect(docB.getMap('workspaceInfo').get('color')).toBe('#ff0000');
    expect(docA.getArray('documents').toArray()).toHaveLength(2);
    expect(docB.getArray('documents').toArray()).toHaveLength(2);

    docA.destroy();
    serverDoc.destroy();
    docB.destroy();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Server Persistence Key Retention Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Server Persistence — Key Retention', () => {

  test('server writeState does NOT delete documentKeys', () => {
    // The writeState callback should NOT call documentKeys.delete()
    // Previously it did, which meant reconnecting clients couldn't decrypt stored data
    const writeStateBlock = serverSource.substring(
      serverSource.indexOf('writeState: async (docName, ydoc)'),
      serverSource.indexOf('console.log(\'[Persistence] SQLite persistence enabled')
    );
    expect(writeStateBlock).not.toContain('documentKeys.delete(docName)');
  });

  test('server writeState still cleans up pendingKeyLoads', () => {
    // pendingKeyLoads should still be cleaned up (the deferred load is no longer pending)
    const writeStateBlock = serverSource.substring(
      serverSource.indexOf('writeState: async (docName, ydoc)'),
      serverSource.indexOf('console.log(\'[Persistence] SQLite persistence enabled')
    );
    expect(writeStateBlock).toContain('pendingKeyLoads.delete(docName)');
  });

  test('server writeState has explanatory comment about key retention', () => {
    expect(serverSource).toContain('Do NOT delete keys from memory when a doc is destroyed');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Protocol Compatibility with Standard y-websocket
// ═══════════════════════════════════════════════════════════════════════════════

describe('Protocol Compatibility with Standard y-websocket', () => {

  test('relay bridge outgoing format matches y-websocket server updateHandler', () => {
    // y-websocket server forwards updates as: [messageSync, writeUpdate]
    // The relay bridge must use the same format
    // Verify server format (in y-websocket/bin/utils.js, the canonical message handler)
    expect(ywsUtilsSource).toContain('encoding.writeVarUint(encoder, messageSync)');

    // Verify relay bridge format matches
    expect(relayBridgeSource).toContain('encoding.writeVarUint(encoder, messageSync)');
    expect(relayBridgeSource).toContain('syncProtocol.writeUpdate(encoder, update)');
  });

  test('relay bridge message handler matches server messageListener pattern', () => {
    // Both should: read outer type → write messageSync prefix → call readSyncMessage → check length > 1
    // Server pattern (in y-websocket/bin/utils.js):
    expect(ywsUtilsSource).toContain('encoding.writeVarUint(encoder, messageSync)');
    expect(ywsUtilsSource).toContain('syncProtocol.readSyncMessage(decoder, encoder, doc, conn)');
    expect(ywsUtilsSource).toContain('encoding.length(encoder) > 1');

    // Relay bridge should match:
    expect(relayBridgeSource).toContain('encoding.writeVarUint(encoder, messageSync)');
    expect(relayBridgeSource).toContain('syncProtocol.readSyncMessage(decoder, encoder, ydoc, null)');
    expect(relayBridgeSource).toContain('encoding.length(encoder) > 1');
  });

  test('relay bridge awareness format matches y-websocket WebSocketProvider', () => {
    // Standard WebSocketProvider uses messageAwareness = 1
    // Relay bridge must also use 1 (not 3 as it did before)
    const wsProviderSource = readFile('node_modules/y-websocket/src/y-websocket.js');
    expect(wsProviderSource).toContain('export const messageAwareness = 1');
    expect(relayBridgeSource).toContain('const messageAwareness = 1;');
  });

  test('relay bridge has no references to type 3 (old broken awareness type)', () => {
    // Type 3 was the old incorrect awareness message type
    // Verify no writeVarUint with literal 3 remains
    expect(relayBridgeSource).not.toMatch(/writeVarUint\(\w+, 3\)/);
  });

  test('relay bridge has no raw write of type 2 for updates', () => {
    // Raw `writeVarUint(encoder, 2)` was the old broken update forwarding
    // Should use syncProtocol.writeUpdate instead
    expect(relayBridgeSource).not.toMatch(/writeVarUint\(\w+, 2\).*update/i);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Edge Cases and Robustness
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge Cases and Robustness', () => {

  test('empty doc sync works correctly', () => {
    const doc1 = new Y.Doc();
    const serverDoc = new Y.Doc();
    const doc2 = new Y.Doc();

    // Sync empty docs — should not crash
    const step1 = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, doc1);
      return encoding.toUint8Array(enc);
    })();

    const dec = decoding.createDecoder(step1);
    decoding.readVarUint(dec);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, messageSync);
    syncProtocol.readSyncMessage(dec, enc, serverDoc, null);

    // Response should just be messageSync prefix (no data to send)
    // or a SyncStep2 with empty diff
    expect(encoding.length(enc)).toBeLessThanOrEqual(10); // Small response

    doc1.destroy();
    serverDoc.destroy();
    doc2.destroy();
  });

  test('large document syncs correctly through relay protocol', () => {
    const doc1 = new Y.Doc();
    const serverDoc = new Y.Doc();

    // Create large document
    const arr = doc1.getArray('items');
    for (let i = 0; i < 100; i++) {
      arr.push([{ id: `item-${i}`, data: 'x'.repeat(100) }]);
    }

    // Sync to server
    const step1 = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, doc1);
      return encoding.toUint8Array(enc);
    })();

    // Server processes
    const dec1 = decoding.createDecoder(step1);
    decoding.readVarUint(dec1);
    const enc1 = encoding.createEncoder();
    encoding.writeVarUint(enc1, messageSync);
    syncProtocol.readSyncMessage(dec1, enc1, serverDoc, null);

    // Server sends its SyncStep1
    const sStep1 = (() => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageSync);
      syncProtocol.writeSyncStep1(enc, serverDoc);
      return encoding.toUint8Array(enc);
    })();

    // Client responds with SyncStep2 (with messageSync prefix)
    const dec2 = decoding.createDecoder(sStep1);
    decoding.readVarUint(dec2);
    const enc2 = encoding.createEncoder();
    encoding.writeVarUint(enc2, messageSync);
    syncProtocol.readSyncMessage(dec2, enc2, doc1, null);
    if (encoding.length(enc2) > 1) {
      const dec3 = decoding.createDecoder(encoding.toUint8Array(enc2));
      decoding.readVarUint(dec3);
      const enc3 = encoding.createEncoder();
      encoding.writeVarUint(enc3, messageSync);
      syncProtocol.readSyncMessage(dec3, enc3, serverDoc, null);
    }

    // Server should have all 100 items
    expect(serverDoc.getArray('items').toArray()).toHaveLength(100);

    doc1.destroy();
    serverDoc.destroy();
  });

  test('relay bridge update origin "relay" prevents echo loops', () => {
    // The relay bridge should NOT forward updates that originated from the relay
    // This is checked via: if (origin === 'relay') return;
    expect(relayBridgeSource).toContain("if (origin === 'relay') return;");
  });

  test('relay bridge awareness origin "relay" prevents echo loops', () => {
    expect(relayBridgeSource).toContain("if (origin === 'relay') return; // Don't echo relay awareness back");
  });
});
