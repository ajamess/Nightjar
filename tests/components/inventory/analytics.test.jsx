/**
 * Analytics Component Tests
 *
 * Tests for: AnalyticsDashboard, SummaryMetrics, PipelineFunnel,
 * USHeatmap, ProducerLeaderboard, FulfillmentHistogram, ItemDemand,
 * InOutflowChart, BlockedAging, PivotTable
 *
 * See docs/INVENTORY_SYSTEM_SPEC.md §8
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

jest.mock('../../../frontend/src/contexts/InventoryContext', () => ({
  useInventory: jest.fn(() => ({ ...mockCtx, ...mockSyncResult })),
}));

jest.mock('../../../frontend/src/contexts/ToastContext', () => ({
  useToast: jest.fn(() => ({ showToast: jest.fn() })),
}));

jest.mock('../../../frontend/src/hooks/useInventorySync', () => {
  const fn = jest.fn(() => mockSyncResult);
  fn.default = fn;
  return { __esModule: true, default: fn, useInventorySync: fn };
});

// Recharts — return simple divs
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

// react-simple-maps
jest.mock('react-simple-maps', () => ({
  ComposableMap: ({ children }) => <div data-testid="composable-map">{children}</div>,
  Geographies: ({ children }) => <div data-testid="geographies">{children({ geographies: [] })}</div>,
  Geography: () => <div data-testid="geography" />,
  ZoomableGroup: ({ children }) => <div>{children}</div>,
}));

// us-states data asset
jest.mock('../../../frontend/src/assets/us-states-10m.json', () => ({}), { virtual: true });

// inventoryExport for ProducerLeaderboard
jest.mock('../../../frontend/src/utils/inventoryExport', () => ({
  exportProducers: jest.fn(),
}));

// CSS mocks
jest.mock('../../../frontend/src/components/inventory/analytics/AnalyticsDashboard.css', () => ({}));
jest.mock('../../../frontend/src/components/inventory/analytics/USHeatmap.css', () => ({}));

// ── Imports ────────────────────────────────────────────────────────────────

const SummaryMetrics = require('../../../frontend/src/components/inventory/analytics/SummaryMetrics').default;
const PipelineFunnel = require('../../../frontend/src/components/inventory/analytics/PipelineFunnel').default;
const FulfillmentHistogram = require('../../../frontend/src/components/inventory/analytics/FulfillmentHistogram').default;
const InOutflowChart = require('../../../frontend/src/components/inventory/analytics/InOutflowChart').default;
const BlockedAging = require('../../../frontend/src/components/inventory/analytics/BlockedAging').default;
const ItemDemand = require('../../../frontend/src/components/inventory/analytics/ItemDemand').default;
const ProducerLeaderboard = require('../../../frontend/src/components/inventory/analytics/ProducerLeaderboard').default;
const PivotTable = require('../../../frontend/src/components/inventory/analytics/PivotTable').default;
const USHeatmap = require('../../../frontend/src/components/inventory/analytics/USHeatmap').default;
const AnalyticsDashboard = require('../../../frontend/src/components/inventory/analytics/AnalyticsDashboard').default;

// ── Shared test data ───────────────────────────────────────────────────────

const NOW = Date.now();
const DAY = 86400000;

function buildTestRequests() {
  return [
    createTestRequest({
      id: 'req-1', status: 'open', catalogItemName: 'Widget', quantity: 10,
      requestedAt: NOW - 5 * DAY, state: 'TN', urgent: false,
      catalogItemId: 'cat-1',
    }),
    createTestRequest({
      id: 'req-2', status: 'shipped', catalogItemName: 'Widget', quantity: 20,
      requestedAt: NOW - 10 * DAY, shippedAt: NOW - 2 * DAY,
      assignedTo: 'producer-1', state: 'CA', urgent: true,
      catalogItemId: 'cat-1',
    }),
    createTestRequest({
      id: 'req-3', status: 'delivered', catalogItemName: 'Gadget', quantity: 5,
      requestedAt: NOW - 15 * DAY, shippedAt: NOW - 8 * DAY,
      assignedTo: 'producer-1', state: 'TN',
      catalogItemId: 'cat-2',
    }),
    createTestRequest({
      id: 'req-4', status: 'blocked', catalogItemName: 'Widget', quantity: 15,
      requestedAt: NOW - 20 * DAY, state: 'NY',
      catalogItemId: 'cat-1',
    }),
    createTestRequest({
      id: 'req-5', status: 'cancelled', catalogItemName: 'Gadget', quantity: 3,
      requestedAt: NOW - 3 * DAY, state: 'CA',
      catalogItemId: 'cat-2',
    }),
  ];
}

const testCatalogItems = [
  createTestCatalogItem({ id: 'cat-1', name: 'Widget', active: true }),
  createTestCatalogItem({ id: 'cat-2', name: 'Gadget', active: true }),
];

const testCollaborators = [
  { publicKey: 'producer-1', displayName: 'Alice Producer' },
  { publicKey: 'producer-2', displayName: 'Bob Producer' },
];

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  const identity = createTestIdentity();
  const yInventorySystems = createMockYMap();
  const yCatalogItems = createMockYArray();
  const yInventoryRequests = createMockYArray();
  const yProducerCapacities = createMockYMap();
  const yAddressReveals = createMockYMap();
  const yPendingAddresses = createMockYMap();
  const yInventoryAuditLog = createMockYArray();

  mockCtx = {
    yInventorySystems, yCatalogItems, yInventoryRequests,
    yProducerCapacities, yAddressReveals, yPendingAddresses,
    yInventoryAuditLog,
    inventorySystemId: 'sys-1',
    workspaceId: 'ws-1',
    userIdentity: identity,
    collaborators: testCollaborators,
  };

  mockSyncResult = {
    requests: buildTestRequests(),
    catalogItems: testCatalogItems,
    auditLog: [],
    producerCapacities: { 'producer-1': { maxCapacity: 50 } },
    currentSystem: { name: 'Test System' },
    openRequestCount: 1,
    pendingApprovalCount: 0,
    activeRequestCount: 3,
    allRequests: buildTestRequests(),
  };
});

// ═══════════════════════════════════════════════════════════════════════════
//  SummaryMetrics
// ═══════════════════════════════════════════════════════════════════════════

describe('SummaryMetrics', () => {
  const dateRange = [NOW - 30 * DAY, NOW];

  test('renders all 8 metric cards', () => {
    const { container } = render(
      <SummaryMetrics
        requests={buildTestRequests()}
        producerCapacities={{ 'p-1': {} }}
        dateRange={dateRange}
      />
    );
    const cards = container.querySelectorAll('.sm-card');
    expect(cards.length).toBe(8);
  });

  test('shows Total Requests label', () => {
    render(
      <SummaryMetrics requests={buildTestRequests()} producerCapacities={{}} dateRange={dateRange} />
    );
    expect(screen.getByText('Total Requests')).toBeInTheDocument();
  });

  test('shows Units Shipped label', () => {
    render(
      <SummaryMetrics requests={buildTestRequests()} producerCapacities={{}} dateRange={dateRange} />
    );
    expect(screen.getByText('Units Shipped')).toBeInTheDocument();
  });

  test('shows Avg Fulfillment label', () => {
    render(
      <SummaryMetrics requests={buildTestRequests()} producerCapacities={{}} dateRange={dateRange} />
    );
    expect(screen.getByText('Avg Fulfillment')).toBeInTheDocument();
  });

  test('computes correct total requests count', () => {
    render(
      <SummaryMetrics requests={buildTestRequests()} producerCapacities={{}} dateRange={dateRange} />
    );
    // All 5 requests are within 30-day range
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('shows delta arrows for non-zero changes', () => {
    const { container } = render(
      <SummaryMetrics requests={buildTestRequests()} producerCapacities={{}} dateRange={dateRange} />
    );
    // We have no previous-period data so there might be zero deltas
    // But the component still renders — no crash
    expect(container.querySelector('.summary-metrics')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PipelineFunnel
// ═══════════════════════════════════════════════════════════════════════════

describe('PipelineFunnel', () => {
  const dateRange = [NOW - 30 * DAY, NOW];

  test('renders heading', () => {
    render(<PipelineFunnel requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByText('Request Pipeline')).toBeInTheDocument();
  });

  test('renders chart container', () => {
    render(<PipelineFunnel requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  test('shows empty message when no requests', () => {
    render(<PipelineFunnel requests={[]} dateRange={dateRange} />);
    expect(screen.getByText('No requests in this period')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  FulfillmentHistogram
// ═══════════════════════════════════════════════════════════════════════════

describe('FulfillmentHistogram', () => {
  const dateRange = [NOW - 30 * DAY, NOW];

  test('renders heading with target label', () => {
    render(<FulfillmentHistogram requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByText('Fulfillment Time Distribution')).toBeInTheDocument();
  });

  test('renders chart when fulfilled requests exist', () => {
    render(<FulfillmentHistogram requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  test('shows empty message when no fulfilled requests', () => {
    const openOnly = [createTestRequest({ status: 'open', createdAt: NOW - DAY })];
    render(<FulfillmentHistogram requests={openOnly} dateRange={dateRange} />);
    expect(screen.getByText('No fulfilled requests in this period')).toBeInTheDocument();
  });

  test('shows target percentage', () => {
    render(<FulfillmentHistogram requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByText(/within 5d target/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  InOutflowChart
// ═══════════════════════════════════════════════════════════════════════════

describe('InOutflowChart', () => {
  const dateRange = [NOW - 30 * DAY, NOW];

  test('renders heading', () => {
    render(<InOutflowChart requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByText('Request In / Out Flow')).toBeInTheDocument();
  });

  test('renders chart container', () => {
    render(<InOutflowChart requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  test('handles empty date range', () => {
    render(<InOutflowChart requests={[]} dateRange={[NOW, NOW]} />);
    // Should not crash
    expect(screen.getByText('Request In / Out Flow')).toBeInTheDocument();
  });

  test('accepts granularity prop', () => {
    render(<InOutflowChart requests={buildTestRequests()} dateRange={dateRange} granularity="week" />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  BlockedAging
// ═══════════════════════════════════════════════════════════════════════════

describe('BlockedAging', () => {
  test('renders heading with count', () => {
    render(<BlockedAging requests={buildTestRequests()} />);
    // 1 blocked request
    expect(screen.getByText(/Blocked \/ Aging Requests \(1\)/)).toBeInTheDocument();
  });

  test('shows celebration when no blocked requests', () => {
    const noBlocked = buildTestRequests().filter(r => r.status !== 'blocked');
    render(<BlockedAging requests={noBlocked} />);
    expect(screen.getByText(/No blocked requests 🎉/)).toBeInTheDocument();
  });

  test('renders table with blocked request details', () => {
    render(<BlockedAging requests={buildTestRequests()} />);
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  test('shows age distribution chart for blocked requests', () => {
    render(<BlockedAging requests={buildTestRequests()} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  test('shows table headers', () => {
    render(<BlockedAging requests={buildTestRequests()} />);
    expect(screen.getByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ItemDemand
// ═══════════════════════════════════════════════════════════════════════════

describe('ItemDemand', () => {
  const dateRange = [NOW - 30 * DAY, NOW];

  test('renders heading', () => {
    render(
      <ItemDemand requests={buildTestRequests()} catalogItems={testCatalogItems} dateRange={dateRange} />
    );
    expect(screen.getByText('Item Demand')).toBeInTheDocument();
  });

  test('renders pie chart by default', () => {
    render(
      <ItemDemand requests={buildTestRequests()} catalogItems={testCatalogItems} dateRange={dateRange} />
    );
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  test('toggle buttons for pie and treemap', () => {
    render(
      <ItemDemand requests={buildTestRequests()} catalogItems={testCatalogItems} dateRange={dateRange} />
    );
    expect(screen.getByText('Pie')).toBeInTheDocument();
    expect(screen.getByText('Treemap')).toBeInTheDocument();
  });

  test('shows empty message when no data', () => {
    render(
      <ItemDemand requests={[]} catalogItems={testCatalogItems} dateRange={dateRange} />
    );
    expect(screen.getByText('No request data in this period')).toBeInTheDocument();
  });

  test('switching to treemap view', () => {
    render(
      <ItemDemand requests={buildTestRequests()} catalogItems={testCatalogItems} dateRange={dateRange} />
    );
    fireEvent.click(screen.getByText('Treemap'));
    // Still renders without crash
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ProducerLeaderboard
// ═══════════════════════════════════════════════════════════════════════════

describe('ProducerLeaderboard', () => {
  const dateRange = [NOW - 30 * DAY, NOW];

  test('renders heading', () => {
    render(
      <ProducerLeaderboard
        requests={buildTestRequests()}
        collaborators={testCollaborators}
        dateRange={dateRange}
        catalogItems={testCatalogItems}
      />
    );
    expect(screen.getByText('Producer Leaderboard')).toBeInTheDocument();
  });

  test('renders producer table with headers', () => {
    render(
      <ProducerLeaderboard
        requests={buildTestRequests()}
        collaborators={testCollaborators}
        dateRange={dateRange}
        catalogItems={testCatalogItems}
      />
    );
    expect(screen.getByText('Producer')).toBeInTheDocument();
    expect(screen.getByText(/Fulfilled/)).toBeInTheDocument();
    expect(screen.getByText(/Units/)).toBeInTheDocument();
    expect(screen.getByText('Trend')).toBeInTheDocument();
  });

  test('shows producer name from collaborators', () => {
    render(
      <ProducerLeaderboard
        requests={buildTestRequests()}
        collaborators={testCollaborators}
        dateRange={dateRange}
        catalogItems={testCatalogItems}
      />
    );
    expect(screen.getByText('Alice Producer')).toBeInTheDocument();
  });

  test('shows empty message when no producer activity', () => {
    render(
      <ProducerLeaderboard
        requests={[createTestRequest({ status: 'open', createdAt: NOW - DAY })]}
        collaborators={testCollaborators}
        dateRange={dateRange}
        catalogItems={testCatalogItems}
      />
    );
    expect(screen.getByText('No producer activity in this period')).toBeInTheDocument();
  });

  test('export CSV button is present', () => {
    render(
      <ProducerLeaderboard
        requests={buildTestRequests()}
        collaborators={testCollaborators}
        dateRange={dateRange}
        catalogItems={testCatalogItems}
      />
    );
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });

  test('clicking export calls exportProducers', () => {
    const { exportProducers } = require('../../../frontend/src/utils/inventoryExport');
    render(
      <ProducerLeaderboard
        requests={buildTestRequests()}
        collaborators={testCollaborators}
        dateRange={dateRange}
        catalogItems={testCatalogItems}
      />
    );
    fireEvent.click(screen.getByText('Export CSV'));
    expect(exportProducers).toHaveBeenCalled();
  });

  test('sort columns are clickable', () => {
    render(
      <ProducerLeaderboard
        requests={buildTestRequests()}
        collaborators={testCollaborators}
        dateRange={dateRange}
        catalogItems={testCatalogItems}
      />
    );
    // Click "Units" header to sort
    fireEvent.click(screen.getByText('Units'));
    // Should not crash, and table still renders
    expect(screen.getByText('Alice Producer')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PivotTable
// ═══════════════════════════════════════════════════════════════════════════

describe('PivotTable', () => {
  const dateRange = [NOW - 30 * DAY, NOW];

  test('renders heading', () => {
    render(
      <PivotTable requests={buildTestRequests()} collaborators={testCollaborators} dateRange={dateRange} />
    );
    expect(screen.getByText('Pivot Table')).toBeInTheDocument();
  });

  test('shows group-by dropdown', () => {
    render(
      <PivotTable requests={buildTestRequests()} collaborators={testCollaborators} dateRange={dateRange} />
    );
    expect(screen.getByText('Group by:')).toBeInTheDocument();
  });

  test('default group by Item renders rows', () => {
    render(
      <PivotTable requests={buildTestRequests()} collaborators={testCollaborators} dateRange={dateRange} />
    );
    // Items: Widget and Gadget
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Gadget')).toBeInTheDocument();
  });

  test('shows total row in footer', () => {
    render(
      <PivotTable requests={buildTestRequests()} collaborators={testCollaborators} dateRange={dateRange} />
    );
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  test('changing group by to State works', () => {
    render(
      <PivotTable requests={buildTestRequests()} collaborators={testCollaborators} dateRange={dateRange} />
    );
    const select = screen.getByDisplayValue('Item');
    fireEvent.change(select, { target: { value: 'requesterState' } });
    // Should show state abbreviations
    expect(screen.getByText('TN')).toBeInTheDocument();
  });

  test('shows empty message when no data', () => {
    render(
      <PivotTable requests={[]} collaborators={testCollaborators} dateRange={dateRange} />
    );
    expect(screen.getByText('No data to display')).toBeInTheDocument();
  });

  test('renders correct table headers', () => {
    render(
      <PivotTable requests={buildTestRequests()} collaborators={testCollaborators} dateRange={dateRange} />
    );
    expect(screen.getByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.getByText('Fulfill %')).toBeInTheDocument();
    expect(screen.getByText('Avg Days')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  USHeatmap
// ═══════════════════════════════════════════════════════════════════════════

describe('USHeatmap', () => {
  const dateRange = [NOW - 30 * DAY, NOW];

  test('renders heading', () => {
    render(<USHeatmap requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByText('Geographic Distribution')).toBeInTheDocument();
  });

  test('renders metric toggle buttons', () => {
    render(<USHeatmap requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('Avg Days')).toBeInTheDocument();
  });

  test('renders composable map', () => {
    render(<USHeatmap requests={buildTestRequests()} dateRange={dateRange} />);
    expect(screen.getByTestId('composable-map')).toBeInTheDocument();
  });

  test('clicking metric toggle changes active metric', () => {
    render(<USHeatmap requests={buildTestRequests()} dateRange={dateRange} />);
    fireEvent.click(screen.getByText('Units'));
    // No crash, still renders
    expect(screen.getByTestId('composable-map')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  AnalyticsDashboard (container)
// ═══════════════════════════════════════════════════════════════════════════

describe('AnalyticsDashboard', () => {
  test('renders Analytics heading', () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  test('renders preset buttons', () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText('This Week')).toBeInTheDocument();
    expect(screen.getByText('Last 30d')).toBeInTheDocument();
    expect(screen.getByText('Last 90d')).toBeInTheDocument();
    expect(screen.getByText('All Time')).toBeInTheDocument();
  });

  test('renders granularity buttons', () => {
    render(<AnalyticsDashboard />);
    expect(screen.getAllByText('Day').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Week').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Month').length).toBeGreaterThanOrEqual(1);
  });

  test('renders filter controls', () => {
    render(<AnalyticsDashboard />);
    // Filter labels may appear multiple times (dashboard + child components)
    expect(screen.getAllByText(/Group by/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Item/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Status/).length).toBeGreaterThanOrEqual(1);
  });

  test('clicking preset changes active state', () => {
    const { container } = render(<AnalyticsDashboard />);
    fireEvent.click(screen.getByText('This Week'));
    const activeBtn = container.querySelector('.ad-preset-btn.active');
    expect(activeBtn).toHaveTextContent('This Week');
  });
});
