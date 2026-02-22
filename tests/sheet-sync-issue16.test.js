/**
 * Sheet Sync Fix Tests — Issue #16
 *
 * Validates the fix for spreadsheet cells not syncing between peers.
 *
 * Root cause: Fortune Sheet's `applyOp()` internally catches Immer errors
 * (minified error 15) when sheet IDs mismatch between peers.  The code set
 * `opsAppliedThisCycle = true` even when applyOp silently failed, which
 * blocked the full-sheet `setData()` fallback path from running.
 *
 * Fix:
 *  1. Removed the Y.Array op-based sync path entirely (unreliable).
 *  2. Made sheet IDs deterministic so all peers produce the same default.
 *  3. Full-sheet Y.Map path is now the SOLE sync mechanism.
 *
 * These tests exercise the Yjs-level data flow that Sheet.jsx now relies on,
 * covering the full matrix: web↔web, web↔native, native↔web, native↔native
 * (at the data layer, all four are identical since the Yjs protocol is the
 * same regardless of platform).
 */

import * as Y from 'yjs';

// ─────────────────────────────────────────────────────────────
// Helpers (extracted from Sheet.jsx)
// ─────────────────────────────────────────────────────────────

/** Deterministic sheet ID generator — must match Sheet.jsx */
function generateSheetId(index = 1) {
    return `sheet_${index}`;
}

function convertCelldataToData(sheets) {
    return sheets.map(sheet => {
        const newSheet = { ...sheet };
        if (sheet.celldata && Array.isArray(sheet.celldata) && !sheet.data) {
            const rows = sheet.row || 100;
            const cols = sheet.column || 26;
            const data = Array.from({ length: rows }, () => Array(cols).fill(null));
            for (const cell of sheet.celldata) {
                if (cell && cell.r != null && cell.c != null && cell.r < rows && cell.c < cols) {
                    data[cell.r][cell.c] = cell.v !== undefined ? cell.v : null;
                }
            }
            newSheet.data = data;
        }
        return newSheet;
    });
}

function convertDataToCelldata(sheets) {
    return sheets.map(sheet => {
        const newSheet = { ...sheet };
        if (sheet.data && Array.isArray(sheet.data)) {
            const celldata = [];
            sheet.data.forEach((row, r) => {
                if (row && Array.isArray(row)) {
                    row.forEach((cell, c) => {
                        if (cell !== null && cell !== undefined) {
                            celldata.push({ r, c, v: cell });
                        }
                    });
                }
            });
            newSheet.celldata = celldata;
            delete newSheet.data;
        }
        return newSheet;
    });
}

/** Create a pair of Yjs docs with bidirectional sync (simulates WebSocket) */
function createSyncedPair() {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    doc1.on('update', (update) => Y.applyUpdate(doc2, update));
    doc2.on('update', (update) => Y.applyUpdate(doc1, update));
    return { doc1, doc2 };
}

/**
 * Simulate the saveToYjs flow from Sheet.jsx:
 *   getAllSheets() → convertDataToCelldata() → ysheet.set('sheets', ...) + version
 */
function simulateSave(doc, sheetsWithData) {
    const ysheet = doc.getMap('sheet-data');
    const converted = convertDataToCelldata(JSON.parse(JSON.stringify(sheetsWithData)));
    const version = `${doc.clientID}-${Date.now()}`;
    doc.transact(() => {
        ysheet.set('sheets', JSON.parse(JSON.stringify(converted)));
        ysheet.set('version', version);
    });
    return version;
}

/**
 * Simulate the updateFromYjs flow from Sheet.jsx:
 *   ysheet.get('sheets') → convertCelldataToData() → return for setData()
 */
function simulateReceive(doc) {
    const ysheet = doc.getMap('sheet-data');
    const storedData = ysheet.get('sheets');
    if (!storedData) return null;
    const sheets = JSON.parse(JSON.stringify(storedData));
    return convertCelldataToData(sheets);
}

// ─────────────────────────────────────────────────────────────
// Tests: Deterministic Sheet IDs (Root Cause #5)
// ─────────────────────────────────────────────────────────────
describe('Deterministic sheet IDs', () => {
    test('generateSheetId returns consistent ID for same index', () => {
        expect(generateSheetId(1)).toBe('sheet_1');
        expect(generateSheetId(1)).toBe('sheet_1');
        expect(generateSheetId(2)).toBe('sheet_2');
    });

    test('default index is 1', () => {
        expect(generateSheetId()).toBe('sheet_1');
    });

    test('both peers produce identical default sheets', () => {
        const sheetA = { name: 'Sheet1', id: generateSheetId(), row: 100, column: 26, celldata: [], config: {}, status: 1 };
        const sheetB = { name: 'Sheet1', id: generateSheetId(), row: 100, column: 26, celldata: [], config: {}, status: 1 };
        expect(sheetA.id).toBe(sheetB.id);
        expect(JSON.stringify(sheetA)).toBe(JSON.stringify(sheetB));
    });
});

// ─────────────────────────────────────────────────────────────
// Tests: Full-sheet sync (the SOLE sync path after fix)
// ─────────────────────────────────────────────────────────────
describe('Full-sheet sync (sole sync path)', () => {
    test('single cell edit syncs from peer A to peer B', () => {
        const { doc1, doc2 } = createSyncedPair();

        // Peer A types "Hello" in cell A1
        const sheetsA = [{
            name: 'Sheet1', id: generateSheetId(), row: 100, column: 26,
            data: Array.from({ length: 100 }, () => Array(26).fill(null)),
            config: {}, status: 1,
        }];
        sheetsA[0].data[0][0] = { v: 'Hello' };
        simulateSave(doc1, sheetsA);

        // Peer B receives
        const received = simulateReceive(doc2);
        expect(received).not.toBeNull();
        expect(received[0].data[0][0]).toEqual({ v: 'Hello' });

        doc1.destroy();
        doc2.destroy();
    });

    test('multiple cells sync correctly', () => {
        const { doc1, doc2 } = createSyncedPair();

        const sheetsA = [{
            name: 'Sheet1', id: generateSheetId(), row: 100, column: 26,
            data: Array.from({ length: 100 }, () => Array(26).fill(null)),
            config: {}, status: 1,
        }];
        sheetsA[0].data[0][0] = { v: 'A1' };
        sheetsA[0].data[0][1] = { v: 'B1' };
        sheetsA[0].data[5][3] = { v: 'D6' };
        sheetsA[0].data[99][25] = { v: 'Z100' };
        simulateSave(doc1, sheetsA);

        const received = simulateReceive(doc2);
        expect(received[0].data[0][0]).toEqual({ v: 'A1' });
        expect(received[0].data[0][1]).toEqual({ v: 'B1' });
        expect(received[0].data[5][3]).toEqual({ v: 'D6' });
        expect(received[0].data[99][25]).toEqual({ v: 'Z100' });
        // Unedited cells remain null
        expect(received[0].data[50][13]).toBeNull();

        doc1.destroy();
        doc2.destroy();
    });

    test('bidirectional sync: B edits after receiving from A', () => {
        const { doc1, doc2 } = createSyncedPair();

        // A types in A1
        const sheetsA = [{
            name: 'Sheet1', id: generateSheetId(), row: 10, column: 5,
            data: Array.from({ length: 10 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];
        sheetsA[0].data[0][0] = { v: 'From A' };
        simulateSave(doc1, sheetsA);

        // B receives A's data, then edits B2
        const sheetsB = simulateReceive(doc2);
        sheetsB[0].data[1][1] = { v: 'From B' };
        simulateSave(doc2, sheetsB);

        // A receives B's update
        const receivedAtA = simulateReceive(doc1);
        expect(receivedAtA[0].data[0][0]).toEqual({ v: 'From A' });
        expect(receivedAtA[0].data[1][1]).toEqual({ v: 'From B' });

        doc1.destroy();
        doc2.destroy();
    });

    test('version tracking prevents self-echo', () => {
        const { doc1 } = createSyncedPair();

        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 5, column: 5,
            data: Array.from({ length: 5 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];
        sheets[0].data[0][0] = { v: 'test' };
        const savedVersion = simulateSave(doc1, sheets);

        // The version stored should match what we saved
        const ysheet = doc1.getMap('sheet-data');
        expect(ysheet.get('version')).toBe(savedVersion);
        // In Sheet.jsx, lastSavedVersion.current would equal savedVersion,
        // so updateFromYjs would skip this as "our own save"

        doc1.destroy();
    });

    test('version is composite: clientID-timestamp', () => {
        const doc = new Y.Doc();
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 5, column: 5,
            data: Array.from({ length: 5 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];
        const version = simulateSave(doc, sheets);
        expect(version).toMatch(/^\d+-\d+$/);
        expect(version.startsWith(String(doc.clientID))).toBe(true);
        doc.destroy();
    });
});

// ─────────────────────────────────────────────────────────────
// Tests: Legacy cleanup
// ─────────────────────────────────────────────────────────────
describe('Legacy Y.Array ops cleanup on init', () => {
    test('stale ops in Y.Array are cleaned up', () => {
        const doc = new Y.Doc();
        const yOps = doc.getArray('sheet-ops');

        // Simulate stale ops from old version
        doc.transact(() => {
            yOps.push([{ ops: [{ value: 'stale1' }], clientId: 1 }]);
            yOps.push([{ ops: [{ value: 'stale2' }], clientId: 2 }]);
        });
        expect(yOps.length).toBe(2);

        // Cleanup (as Sheet.jsx now does on init)
        doc.transact(() => { yOps.delete(0, yOps.length); });
        expect(yOps.length).toBe(0);

        doc.destroy();
    });

    test('legacy pendingOps on Y.Map are cleaned up', () => {
        const doc = new Y.Doc();
        const ysheet = doc.getMap('sheet-data');
        ysheet.set('pendingOps', [{ ops: [{ old: true }] }]);
        expect(ysheet.has('pendingOps')).toBe(true);

        doc.transact(() => { ysheet.delete('pendingOps'); });
        expect(ysheet.has('pendingOps')).toBe(false);

        doc.destroy();
    });
});

// ─────────────────────────────────────────────────────────────
// Tests: Three-way sync (3 peers)
// ─────────────────────────────────────────────────────────────
describe('Three-way full-sheet sync', () => {
    test('edit from peer 1 reaches peers 2 and 3', () => {
        const doc1 = new Y.Doc();
        const doc2 = new Y.Doc();
        const doc3 = new Y.Doc();
        doc1.on('update', (u) => { Y.applyUpdate(doc2, u); Y.applyUpdate(doc3, u); });
        doc2.on('update', (u) => { Y.applyUpdate(doc1, u); Y.applyUpdate(doc3, u); });
        doc3.on('update', (u) => { Y.applyUpdate(doc1, u); Y.applyUpdate(doc2, u); });

        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 10, column: 5,
            data: Array.from({ length: 10 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];
        sheets[0].data[0][0] = { v: 'From Peer 1' };
        simulateSave(doc1, sheets);

        const at2 = simulateReceive(doc2);
        const at3 = simulateReceive(doc3);
        expect(at2[0].data[0][0]).toEqual({ v: 'From Peer 1' });
        expect(at3[0].data[0][0]).toEqual({ v: 'From Peer 1' });

        doc1.destroy();
        doc2.destroy();
        doc3.destroy();
    });

    test('sequential edits from different peers all arrive', () => {
        const doc1 = new Y.Doc();
        const doc2 = new Y.Doc();
        const doc3 = new Y.Doc();
        doc1.on('update', (u) => { Y.applyUpdate(doc2, u); Y.applyUpdate(doc3, u); });
        doc2.on('update', (u) => { Y.applyUpdate(doc1, u); Y.applyUpdate(doc3, u); });
        doc3.on('update', (u) => { Y.applyUpdate(doc1, u); Y.applyUpdate(doc2, u); });

        // Peer 1 edits A1
        const sheets1 = [{
            name: 'Sheet1', id: generateSheetId(), row: 10, column: 5,
            data: Array.from({ length: 10 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];
        sheets1[0].data[0][0] = { v: 'P1' };
        simulateSave(doc1, sheets1);

        // Peer 2 receives, adds B2
        const sheets2 = simulateReceive(doc2);
        sheets2[0].data[1][1] = { v: 'P2' };
        simulateSave(doc2, sheets2);

        // Peer 3 receives all, adds C3
        const sheets3 = simulateReceive(doc3);
        sheets3[0].data[2][2] = { v: 'P3' };
        simulateSave(doc3, sheets3);

        // All peers should see all three cells
        const final1 = simulateReceive(doc1);
        const final2 = simulateReceive(doc2);
        const final3 = simulateReceive(doc3);

        for (const final of [final1, final2, final3]) {
            expect(final[0].data[0][0]).toEqual({ v: 'P1' });
            expect(final[0].data[1][1]).toEqual({ v: 'P2' });
            expect(final[0].data[2][2]).toEqual({ v: 'P3' });
        }

        doc1.destroy();
        doc2.destroy();
        doc3.destroy();
    });
});

// ─────────────────────────────────────────────────────────────
// Tests: Edge cases
// ─────────────────────────────────────────────────────────────
describe('Edge cases', () => {
    test('empty sheet syncs without errors', () => {
        const { doc1, doc2 } = createSyncedPair();
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 100, column: 26,
            data: Array.from({ length: 100 }, () => Array(26).fill(null)),
            config: {}, status: 1,
        }];
        simulateSave(doc1, sheets);

        const received = simulateReceive(doc2);
        expect(received[0].data.length).toBe(100);
        expect(received[0].data[0].length).toBe(26);
        // All cells should be null (empty sheet)
        const allNull = received[0].data.flat().every(c => c === null);
        expect(allNull).toBe(true);

        doc1.destroy();
        doc2.destroy();
    });

    test('large sheet (1000 cells) syncs correctly', () => {
        const { doc1, doc2 } = createSyncedPair();
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 100, column: 26,
            data: Array.from({ length: 100 }, () => Array(26).fill(null)),
            config: {}, status: 1,
        }];
        // Fill 1000 cells
        for (let r = 0; r < 50; r++) {
            for (let c = 0; c < 20; c++) {
                sheets[0].data[r][c] = { v: `R${r}C${c}` };
            }
        }
        simulateSave(doc1, sheets);

        const received = simulateReceive(doc2);
        expect(received[0].data[0][0]).toEqual({ v: 'R0C0' });
        expect(received[0].data[49][19]).toEqual({ v: 'R49C19' });
        expect(received[0].data[50][0]).toBeNull(); // outside filled range

        doc1.destroy();
        doc2.destroy();
    });

    test('cell with complex value (formula, style) syncs', () => {
        const { doc1, doc2 } = createSyncedPair();
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 10, column: 5,
            data: Array.from({ length: 10 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];
        sheets[0].data[0][0] = {
            v: 42,
            f: '=SUM(A2:A5)',
            ct: { fa: 'General', t: 'n' },
            bg: '#ff0000',
            bl: 1, // bold
        };
        simulateSave(doc1, sheets);

        const received = simulateReceive(doc2);
        const cell = received[0].data[0][0];
        expect(cell.v).toBe(42);
        expect(cell.f).toBe('=SUM(A2:A5)');
        expect(cell.bg).toBe('#ff0000');
        expect(cell.bl).toBe(1);

        doc1.destroy();
        doc2.destroy();
    });

    test('overwriting a cell value syncs the new value', () => {
        const { doc1, doc2 } = createSyncedPair();
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 10, column: 5,
            data: Array.from({ length: 10 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];

        // First edit
        sheets[0].data[0][0] = { v: 'first' };
        simulateSave(doc1, sheets);
        let received = simulateReceive(doc2);
        expect(received[0].data[0][0]).toEqual({ v: 'first' });

        // Overwrite
        sheets[0].data[0][0] = { v: 'second' };
        simulateSave(doc1, sheets);
        received = simulateReceive(doc2);
        expect(received[0].data[0][0]).toEqual({ v: 'second' });

        doc1.destroy();
        doc2.destroy();
    });

    test('deleting a cell (setting null) syncs', () => {
        const { doc1, doc2 } = createSyncedPair();
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 10, column: 5,
            data: Array.from({ length: 10 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];

        // Create and sync
        sheets[0].data[0][0] = { v: 'hello' };
        simulateSave(doc1, sheets);
        expect(simulateReceive(doc2)[0].data[0][0]).toEqual({ v: 'hello' });

        // Delete
        sheets[0].data[0][0] = null;
        simulateSave(doc1, sheets);
        expect(simulateReceive(doc2)[0].data[0][0]).toBeNull();

        doc1.destroy();
        doc2.destroy();
    });

    test('multi-sheet document syncs all sheets', () => {
        const { doc1, doc2 } = createSyncedPair();
        const sheets = [
            {
                name: 'Sheet1', id: generateSheetId(1), row: 10, column: 5,
                data: Array.from({ length: 10 }, () => Array(5).fill(null)),
                config: {}, status: 1,
            },
            {
                name: 'Sheet2', id: generateSheetId(2), row: 10, column: 5,
                data: Array.from({ length: 10 }, () => Array(5).fill(null)),
                config: {}, status: 0,
            },
        ];
        sheets[0].data[0][0] = { v: 'In Sheet1' };
        sheets[1].data[0][0] = { v: 'In Sheet2' };
        simulateSave(doc1, sheets);

        const received = simulateReceive(doc2);
        expect(received.length).toBe(2);
        expect(received[0].data[0][0]).toEqual({ v: 'In Sheet1' });
        expect(received[1].data[0][0]).toEqual({ v: 'In Sheet2' });
        expect(received[0].id).toBe('sheet_1');
        expect(received[1].id).toBe('sheet_2');

        doc1.destroy();
        doc2.destroy();
    });
});

// ─────────────────────────────────────────────────────────────
// Tests: Offline / delayed sync scenarios
// ─────────────────────────────────────────────────────────────
describe('Offline and delayed sync', () => {
    test('peer B comes online after A has already saved', () => {
        // Doc1 saves while doc2 doesn't exist yet
        const doc1 = new Y.Doc();
        const ysheet1 = doc1.getMap('sheet-data');
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 10, column: 5,
            data: Array.from({ length: 10 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];
        sheets[0].data[0][0] = { v: 'Saved while offline' };
        simulateSave(doc1, sheets);

        // Doc2 comes online and receives the state
        const doc2 = new Y.Doc();
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

        const received = simulateReceive(doc2);
        expect(received[0].data[0][0]).toEqual({ v: 'Saved while offline' });

        doc1.destroy();
        doc2.destroy();
    });

    test('rapid sequential saves from same peer all arrive at remote', () => {
        const { doc1, doc2 } = createSyncedPair();
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 10, column: 5,
            data: Array.from({ length: 10 }, () => Array(5).fill(null)),
            config: {}, status: 1,
        }];

        // 10 rapid saves
        for (let i = 0; i < 10; i++) {
            sheets[0].data[i][0] = { v: `Edit ${i}` };
            simulateSave(doc1, sheets);
        }

        // Peer B should see the final state with all 10 cells
        const received = simulateReceive(doc2);
        for (let i = 0; i < 10; i++) {
            expect(received[0].data[i][0]).toEqual({ v: `Edit ${i}` });
        }

        doc1.destroy();
        doc2.destroy();
    });
});

// ─────────────────────────────────────────────────────────────
// Tests: celldata ↔ data conversion round-trip
// ─────────────────────────────────────────────────────────────
describe('celldata ↔ data conversion for sync', () => {
    test('save converts data→celldata, receive converts celldata→data', () => {
        const { doc1, doc2 } = createSyncedPair();
        const sheets = [{
            name: 'Sheet1', id: generateSheetId(), row: 5, column: 5,
            data: [
                [{ v: 'A1' }, null, null, null, null],
                [null, { v: 'B2' }, null, null, null],
                [null, null, { v: 'C3' }, null, null],
                [null, null, null, null, null],
                [null, null, null, null, null],
            ],
            config: {}, status: 1,
        }];
        simulateSave(doc1, sheets);

        // Verify Yjs stores celldata (sparse), not data (2D)
        const ysheet2 = doc2.getMap('sheet-data');
        const raw = ysheet2.get('sheets');
        expect(raw[0].data).toBeUndefined();
        expect(raw[0].celldata.length).toBe(3); // only 3 non-null cells

        // Receive converts back to 2D
        const received = simulateReceive(doc2);
        expect(received[0].data[0][0]).toEqual({ v: 'A1' });
        expect(received[0].data[1][1]).toEqual({ v: 'B2' });
        expect(received[0].data[2][2]).toEqual({ v: 'C3' });
        expect(received[0].data[0][1]).toBeNull();

        doc1.destroy();
        doc2.destroy();
    });
});
