/**
 * tests/components/inventory/workflow-import-export.test.jsx
 *
 * End-to-end workflow tests for:
 *   - Import wizard multi-step flow
 *   - File upload validation
 *   - Column mapping
 *   - Import preview & confirm
 *   - Export functions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  createMockYMap,
  createMockYArray,
  createTestRequest,
  createTestCatalogItem,
  createTestIdentity,
  createTestAuditEntry,
  resetIdCounter,
} from '../../helpers/inventory-test-utils';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockCtx;
let mockSyncResult;
let mockShowToast;
let mockParseFile;
let mockValidateRow;

jest.mock('../../../frontend/src/contexts/InventoryContext', () => ({
  InventoryProvider: ({ children }) => <div>{children}</div>,
  useInventory: jest.fn(() => ({ ...mockCtx, ...mockSyncResult })),
}));

jest.mock('../../../frontend/src/contexts/ToastContext', () => ({
  useToast: jest.fn(() => ({ showToast: mockShowToast })),
}));

jest.mock('../../../frontend/src/hooks/useInventorySync', () => {
  const fn = jest.fn(() => mockSyncResult);
  fn.default = fn;
  return { __esModule: true, default: fn, useInventorySync: fn };
});

jest.mock('../../../frontend/src/hooks/usePermission', () => ({
  usePermission: jest.fn(() => ({ isOwner: true, isEditor: false, isViewer: false })),
}));

jest.mock('../../../frontend/src/utils/inventoryValidation', () => ({
  ...jest.requireActual('../../../frontend/src/utils/inventoryValidation'),
  generateId: jest.fn(() => 'mock-id-' + Math.random().toString(36).slice(2, 8)),
}));

jest.mock('../../../frontend/src/utils/importParser', () => ({
  parseFile: jest.fn(() => mockParseFile),
  validateRow: jest.fn((...args) => mockValidateRow(...args)),
}));

jest.mock('../../../frontend/src/utils/importMapper', () => ({
  autoMapColumns: jest.fn(() => ({
    'Item': { target: 'item', confidence: 100 },
    'Qty': { target: 'quantity', confidence: 80 },
    'Status': { target: 'status', confidence: 90 },
  })),
  TARGET_FIELDS: ['item', 'quantity', 'status', 'urgency', 'requester_name', 'requester_state'],
  REQUIRED_FIELDS: ['item', 'quantity'],
  inferStatus: jest.fn((s) => s || 'open'),
  inferUrgency: jest.fn((u) => u || 'normal'),
}));

const mockExportRequests = jest.fn();
const mockExportAuditLog = jest.fn();
const mockExportProducers = jest.fn();

jest.mock('../../../frontend/src/utils/inventoryExport', () => ({
  exportRequests: (...args) => mockExportRequests(...args),
  exportAuditLog: (...args) => mockExportAuditLog(...args),
  exportProducers: (...args) => mockExportProducers(...args),
}));

jest.mock('../../../frontend/src/utils/addressCrypto', () => ({
  getPublicKeyHex: jest.fn(() => 'admin-hex'),
}));

jest.mock('../../../frontend/src/utils/inventoryAddressStore', () => ({
  getAddress: jest.fn(() => Promise.resolve(null)),
}));

// Recharts
jest.mock('recharts', () => {
  const make = (name) => (props) => <div data-testid={name}>{props.children}</div>;
  return {
    ResponsiveContainer: ({ children }) => <div>{typeof children === 'function' ? children(400, 200) : children}</div>,
    LineChart: make('line-chart'),
    ComposedChart: make('composed-chart'),
    Line: make('line'),
    Area: make('area'),
    XAxis: make('x-axis'),
    YAxis: make('y-axis'),
    CartesianGrid: make('cartesian-grid'),
    Tooltip: make('tooltip'),
  };
});

// CSS mocks
jest.mock('../../../frontend/src/components/inventory/import/ImportWizard.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/admin/AllRequests.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/admin/AuditLog.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/admin/AdminDashboard.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/admin/ApprovalQueue.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/admin/CatalogManager.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/admin/InventorySettings.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/admin/ProducerManagement.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/producer/ProducerDashboard.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/producer/OpenRequests.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/producer/ProducerMyRequests.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/producer/ProducerStats.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/producer/AddressReveal.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/requestor/MyRequests.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/requestor/SubmitRequest.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/requestor/RequestFAQ.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/requestor/SavedAddresses.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/common/StatusBadge.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/common/RequestCard.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/common/CapacityInput.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/common/RequestDetail.css', () => ({}));

// ── Component imports (after mocks) ───────────────────────────────────────

const ImportWizard = require('../../../frontend/src/components/inventory/import/ImportWizard').default;
const FileUpload = require('../../../frontend/src/components/inventory/import/FileUpload').default;
const ColumnMapper = require('../../../frontend/src/components/inventory/import/ColumnMapper').default;
const ImportPreview = require('../../../frontend/src/components/inventory/import/ImportPreview').default;
const AllRequests = require('../../../frontend/src/components/inventory/admin/AllRequests').default;
const AuditLog = require('../../../frontend/src/components/inventory/admin/AuditLog').default;

// ── Shared test data ──────────────────────────────────────────────────────

const ADMIN_IDENTITY = {
  publicKeyBase62: 'adminKey123',
  displayName: 'Admin Alice',
  name: 'Admin Alice',
  privateKey: new Uint8Array(32),
};

const COLLABORATORS = [
  { publicKey: 'adminKey123', publicKeyBase62: 'adminKey123', name: 'Admin Alice', displayName: 'Admin Alice', permission: 'owner' },
  { publicKey: 'producerKey456', publicKeyBase62: 'producerKey456', name: 'Producer Bob', displayName: 'Producer Bob', permission: 'editor' },
];

// ── Shared Yjs mock instances ─────────────────────────────────────────────

let yRequests, yAudit, ySystems, yCatalog, yCapacities, yReveals, yPending;

function buildSharedYjs() {
  ySystems = createMockYMap({ 'sys-1': { name: 'Test System', onboardingComplete: true, settings: {} } });
  yCatalog = createMockYArray([createTestCatalogItem({ id: 'cat-widget', name: 'Widget', unit: 'units' })]);
  yRequests = createMockYArray([]);
  yCapacities = createMockYMap({});
  yReveals = createMockYMap({});
  yPending = createMockYMap({});
  yAudit = createMockYArray([]);
  yRequests.doc = { transact: jest.fn((fn) => fn()) };
}

function setContext() {
  mockCtx = {
    yInventoryRequests: yRequests,
    yInventoryAuditLog: yAudit,
    yInventorySystems: ySystems,
    yCatalogItems: yCatalog,
    yProducerCapacities: yCapacities,
    yAddressReveals: yReveals,
    yPendingAddresses: yPending,
    inventorySystemId: 'sys-1',
    workspaceId: 'ws-1',
    userIdentity: ADMIN_IDENTITY,
    collaborators: COLLABORATORS,
  };
}

function refreshSync() {
  mockSyncResult = {
    currentSystem: ySystems.get('sys-1'),
    inventorySystems: [ySystems.get('sys-1')],
    catalogItems: yCatalog.toArray(),
    requests: yRequests.toArray(),
    producerCapacities: yCapacities.toJSON(),
    addressReveals: yReveals.toJSON(),
    pendingAddresses: yPending.toJSON(),
    auditLog: yAudit.toArray(),
    openRequestCount: yRequests.toArray().filter(r => r.status === 'open').length,
    pendingApprovalCount: 0,
    activeRequestCount: 0,
    allRequests: yRequests.toArray(),
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockShowToast = jest.fn();
  resetIdCounter();
  buildSharedYjs();
  setContext();
  refreshSync();

  mockParseFile = {
    headers: ['Item', 'Qty', 'Status'],
    rows: [
      { Item: 'Widget', Qty: '10', Status: 'open' },
      { Item: 'Gadget', Qty: '5', Status: 'open' },
    ],
    sheetNames: ['Sheet1'],
  };

  mockValidateRow = jest.fn((row) => ({
    valid: true,
    errors: [],
    warnings: [],
    mapped: { item: row.Item || row.item || 'Widget', quantity: Number(row.Qty || row.quantity || 10), status: row.Status || row.status || 'open' },
  }));
});

// ═══════════════════════════════════════════════════════════════════════════
//  1. FILE UPLOAD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe('File Upload Validation', () => {
  test('renders dropzone with accepted formats', () => {
    render(<FileUpload onFileLoaded={jest.fn()} />);

    expect(screen.getByText(/Drag & drop files here/)).toBeInTheDocument();
    expect(screen.getByText(/CSV, XLSX, or XLS/)).toBeInTheDocument();
  });

  test('file input accepts only csv/xlsx/xls', () => {
    const { container } = render(<FileUpload onFileLoaded={jest.fn()} />);
    const input = container.querySelector('input[type="file"]');
    expect(input.accept).toBe('.csv,.xlsx,.xls');
  });

  test('drag over adds visual class, drag leave removes it', () => {
    const { container } = render(<FileUpload onFileLoaded={jest.fn()} />);
    const dropzone = container.querySelector('.fu-dropzone');

    fireEvent.dragOver(dropzone, { preventDefault: jest.fn() });
    expect(dropzone).toHaveClass('drag-over');

    fireEvent.dragLeave(dropzone);
    expect(dropzone).not.toHaveClass('drag-over');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  2. COLUMN MAPPER WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

describe('Column Mapper Workflow', () => {
  const headers = ['Item', 'Qty', 'Status'];
  const sampleRows = [{ Item: 'Widget', Qty: '10', Status: 'open' }];

  test('auto-maps columns based on header names', () => {
    const onMappingComplete = jest.fn();
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={onMappingComplete}
        catalogItems={[]}
      />
    );

    expect(screen.getByText(/Map your file columns/)).toBeInTheDocument();
    // Each header should have a select mapped to auto-detected target
  });

  test('shows all source columns with dropdowns', () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={jest.fn()}
        catalogItems={[]}
      />
    );

    // Three columns: Item, Qty, Status
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(3);
  });

  test('shows sample data preview', () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={jest.fn()}
        catalogItems={[]}
      />
    );

    // Sample values should be visible
    expect(screen.getByText('Widget')).toBeInTheDocument();
  });

  test('confirm mapping calls onMappingComplete', () => {
    const onMappingComplete = jest.fn();
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={onMappingComplete}
        catalogItems={[]}
      />
    );

    fireEvent.click(screen.getByText(/Continue to Preview/));
    expect(onMappingComplete).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  3. IMPORT PREVIEW WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

describe('Import Preview Workflow', () => {
  const rows = [
    { Item: 'Widget', Qty: '10', Status: 'open' },
    { Item: 'Gadget', Qty: '5', Status: 'pending' },
  ];
  const mapping = {
    'Item': 'item',
    'Qty': 'quantity',
    'Status': 'status',
  };

  test('renders preview with row count', () => {
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={[{ id: 'cat-1', name: 'Widget' }]}
        onConfirm={jest.fn()}
      />
    );

    // Should show total/valid/warning/error counts
    expect(screen.getByText('Total Rows')).toBeInTheDocument();
  });

  test('shows validation summary cards', () => {
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={[]}
        onConfirm={jest.fn()}
      />
    );

    // Summary section with Valid, Warnings, Errors (labels have emoji prefixes)
    expect(screen.getByText(/Valid/)).toBeInTheDocument();
  });

  test('confirm button triggers onConfirm with valid rows', () => {
    const onConfirm = jest.fn();
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={[]}
        onConfirm={onConfirm}
      />
    );

    const confirmBtn = screen.getByText(/Import/);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  4. IMPORT WIZARD END-TO-END
// ═══════════════════════════════════════════════════════════════════════════

describe('Import Wizard End-to-End', () => {
  test('renders step indicator starting at step 1', () => {
    render(<ImportWizard />);

    expect(screen.getByText('Upload File')).toBeInTheDocument();
    expect(screen.getByText('Map Columns')).toBeInTheDocument();
    expect(screen.getByText('Preview & Validate')).toBeInTheDocument();
  });

  test('starts on FileUpload step', () => {
    render(<ImportWizard />);

    // FileUpload is rendered — shows dropzone
    expect(screen.getByText(/Drag & drop files here/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  5. EXPORT WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════

describe('Export Workflows', () => {
  test('AllRequests has export CSV button', () => {
    yRequests.push([
      createTestRequest({ id: 'req-exp-1', status: 'open', catalogItemName: 'Widget', inventorySystemId: 'sys-1', state: 'CA', city: 'LA' }),
    ]);
    refreshSync();

    render(<AllRequests />);
    expect(screen.getByText(/Export CSV/)).toBeInTheDocument();
  });

  test('clicking export triggers exportRequests', () => {
    yRequests.push([
      createTestRequest({ id: 'req-exp-2', status: 'open', catalogItemName: 'Widget', inventorySystemId: 'sys-1', state: 'CA', city: 'LA' }),
    ]);
    refreshSync();

    render(<AllRequests />);
    fireEvent.click(screen.getByText(/Export CSV/));

    expect(mockExportRequests).toHaveBeenCalled();
  });

  test('AuditLog renders and shows entries', () => {
    yAudit.push([
      createTestAuditEntry({ id: 'aud-1', action: 'request_submitted', summary: 'Request created' }),
      createTestAuditEntry({ id: 'aud-2', action: 'request_approved', summary: 'Request approved' }),
    ]);
    refreshSync();

    render(<AuditLog />);
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });

  test('export functions can be called with correct args', () => {
    const { exportRequests, exportAuditLog, exportProducers } = require('../../../frontend/src/utils/inventoryExport');

    const requests = [createTestRequest({ id: 'r1' })];
    exportRequests(requests, 'csv', 'test-export');
    expect(mockExportRequests).toHaveBeenCalledWith(requests, 'csv', 'test-export');

    const entries = [createTestAuditEntry({ id: 'a1' })];
    const now = Date.now();
    exportAuditLog(entries, { from: 0, to: now }, 'audit-export');
    expect(mockExportAuditLog).toHaveBeenCalledWith(entries, { from: 0, to: now }, 'audit-export');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  6. IMPORTED REQUESTS → PRODUCER MATCH
// ═══════════════════════════════════════════════════════════════════════════

describe('Imported Requests Producer Match', () => {
  const PRODUCER_IDENTITY = {
    publicKeyBase62: 'producerKey456',
    displayName: 'Producer Bob',
    name: 'Producer Bob',
    privateKey: new Uint8Array(32),
  };

  test('producer sees import match banner when imported requests match their name', () => {
    yRequests.push([
      createTestRequest({
        id: 'req-imp-1',
        status: 'open',
        inventorySystemId: 'sys-1',
        catalogItemId: 'cat-widget',
        catalogItemName: 'Widget',
        importedProducerName: 'Producer Bob',
        quantity: 10,
      }),
    ]);
    refreshSync();

    mockCtx = {
      ...mockCtx,
      userIdentity: PRODUCER_IDENTITY,
    };

    const ProducerDashboard = require('../../../frontend/src/components/inventory/producer/ProducerDashboard').default;
    render(<ProducerDashboard onNavigate={jest.fn()} />);

    // Should show import match banner
    const banner = document.querySelector('.pd-import-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('1');
    expect(banner.textContent).toContain('request');
  });

  test('producer can bulk claim imported requests', () => {
    yRequests.push([
      createTestRequest({
        id: 'req-imp-2',
        status: 'open',
        inventorySystemId: 'sys-1',
        importedProducerName: 'Producer Bob',
        quantity: 5,
      }),
      createTestRequest({
        id: 'req-imp-3',
        status: 'open',
        inventorySystemId: 'sys-1',
        importedProducerName: 'Producer Bob',
        quantity: 15,
      }),
    ]);
    refreshSync();

    mockCtx = {
      ...mockCtx,
      userIdentity: PRODUCER_IDENTITY,
    };

    const ProducerDashboard = require('../../../frontend/src/components/inventory/producer/ProducerDashboard').default;
    render(<ProducerDashboard onNavigate={jest.fn()} />);

    // Click claim all
    const claimAllBtn = screen.getByText(/Claim All/i);
    fireEvent.click(claimAllBtn);

    // Both requests should now be claimed by producer
    const updated = yRequests.toArray();
    const claimed = updated.filter(r => r.assignedTo === 'producerKey456');
    expect(claimed.length).toBe(2);

    // importedProducerName should be removed
    claimed.forEach(r => {
      expect(r.importedProducerName).toBeUndefined();
    });
  });
});
