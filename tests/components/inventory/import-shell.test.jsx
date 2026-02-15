/**
 * Import & Shell Component Tests
 *
 * Tests for: ImportWizard, FileUpload, ColumnMapper, ImportPreview,
 *            InventoryDashboard, InventoryNavRail, OnboardingWizard
 *
 * See docs/INVENTORY_SYSTEM_SPEC.md §9, §6.8, §4.1
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  createMockYArray,
  createMockYMap,
  createTestRequest,
  createTestCatalogItem,
  createTestIdentity,
} from '../../helpers/inventory-test-utils';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockCtx;
let mockSyncResult;
let mockShowToast;

jest.mock('../../../frontend/src/contexts/InventoryContext', () => ({
  InventoryProvider: ({ children }) => <div data-testid="inv-provider">{children}</div>,
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
  validateCatalogItem: jest.fn(() => ({ valid: true, errors: [] })),
  validateQuantity: jest.fn(() => ({ valid: true })),
  validateAddress: jest.fn(() => ({ valid: true, errors: [] })),
  generateId: jest.fn(() => 'gen-' + Math.random().toString(36).slice(2, 8)),
  US_STATES: ['AL', 'AK', 'TN', 'CA'],
  formatDate: jest.fn((d) => new Date(d).toLocaleDateString()),
  formatRelativeDate: jest.fn(() => '2 days ago'),
}));

jest.mock('../../../frontend/src/utils/importParser', () => ({
  parseFile: jest.fn(),
  validateRow: jest.fn(() => ({
    valid: true,
    errors: [],
    warnings: [],
    mapped: { item: 'Widget', quantity: 10, status: 'open' },
  })),
}));

jest.mock('../../../frontend/src/utils/importMapper', () => ({
  autoMapColumns: jest.fn(() => ({
    'Item': { target: 'item', confidence: 100 },
    'Qty': { target: 'quantity', confidence: 80 },
  })),
  TARGET_FIELDS: ['item', 'quantity', 'status', 'urgency', 'requester_name', 'requester_state'],
  REQUIRED_FIELDS: ['item', 'quantity'],
  inferStatus: jest.fn((s) => s || 'open'),
  inferUrgency: jest.fn((u) => u || 'normal'),
}));

// Recharts
jest.mock('recharts', () => {
  const make = (name) => (props) => <div data-testid={name}>{props.children}</div>;
  return {
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
    LineChart: make('line-chart'),
    ComposedChart: make('composed-chart'),
    BarChart: make('bar-chart'),
    PieChart: make('pie-chart'),
    Line: make('line'),
    Area: make('area'),
    Bar: make('bar'),
    XAxis: make('x-axis'),
    YAxis: make('y-axis'),
    CartesianGrid: make('cartesian-grid'),
    Tooltip: make('tooltip'),
    Legend: make('legend'),
    ReferenceLine: make('reference-line'),
    Cell: make('cell'),
    Pie: make('pie'),
    Treemap: make('treemap'),
  };
});

jest.mock('react-simple-maps', () => ({
  ComposableMap: ({ children }) => <div data-testid="composable-map">{children}</div>,
  Geographies: ({ children }) => <div data-testid="geographies">{children({ geographies: [] })}</div>,
  Geography: () => <div data-testid="geography" />,
  ZoomableGroup: ({ children }) => <div>{children}</div>,
}));

jest.mock('../../../frontend/src/assets/us-states-10m.json', () => ({}), { virtual: true });

// Mock all child components for shell tests to isolate shell behavior
jest.mock('../../../frontend/src/components/inventory/admin/AdminDashboard', () =>
  function MockAdminDashboard() { return <div data-testid="admin-dashboard">Admin Dashboard</div>; });
jest.mock('../../../frontend/src/components/inventory/admin/AllRequests', () =>
  function MockAllRequests() { return <div data-testid="all-requests">All Requests</div>; });
jest.mock('../../../frontend/src/components/inventory/admin/CatalogManager', () =>
  function MockCatalog() { return <div data-testid="catalog">Catalog</div>; });
jest.mock('../../../frontend/src/components/inventory/admin/ApprovalQueue', () =>
  function MockApproval() { return <div data-testid="approval">Approval</div>; });
jest.mock('../../../frontend/src/components/inventory/admin/InventorySettings', () =>
  function MockSettings() { return <div data-testid="settings">Settings</div>; });
jest.mock('../../../frontend/src/components/inventory/admin/AuditLog', () =>
  function MockAudit() { return <div data-testid="audit">Audit</div>; });
jest.mock('../../../frontend/src/components/inventory/admin/ProducerManagement', () =>
  function MockProducerMgmt() { return <div data-testid="producer-mgmt">Producers</div>; });
jest.mock('../../../frontend/src/components/inventory/requestor/SubmitRequest', () =>
  function MockSubmit() { return <div data-testid="submit-request">Submit</div>; });
jest.mock('../../../frontend/src/components/inventory/requestor/MyRequests', () =>
  function MockMyReqs() { return <div data-testid="my-requests">My Requests</div>; });
jest.mock('../../../frontend/src/components/inventory/requestor/RequestFAQ', () =>
  function MockFAQ() { return <div data-testid="faq">FAQ</div>; });
jest.mock('../../../frontend/src/components/inventory/producer/ProducerDashboard', () =>
  function MockProdDash() { return <div data-testid="producer-dashboard">Producer Dashboard</div>; });
jest.mock('../../../frontend/src/components/inventory/producer/OpenRequests', () =>
  function MockOpenReqs() { return <div data-testid="open-requests">Open Requests</div>; });
jest.mock('../../../frontend/src/components/inventory/producer/MyRequests', () =>
  function MockProdMyReqs() { return <div data-testid="producer-my-requests">Producer My Requests</div>; });
jest.mock('../../../frontend/src/components/inventory/producer/ProducerStats', () =>
  function MockProdStats() { return <div data-testid="producer-stats">Producer Stats</div>; });
jest.mock('../../../frontend/src/components/inventory/analytics/AnalyticsDashboard', () =>
  function MockAnalytics() { return <div data-testid="analytics">Analytics</div>; });
jest.mock('../../../frontend/src/components/inventory/analytics/USHeatmap', () =>
  function MockHeatmap() { return <div data-testid="heatmap">Heatmap</div>; });
jest.mock('../../../frontend/src/components/inventory/import/ImportWizard', () =>
  function MockImportWiz() { return <div data-testid="import-wizard">Import</div>; });
jest.mock('../../../frontend/src/components/inventory/OnboardingWizard', () =>
  function MockOnboard() { return <div data-testid="onboarding">Onboarding</div>; });

// CSS mocks
jest.mock('../../../frontend/src/components/inventory/import/ImportWizard.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/InventoryDashboard.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/InventoryNavRail.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/OnboardingWizard.css', () => ({}));

// ── Imports ────────────────────────────────────────────────────────────────

// FileUpload is not mocked so we can test it directly
jest.unmock('../../../frontend/src/components/inventory/import/ImportWizard');
const FileUpload = require('../../../frontend/src/components/inventory/import/FileUpload').default;

// ColumnMapper
const ColumnMapper = require('../../../frontend/src/components/inventory/import/ColumnMapper').default;

// ImportPreview
const ImportPreview = require('../../../frontend/src/components/inventory/import/ImportPreview').default;

// InventoryNavRail — unmock so we test the real component
jest.unmock('../../../frontend/src/components/inventory/InventoryNavRail');
const InventoryNavRail = require('../../../frontend/src/components/inventory/InventoryNavRail').default;

// OnboardingWizard — unmock so we test the real component
jest.unmock('../../../frontend/src/components/inventory/OnboardingWizard');
const OnboardingWizard = require('../../../frontend/src/components/inventory/OnboardingWizard').default;

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockShowToast = jest.fn();

  const identity = createTestIdentity();
  const yInventorySystems = createMockYMap();
  const yCatalogItems = createMockYArray();
  const yInventoryRequests = createMockYArray();
  const yProducerCapacities = createMockYMap();
  const yAddressReveals = createMockYMap();
  const yPendingAddresses = createMockYMap();
  const yInventoryAuditLog = createMockYArray();

  yInventoryRequests.doc = { transact: (fn) => fn() };

  mockCtx = {
    yInventorySystems, yCatalogItems, yInventoryRequests,
    yProducerCapacities, yAddressReveals, yPendingAddresses,
    yInventoryAuditLog,
    inventorySystemId: 'sys-1',
    workspaceId: 'ws-1',
    userIdentity: identity,
    collaborators: [
      { publicKey: 'c-1', displayName: 'Alice', permission: 'owner' },
    ],
  };

  mockSyncResult = {
    requests: [createTestRequest({ id: 'r-1' })],
    catalogItems: [createTestCatalogItem({ id: 'cat-1', name: 'Widget' })],
    auditLog: [],
    producerCapacities: {},
    currentSystem: { name: 'Test System', onboardingComplete: true },
    openRequestCount: 1,
    pendingApprovalCount: 0,
    activeRequestCount: 1,
    allRequests: [],
  };
});

// ═══════════════════════════════════════════════════════════════════════════
//  FileUpload
// ═══════════════════════════════════════════════════════════════════════════

describe('FileUpload', () => {
  test('renders dropzone text', () => {
    render(<FileUpload onFileLoaded={jest.fn()} />);
    expect(screen.getByText(/Drag & drop files here/)).toBeInTheDocument();
  });

  test('renders file format hint', () => {
    render(<FileUpload onFileLoaded={jest.fn()} />);
    expect(screen.getByText(/CSV, XLSX, or XLS/)).toBeInTheDocument();
  });

  test('renders file input (hidden)', () => {
    const { container } = render(<FileUpload onFileLoaded={jest.fn()} />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input.style.display).toBe('none');
  });

  test('accepts correct file types', () => {
    const { container } = render(<FileUpload onFileLoaded={jest.fn()} />);
    const input = container.querySelector('input[type="file"]');
    expect(input.accept).toBe('.csv,.xlsx,.xls');
  });

  test('dropzone has drag-over class when dragging', () => {
    const { container } = render(<FileUpload onFileLoaded={jest.fn()} />);
    const dropzone = container.querySelector('.fu-dropzone');
    fireEvent.dragOver(dropzone, { preventDefault: jest.fn() });
    expect(dropzone).toHaveClass('drag-over');
  });

  test('drag-over class removed on drag leave', () => {
    const { container } = render(<FileUpload onFileLoaded={jest.fn()} />);
    const dropzone = container.querySelector('.fu-dropzone');
    fireEvent.dragOver(dropzone, { preventDefault: jest.fn() });
    expect(dropzone).toHaveClass('drag-over');
    fireEvent.dragLeave(dropzone);
    expect(dropzone).not.toHaveClass('drag-over');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ColumnMapper
// ═══════════════════════════════════════════════════════════════════════════

describe('ColumnMapper', () => {
  const headers = ['Item', 'Qty', 'Status'];
  const sampleRows = [{ Item: 'Widget', Qty: '10', Status: 'open' }];

  test('renders description text', () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={jest.fn()}
        catalogItems={[]}
      />
    );
    expect(screen.getByText(/Map your file columns/)).toBeInTheDocument();
  });

  test('renders all source columns', () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={jest.fn()}
        catalogItems={[]}
      />
    );
    expect(screen.getByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  test('shows table headers', () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={jest.fn()}
        catalogItems={[]}
      />
    );
    expect(screen.getByText('Source Column')).toBeInTheDocument();
    expect(screen.getByText('Sample Value')).toBeInTheDocument();
    expect(screen.getByText('Maps To')).toBeInTheDocument();
    expect(screen.getByText('Confidence')).toBeInTheDocument();
  });

  test('shows sample values from first row', () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={jest.fn()}
        catalogItems={[]}
      />
    );
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  test('continue button calls onMappingComplete', () => {
    const onComplete = jest.fn();
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={onComplete}
        catalogItems={[]}
      />
    );
    fireEvent.click(screen.getByText('Continue to Preview →'));
    expect(onComplete).toHaveBeenCalled();
  });

  test('shows default status dropdown', () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onMappingComplete={jest.fn()}
        catalogItems={[]}
      />
    );
    expect(screen.getByText('Default status for imported requests:')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ImportPreview
// ═══════════════════════════════════════════════════════════════════════════

describe('ImportPreview', () => {
  const rows = [
    { item: 'Widget', quantity: 10 },
    { item: 'Gadget', quantity: 5 },
  ];
  const mapping = { item: 'item', quantity: 'quantity', __defaultStatus: 'open' };
  const catalogItems = [createTestCatalogItem({ id: 'cat-1', name: 'Widget' })];

  test('renders validation summary', () => {
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={catalogItems}
        onConfirm={jest.fn()}
        onBack={jest.fn()}
      />
    );
    expect(screen.getByText('Total Rows')).toBeInTheDocument();
    expect(screen.getByText('✅ Valid')).toBeInTheDocument();
  });

  test('shows total row count', () => {
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={catalogItems}
        onConfirm={jest.fn()}
        onBack={jest.fn()}
      />
    );
    // '2' appears in both 'Total Rows' and 'Valid' cards
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  test('shows back button', () => {
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={catalogItems}
        onConfirm={jest.fn()}
        onBack={jest.fn()}
      />
    );
    expect(screen.getByText('← Back to Mapping')).toBeInTheDocument();
  });

  test('back button calls onBack', () => {
    const onBack = jest.fn();
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={catalogItems}
        onConfirm={jest.fn()}
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByText('← Back to Mapping'));
    expect(onBack).toHaveBeenCalled();
  });

  test('import button calls onConfirm', () => {
    const onConfirm = jest.fn();
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={catalogItems}
        onConfirm={onConfirm}
        onBack={jest.fn()}
      />
    );
    const importBtn = screen.getByText(/Import \d+ rows →/);
    fireEvent.click(importBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  test('skip errors checkbox present', () => {
    render(
      <ImportPreview
        rows={rows}
        mapping={mapping}
        catalogItems={catalogItems}
        onConfirm={jest.fn()}
        onBack={jest.fn()}
      />
    );
    expect(screen.getByText('Skip rows with errors')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  InventoryNavRail
// ═══════════════════════════════════════════════════════════════════════════

describe('InventoryNavRail', () => {
  const baseProps = {
    activeView: 'admin-dashboard',
    onNavigate: jest.fn(),
    isOwner: true,
    isEditor: false,
    isViewer: false,
    systemName: 'Test System',
    openRequestCount: 3,
    pendingApprovalCount: 2,
  };

  test('renders system name', () => {
    render(<InventoryNavRail {...baseProps} />);
    expect(screen.getByText('Test System')).toBeInTheDocument();
  });

  test('renders 📦 icon', () => {
    render(<InventoryNavRail {...baseProps} />);
    expect(screen.getAllByText(/📦/).length).toBeGreaterThanOrEqual(1);
  });

  test('renders admin nav items for owner', () => {
    render(<InventoryNavRail {...baseProps} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('All Requests')).toBeInTheDocument();
    expect(screen.getByText('Approval Queue')).toBeInTheDocument();
    expect(screen.getByText('Producers')).toBeInTheDocument();
    expect(screen.getByText('Item Catalog')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Import/Export')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('shows owner personal views section', () => {
    render(<InventoryNavRail {...baseProps} />);
    expect(screen.getByText('My Views')).toBeInTheDocument();
    expect(screen.getByText('Submit Request')).toBeInTheDocument();
    expect(screen.getByText('My Requests')).toBeInTheDocument();
    expect(screen.getByText('My Capacity')).toBeInTheDocument();
  });

  test('shows producer nav for editor', () => {
    render(<InventoryNavRail {...baseProps} isOwner={false} isEditor={true} />);
    expect(screen.getByText('My Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Open Requests')).toBeInTheDocument();
    expect(screen.queryByText('All Requests')).not.toBeInTheDocument();
  });

  test('shows requestor nav for viewer', () => {
    render(<InventoryNavRail {...baseProps} isOwner={false} isViewer={true} />);
    expect(screen.getByText('Submit Request')).toBeInTheDocument();
    expect(screen.getByText('FAQ')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  test('shows badge for pendingApprovalCount', () => {
    render(<InventoryNavRail {...baseProps} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('clicking nav item calls onNavigate', () => {
    const onNavigate = jest.fn();
    render(<InventoryNavRail {...baseProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('All Requests'));
    expect(onNavigate).toHaveBeenCalledWith('all-requests');
  });

  test('active view has aria-current="page"', () => {
    render(<InventoryNavRail {...baseProps} />);
    const dashBtn = screen.getByText('Dashboard').closest('button');
    expect(dashBtn).toHaveAttribute('aria-current', 'page');
  });

  test('badges show 99+ for large counts', () => {
    render(<InventoryNavRail {...baseProps} pendingApprovalCount={150} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  OnboardingWizard
// ═══════════════════════════════════════════════════════════════════════════

describe('OnboardingWizard', () => {
  test('renders step 1: Name & Configure', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    // 'Name & Configure' appears in both step indicator and content heading
    expect(screen.getAllByText('Name & Configure').length).toBeGreaterThanOrEqual(1);
  });

  test('shows system name input', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    expect(screen.getByPlaceholderText('e.g., Toy Distribution')).toBeInTheDocument();
  });

  test('shows icon picker', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    expect(screen.getByText('Choose Icon')).toBeInTheDocument();
    expect(screen.getByText('🧸')).toBeInTheDocument();
  });

  test('shows workflow toggles', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    expect(screen.getByText('Require Admin Approval')).toBeInTheDocument();
    expect(screen.getByText('Enable Auto-Assignment')).toBeInTheDocument();
  });

  test('Next button present on step 1', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  test('clicking Next without name shows toast error', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    fireEvent.click(screen.getByText('Next →'));
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('name'),
      'error'
    );
  });

  test('step indicators show all 4 steps', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    // Step names appear in both indicator bar and content headings
    expect(screen.getAllByText('Name & Configure').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Define Item Catalog').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Invite Participants').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Import Data (optional)').length).toBeGreaterThanOrEqual(1);
  });

  test('advancing to step 2 after naming', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    const input = screen.getByPlaceholderText('e.g., Toy Distribution');
    fireEvent.change(input, { target: { value: 'My System' } });
    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('Add Your First Catalog Item')).toBeInTheDocument();
  });

  test('step 2 has skip button', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    const input = screen.getByPlaceholderText('e.g., Toy Distribution');
    fireEvent.change(input, { target: { value: 'My System' } });
    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('Skip for now')).toBeInTheDocument();
  });

  test('skipping step 2 goes to step 3', () => {
    render(<OnboardingWizard onComplete={jest.fn()} />);
    const input = screen.getByPlaceholderText('e.g., Toy Distribution');
    fireEvent.change(input, { target: { value: 'My System' } });
    fireEvent.click(screen.getByText('Next →'));
    fireEvent.click(screen.getByText('Skip for now'));
    // 'Invite Participants' appears in both step indicator and heading
    expect(screen.getAllByText('Invite Participants').length).toBeGreaterThanOrEqual(1);
    // Has emoji prefix in component: 👥 Producers (Editors)
    expect(screen.getByText(/Producers \(Editors\)/)).toBeInTheDocument();
  });
});
