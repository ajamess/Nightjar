/**
 * tests/inventory-export.test.js
 *
 * Unit tests for inventoryExport.js
 * See docs/INVENTORY_SYSTEM_SPEC.md §9.5
 */

// Mock XLSX before importing module under test
jest.mock('xlsx', () => {
  const sheets = [];
  return {
    utils: {
      json_to_sheet: jest.fn((data) => ({ data, __type: 'sheet' })),
      book_new: jest.fn(() => ({ Sheets: {}, SheetNames: [] })),
      book_append_sheet: jest.fn((wb, ws, name) => {
        wb.Sheets[name] = ws;
        wb.SheetNames.push(name);
        sheets.push({ wb, ws, name });
      }),
    },
    writeFile: jest.fn(),
    __sheets: sheets,
  };
});

import * as XLSX from 'xlsx';
import { exportRequests, exportAuditLog, exportProducers, exportChartPng } from '../frontend/src/utils/inventoryExport';

// ---------------------------------------------------------------------------
// exportRequests
// ---------------------------------------------------------------------------

describe('exportRequests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call XLSX.writeFile with csv by default', () => {
    const requests = [
      { id: 'r1', catalogItemName: 'Widget', quantity: 5, status: 'open', urgent: false, requestedAt: Date.now() },
    ];
    exportRequests(requests);

    expect(XLSX.utils.json_to_sheet).toHaveBeenCalledTimes(1);
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    const [, filename, opts] = XLSX.writeFile.mock.calls[0];
    expect(filename).toMatch(/^inventory-requests-.*\.csv$/);
    expect(opts.bookType).toBe('csv');
  });

  it('should support xlsx format', () => {
    exportRequests([{ id: 'r1', catalogItemName: 'A', quantity: 1, status: 'open' }], 'xlsx');
    const [, filename] = XLSX.writeFile.mock.calls[0];
    expect(filename).toMatch(/\.xlsx$/);
  });

  it('should use custom filename', () => {
    exportRequests([], 'csv', 'my-export');
    const [, filename] = XLSX.writeFile.mock.calls[0];
    expect(filename).toBe('my-export.csv');
  });

  it('should map all request fields to columns', () => {
    const req = {
      id: 'r1',
      catalogItemName: 'Widget',
      quantity: 10,
      status: 'shipped',
      urgent: true,
      requestedBy: 'Alice',
      state: 'CO',
      city: 'Denver',
      assignedTo: 'producer-a',
      requestedAt: Date.now(),
      shippedAt: Date.now(),
      deliveredAt: null,
      trackingNumber: '1Z123',
      notes: 'Rush order',
    };
    exportRequests([req]);

    const rows = XLSX.utils.json_to_sheet.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty('ID', 'r1');
    expect(rows[0]).toHaveProperty('Item', 'Widget');
    expect(rows[0]).toHaveProperty('Quantity', 10);
    expect(rows[0]).toHaveProperty('Tracking', '1Z123');
  });

  it('should handle empty requests array', () => {
    exportRequests([]);
    expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith([]);
    expect(XLSX.writeFile).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// exportAuditLog
// ---------------------------------------------------------------------------

describe('exportAuditLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const now = Date.now();
  const entries = [
    { id: 'a1', timestamp: now - 5000, actorName: 'Alice', actorRole: 'owner', action: 'create', targetType: 'request', targetId: 'r1', summary: 'Created' },
    { id: 'a2', timestamp: now - 1000, actorName: 'Bob', actorRole: 'editor', action: 'approve', targetType: 'request', targetId: 'r2', summary: 'Approved' },
  ];

  it('should export all entries when no date range', () => {
    exportAuditLog(entries);
    const rows = XLSX.utils.json_to_sheet.mock.calls[0][0];
    expect(rows).toHaveLength(2);
  });

  it('should filter by from date', () => {
    exportAuditLog(entries, { from: now - 3000 });
    const rows = XLSX.utils.json_to_sheet.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].ID).toBe('a2');
  });

  it('should filter by to date', () => {
    exportAuditLog(entries, { to: now - 3000 });
    const rows = XLSX.utils.json_to_sheet.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].ID).toBe('a1');
  });

  it('should always use csv format', () => {
    exportAuditLog(entries);
    const [, filename, opts] = XLSX.writeFile.mock.calls[0];
    expect(filename).toMatch(/\.csv$/);
    expect(opts.bookType).toBe('csv');
  });
});

// ---------------------------------------------------------------------------
// exportProducers
// ---------------------------------------------------------------------------

describe('exportProducers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export producer data', () => {
    const producers = [
      { displayName: 'Alice', fulfilled: 10, units: 100, avgDays: 3.2, onTimePercent: 80 },
      { id: 'producer-b', fulfilled: 5, units: 50, avgDays: null, onTimePercent: null },
    ];
    exportProducers(producers);

    const rows = XLSX.utils.json_to_sheet.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0].Name).toBe('Alice');
    expect(rows[0]['Requests Fulfilled']).toBe(10);
    expect(rows[0]['On-Time %']).toBe('80%');
    expect(rows[1].Name).toBe('producer-b');
  });

  it('should support xlsx format', () => {
    exportProducers([], 'xlsx');
    const [, filename] = XLSX.writeFile.mock.calls[0];
    expect(filename).toMatch(/\.xlsx$/);
  });
});

// ---------------------------------------------------------------------------
// exportChartPng
// ---------------------------------------------------------------------------

describe('exportChartPng', () => {
  it('should do nothing when canvas is null', () => {
    exportChartPng(null);
    // No error thrown
  });

  it('should create download link from canvas', () => {
    const mockCanvas = {
      toDataURL: jest.fn(() => 'data:image/png;base64,abc'),
    };
    const mockLink = {
      href: '',
      download: '',
      click: jest.fn(),
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
    jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    exportChartPng(mockCanvas, 'my-chart');

    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(mockLink.download).toBe('my-chart.png');
    expect(mockLink.click).toHaveBeenCalled();
    expect(document.body.appendChild).toHaveBeenCalledWith(mockLink);
    expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);

    document.createElement.mockRestore();
    document.body.appendChild.mockRestore();
    document.body.removeChild.mockRestore();
  });
});
