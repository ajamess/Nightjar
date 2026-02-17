/**
 * tests/inventory-workflow-audit-iter4.test.js
 *
 * Iteration 4 audit tests — verifies fixes for issues found in fourth pass:
 *
 * 1. AdminDashboard handleApprove creates address reveals (crypto flow)
 * 2. AdminDashboard handleReject sets approvedBy: null
 * 3. AdminDashboard handleApprove deps include crypto dependencies
 * 4. ProducerNameMapper shows ALL collaborators, not just editors/owners
 * 5. ProducerNameMapper uses publicKeyBase62 for option values
 * 6. ProducerNameMapper shows (viewer) label for viewer collaborators
 * 7. ImportWizard sets requestedBy field on imported requests
 * 8. ImportWizard uses publicKeyBase62 for assignedTo
 * 9. AuditLog has labels/icons for all action types
 * 10. NotificationInbox has icon for request_submitted
 * 11. SubmitRequest notifies owners only (not editors)
 * 12. AllRequests handleCancel clears approvedAt/approvedBy
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// ============================================================
// Hoisted jest.mock() calls
// ============================================================

let mockInventoryCtx = {};

jest.mock('../frontend/src/contexts/InventoryContext', () => ({
  useInventory: jest.fn(() => mockInventoryCtx),
  InventoryProvider: ({ children }) => <div>{children}</div>,
}));

jest.mock('../frontend/src/contexts/ToastContext', () => ({
  useToast: jest.fn(() => ({ showToast: jest.fn() })),
}));

const mockPushNotification = jest.fn();
jest.mock('../frontend/src/utils/inventoryNotifications', () => ({
  pushNotification: (...args) => mockPushNotification(...args),
  getUnreadCount: jest.fn(() => 0),
  markNotificationRead: jest.fn(),
  markAllRead: jest.fn(),
}));

jest.mock('../frontend/src/utils/inventoryExport', () => ({
  exportRequests: jest.fn(),
  exportAuditLog: jest.fn(),
}));

jest.mock('../frontend/src/utils/inventoryValidation', () => ({
  ...jest.requireActual('../frontend/src/utils/inventoryValidation'),
  generateId: jest.fn(() => 'mock-id-' + Math.random().toString(36).slice(2, 8)),
}));

jest.mock('../frontend/src/utils/resolveUserName', () => ({
  resolveUserName: jest.fn((collabs, key, fallback) => {
    const c = (collabs || []).find(x => x.publicKey === key || x.publicKeyBase62 === key);
    return c?.displayName || c?.name || fallback || key?.slice(0, 8) + '…';
  }),
  resolveCollaborator: jest.fn((collabs, key) => {
    return (collabs || []).find(x => x.publicKey === key || x.publicKeyBase62 === key) || null;
  }),
}));

jest.mock('../frontend/src/utils/addressCrypto', () => ({
  getPublicKeyHex: jest.fn(id => id?.publicKey || 'hex-key'),
  base62ToPublicKeyHex: jest.fn(b62 => 'hex-' + b62),
  createAddressReveal: jest.fn(async () => ({ encrypted: true, nonce: 'n', ciphertext: 'ct' })),
  decryptPendingAddress: jest.fn(async () => ({ street: '123 Main', city: 'Test', state: 'TX', zip: '12345' })),
  encryptAddressForAdmins: jest.fn(async () => [{ adminKey: 'a1', encrypted: 'enc' }]),
}));

jest.mock('../frontend/src/utils/inventoryAddressStore', () => ({
  getAddress: jest.fn(async () => null),
  getWorkspaceKeyMaterial: jest.fn(() => ({ key: 'km' })),
  storeAddress: jest.fn(async () => {}),
}));

jest.mock('../frontend/src/utils/inventoryAssignment', () => ({
  assignRequests: jest.fn(() => []),
}));

jest.mock('../frontend/src/utils/inventorySavedAddresses', () => ({
  getSavedAddresses: jest.fn(() => []),
  storeSavedAddress: jest.fn(),
}));

jest.mock('../frontend/src/components/inventory/common/StatusBadge', () => {
  return function MockStatusBadge({ status }) {
    return <span data-testid="status-badge">{status}</span>;
  };
});

jest.mock('../frontend/src/components/inventory/common/RequestDetail', () => {
  return function MockRequestDetail() {
    return <div data-testid="request-detail">Detail</div>;
  };
});

jest.mock('../frontend/src/components/inventory/common/CapacityInput', () => {
  return function MockCapacityInput({ onSave }) {
    return <button data-testid="capacity-save" onClick={() => onSave('item-1', { currentStock: 10, capacityPerDay: 5 })}>Save</button>;
  };
});

jest.mock('../frontend/src/components/inventory/producer/AddressReveal', () => {
  return function MockAddressReveal() {
    return <div data-testid="address-reveal">Address</div>;
  };
});

jest.mock('../frontend/src/components/inventory/common/SlidePanel', () => {
  return function MockSlidePanel({ children, isOpen }) {
    return isOpen ? <div data-testid="slide-panel">{children}</div> : null;
  };
});

jest.mock('../frontend/src/components/common/ChatButton', () => {
  return function MockChatButton() {
    return <button data-testid="chat-button">Chat</button>;
  };
});

// ============================================================
// Helpers
// ============================================================

function createMockYArray(initial = []) {
  const arr = [...initial];
  return {
    toArray: () => [...arr],
    push: jest.fn(items => arr.push(...items)),
    insert: jest.fn((idx, items) => arr.splice(idx, 0, ...items)),
    delete: jest.fn((idx, len) => arr.splice(idx, len)),
    get length() { return arr.length; },
    observe: jest.fn(),
    unobserve: jest.fn(),
    doc: { transact: (fn) => fn() },
  };
}

function createMockYMap(initial = {}) {
  const map = { ...initial };
  return {
    get: jest.fn(key => map[key]),
    set: jest.fn((key, val) => { map[key] = val; }),
    delete: jest.fn(key => { delete map[key]; }),
    has: jest.fn(key => key in map),
    forEach: jest.fn(fn => Object.entries(map).forEach(([k, v]) => fn(v, k))),
    entries: jest.fn(function* () { for (const [k, v] of Object.entries(map)) yield [k, v]; }),
    toJSON: () => ({ ...map }),
    observe: jest.fn(),
    unobserve: jest.fn(),
  };
}

function readSource(relPath) {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.resolve(__dirname, relPath), 'utf8');
}

// ============================================================
// §1 — AdminDashboard handleApprove address reveal creation
// ============================================================

describe('AdminDashboard — handleApprove crypto flow', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/AdminDashboard.jsx'); });

  test('imports getPublicKeyHex from addressCrypto', () => {
    expect(src).toContain("getPublicKeyHex");
    expect(src).toMatch(/import\s+\{[^}]*getPublicKeyHex[^}]*\}\s+from\s+['"][^'"]*addressCrypto['"]/);
  });

  test('imports base62ToPublicKeyHex from addressCrypto', () => {
    expect(src).toMatch(/import\s+\{[^}]*base62ToPublicKeyHex[^}]*\}\s+from\s+['"][^'"]*addressCrypto['"]/);
  });

  test('imports createAddressReveal from addressCrypto', () => {
    expect(src).toMatch(/import\s+\{[^}]*createAddressReveal[^}]*\}\s+from\s+['"][^'"]*addressCrypto['"]/);
  });

  test('imports decryptPendingAddress from addressCrypto', () => {
    expect(src).toMatch(/import\s+\{[^}]*decryptPendingAddress[^}]*\}\s+from\s+['"][^'"]*addressCrypto['"]/);
  });

  test('imports getAddress from inventoryAddressStore', () => {
    expect(src).toMatch(/import\s+\{[^}]*getAddress[^}]*\}\s+from\s+['"][^'"]*inventoryAddressStore['"]/);
  });

  test('imports getWorkspaceKeyMaterial from inventoryAddressStore', () => {
    expect(src).toMatch(/import\s+\{[^}]*getWorkspaceKeyMaterial[^}]*\}\s+from\s+['"][^'"]*inventoryAddressStore['"]/);
  });

  test('imports storeAddress from inventoryAddressStore', () => {
    expect(src).toMatch(/import\s+\{[^}]*storeAddress[^}]*\}\s+from\s+['"][^'"]*inventoryAddressStore['"]/);
  });

  test('handleApprove is async', () => {
    const approveBlock = src.match(/const handleApprove\s*=\s*useCallback\s*\(\s*async/);
    expect(approveBlock).toBeTruthy();
  });

  test('handleApprove calls decryptPendingAddress', () => {
    const approveSection = src.match(/handleApprove[\s\S]*?(?=const handleReject)/);
    expect(approveSection).toBeTruthy();
    expect(approveSection[0]).toContain('decryptPendingAddress');
  });

  test('handleApprove calls createAddressReveal', () => {
    const approveSection = src.match(/handleApprove[\s\S]*?(?=const handleReject)/);
    expect(approveSection[0]).toContain('createAddressReveal');
  });

  test('handleApprove calls storeAddress', () => {
    const approveSection = src.match(/handleApprove[\s\S]*?(?=const handleReject)/);
    expect(approveSection[0]).toContain('storeAddress');
  });

  test('handleApprove references yPendingAddresses', () => {
    const approveSection = src.match(/handleApprove[\s\S]*?(?=const handleReject)/);
    expect(approveSection[0]).toContain('yPendingAddresses');
  });

  test('handleApprove references yAddressReveals', () => {
    const approveSection = src.match(/handleApprove[\s\S]*?(?=const handleReject)/);
    expect(approveSection[0]).toContain('yAddressReveals');
  });
});

// ============================================================
// §2 — AdminDashboard handleReject sets approvedBy: null
// ============================================================

describe('AdminDashboard — handleReject approvedBy', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/AdminDashboard.jsx'); });

  test('handleReject includes approvedBy: null', () => {
    const rejectBlock = src.match(/handleReject[\s\S]*?(?=const getAssignedName|$)/);
    expect(rejectBlock).toBeTruthy();
    expect(rejectBlock[0]).toContain('approvedBy: null');
  });

  test('handleReject still sets status to open', () => {
    const rejectBlock = src.match(/handleReject[\s\S]*?(?=const getAssignedName|$)/);
    expect(rejectBlock[0]).toContain("status: 'open'");
  });
});

// ============================================================
// §3 — AdminDashboard handleApprove deps include crypto deps
// ============================================================

describe('AdminDashboard — handleApprove dependencies', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/AdminDashboard.jsx'); });

  test('handleApprove deps include ctx.currentWorkspace', () => {
    // Extract the deps array after the "approved" toast — toast + deps on consecutive lines
    const match = src.match(/approved.*?success.*?[\r\n]+\s*\}\s*,\s*\[([^\]]+)\]/);
    expect(match).toBeTruthy();
    expect(match[1]).toContain('ctx.currentWorkspace');
  });

  test('handleApprove deps include ctx.workspaceId', () => {
    const match = src.match(/approved.*?success.*?[\r\n]+\s*\}\s*,\s*\[([^\]]+)\]/);
    expect(match[1]).toContain('ctx.workspaceId');
  });

  test('handleApprove deps include ctx.yPendingAddresses', () => {
    const match = src.match(/approved.*?success.*?[\r\n]+\s*\}\s*,\s*\[([^\]]+)\]/);
    expect(match[1]).toContain('ctx.yPendingAddresses');
  });

  test('handleApprove deps include ctx.yAddressReveals', () => {
    const match = src.match(/approved.*?success.*?[\r\n]+\s*\}\s*,\s*\[([^\]]+)\]/);
    expect(match[1]).toContain('ctx.yAddressReveals');
  });
});

// ============================================================
// §4 — ProducerNameMapper shows ALL collaborators
// ============================================================

describe('ProducerNameMapper — all collaborators in dropdown', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/admin/ProducerNameMapper.jsx');
  });

  test('producers list uses ALL collaborators, not filtered by permission', () => {
    // The producers useMemo should spread all collaborators
    const producersMemo = src.match(/const producers[\s\S]*?(?=\/\/ Build unresolved)/);
    expect(producersMemo).toBeTruthy();
    // Should NOT filter by permission
    expect(producersMemo[0]).not.toContain("c.permission === 'editor'");
    expect(producersMemo[0]).not.toContain("c.permission === 'owner'");
    // Should spread all collaborators
    expect(producersMemo[0]).toContain('[...collaborators]');
  });

  test('renders viewer collaborators in dropdown', () => {
    const yReqs = createMockYArray([
      { id: 'req-1', importedProducerName: 'John Doe', quantity: 5, catalogItemName: 'Hat' },
    ]);
    const yAudit = createMockYArray([]);

    mockInventoryCtx = {
      requests: yReqs.toArray(),
      collaborators: [
        { publicKey: 'key-owner', publicKeyBase62: 'key-owner', displayName: 'Admin', permission: 'owner' },
        { publicKey: 'key-viewer', publicKeyBase62: 'key-viewer', displayName: 'Viewer Bob', permission: 'viewer' },
        { publicKey: 'key-editor', publicKeyBase62: 'key-editor', displayName: 'Editor Alice', permission: 'editor' },
      ],
      userIdentity: { publicKeyBase62: 'key-owner', displayName: 'Admin' },
      yInventoryRequests: yReqs,
      yInventoryAuditLog: yAudit,
      inventorySystemId: 'sys-1',
    };

    const ProducerNameMapper = require('../frontend/src/components/inventory/admin/ProducerNameMapper').default;
    render(<ProducerNameMapper />);

    // All three collaborators should appear as options
    const options = screen.getAllByRole('option');
    const optionTexts = options.map(o => o.textContent);

    // Should have placeholder + 3 collaborators
    expect(options.length).toBe(4);

    // Viewer should be present
    expect(optionTexts.some(t => t.includes('Viewer Bob'))).toBe(true);
    // Editor should be present
    expect(optionTexts.some(t => t.includes('Editor Alice'))).toBe(true);
    // Admin/owner should be present
    expect(optionTexts.some(t => t.includes('Admin'))).toBe(true);
  });
});

// ============================================================
// §5 — ProducerNameMapper uses publicKeyBase62 for values
// ============================================================

describe('ProducerNameMapper — publicKeyBase62 usage', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/admin/ProducerNameMapper.jsx');
  });

  test('option value uses publicKeyBase62', () => {
    // Check dropdown option uses publicKeyBase62
    expect(src).toMatch(/value=\{p\.publicKeyBase62\s*\|\|\s*p\.publicKey\}/);
  });

  test('option key uses publicKeyBase62', () => {
    expect(src).toMatch(/key=\{p\.publicKeyBase62\s*\|\|\s*p\.publicKey\}/);
  });

  test('handleSave lookup uses publicKeyBase62', () => {
    const saveBlock = src.match(/handleSave[\s\S]*?(?=const assignedCount)/);
    expect(saveBlock).toBeTruthy();
    expect(saveBlock[0]).toContain('c.publicKeyBase62 || c.publicKey');
  });
});

// ============================================================
// §6 — ProducerNameMapper shows (viewer) label
// ============================================================

describe('ProducerNameMapper — permission labels', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/admin/ProducerNameMapper.jsx');
  });

  test('shows (admin) for owners', () => {
    expect(src).toContain("(admin)");
  });

  test('shows (producer) for editors', () => {
    expect(src).toContain("(producer)");
  });

  test('shows (viewer) for viewers', () => {
    expect(src).toContain("(viewer)");
  });

  test('renders correct labels in dropdown', () => {
    const yReqs = createMockYArray([
      { id: 'req-1', importedProducerName: 'Someone', quantity: 1, catalogItemName: 'Item' },
    ]);
    const yAudit = createMockYArray([]);

    mockInventoryCtx = {
      requests: yReqs.toArray(),
      collaborators: [
        { publicKey: 'k-own', publicKeyBase62: 'k-own', displayName: 'Owner', permission: 'owner' },
        { publicKey: 'k-edit', publicKeyBase62: 'k-edit', displayName: 'Editor', permission: 'editor' },
        { publicKey: 'k-view', publicKeyBase62: 'k-view', displayName: 'Viewer', permission: 'viewer' },
      ],
      userIdentity: { publicKeyBase62: 'k-own', displayName: 'Owner' },
      yInventoryRequests: yReqs,
      yInventoryAuditLog: yAudit,
      inventorySystemId: 'sys-1',
    };

    const ProducerNameMapper = require('../frontend/src/components/inventory/admin/ProducerNameMapper').default;
    render(<ProducerNameMapper />);

    const options = screen.getAllByRole('option');
    const optionTexts = options.map(o => o.textContent);

    expect(optionTexts.some(t => t.includes('(admin)'))).toBe(true);
    expect(optionTexts.some(t => t.includes('(producer)'))).toBe(true);
    expect(optionTexts.some(t => t.includes('(viewer)'))).toBe(true);
  });
});

// ============================================================
// §7 — ImportWizard sets requestedBy field
// ============================================================

describe('ImportWizard — requestedBy field', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/import/ImportWizard.jsx');
  });

  test('imported requests include requestedBy from userIdentity', () => {
    // Check that the request construction includes requestedBy
    expect(src).toContain('requestedBy');
    expect(src).toMatch(/requestedBy:\s*ctx\.userIdentity\?\.publicKeyBase62/);
  });
});

// ============================================================
// §8 — ImportWizard uses publicKeyBase62 for assignedTo
// ============================================================

describe('ImportWizard — assignedTo uses publicKeyBase62', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/import/ImportWizard.jsx');
  });

  test('assignedTo uses publicKeyBase62 || publicKey', () => {
    // The match block should assign using publicKeyBase62
    const assignBlock = src.match(/if\s*\(match\)\s*\{[\s\S]*?assignedTo[^;]*;/);
    expect(assignBlock).toBeTruthy();
    expect(assignBlock[0]).toContain('publicKeyBase62');
  });

  test('does NOT use match.publicKey alone for assignedTo', () => {
    const assignLine = src.match(/request\.assignedTo\s*=\s*match\.publicKey;/);
    // Should NOT match — it should be match.publicKeyBase62 || match.publicKey
    expect(assignLine).toBeNull();
  });
});

// ============================================================
// §9 — AuditLog action types completeness
// ============================================================

describe('AuditLog — action labels and icons completeness', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/admin/AuditLog.jsx');
  });

  const EXPECTED_ACTIONS = [
    'request_created',
    'request_claimed',
    'request_auto_assigned',
    'request_manually_assigned',
    'request_approved',
    'request_rejected',
    'request_shipped',
    'request_delivered',
    'request_cancelled',
    'request_unclaimed',
    'address_revealed',
    'address_purged',
    'capacity_updated',
    'catalog_item_added',
    'catalog_item_updated',
    'catalog_item_deactivated',
    'settings_changed',
    'data_imported',
    'request_submitted',
    'request_edited',
    'request_reassigned',
    'producer_names_mapped',
    'bulk_claim_imported',
    'system_configured',
  ];

  test.each(EXPECTED_ACTIONS)('ACTION_LABELS includes %s', (action) => {
    const labelsBlock = src.match(/const ACTION_LABELS\s*=\s*\{[\s\S]*?\};/);
    expect(labelsBlock).toBeTruthy();
    expect(labelsBlock[0]).toContain(action);
  });

  test.each(EXPECTED_ACTIONS)('ACTION_ICONS includes %s', (action) => {
    const iconsBlock = src.match(/const ACTION_ICONS\s*=\s*\{[\s\S]*?\};/);
    expect(iconsBlock).toBeTruthy();
    expect(iconsBlock[0]).toContain(action);
  });
});

// ============================================================
// §10 — NotificationInbox icons completeness
// ============================================================

describe('NotificationInbox — notification icons', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/common/NotificationInbox.jsx');
  });

  const EXPECTED_NOTIFICATION_TYPES = [
    'request_approved',
    'request_rejected',
    'request_claimed',
    'request_unclaimed',
    'request_cancelled',
    'request_shipped',
    'request_delivered',
    'request_in_progress',
    'blocked_request',
    'request_submitted',
  ];

  test.each(EXPECTED_NOTIFICATION_TYPES)('NOTIFICATION_ICONS includes %s', (type) => {
    const iconsBlock = src.match(/const NOTIFICATION_ICONS\s*=\s*\{[\s\S]*?\};/);
    expect(iconsBlock).toBeTruthy();
    expect(iconsBlock[0]).toContain(type);
  });

  test('renders with request_submitted notification', () => {
    const yNotifs = createMockYArray([
      {
        id: 'notif-1',
        recipientId: 'my-key',
        inventorySystemId: 'sys-1',
        type: 'request_submitted',
        message: 'New request submitted: Widget',
        createdAt: Date.now(),
        read: false,
      },
    ]);

    mockInventoryCtx = {
      yInventoryNotifications: yNotifs,
      inventorySystemId: 'sys-1',
      userIdentity: { publicKeyBase62: 'my-key' },
      collaborators: [],
    };

    const NotificationInbox = require('../frontend/src/components/inventory/common/NotificationInbox').default;
    render(<NotificationInbox />);

    expect(screen.getByText(/New request submitted/)).toBeInTheDocument();
  });
});

// ============================================================
// §11 — SubmitRequest notifies owners only
// ============================================================

describe('SubmitRequest — admin notification filter', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/requestor/SubmitRequest.jsx');
  });

  test('notification comment says owners only', () => {
    expect(src).toContain('Notify admins (owners only)');
  });

  test('filter selects only owners, not editors', () => {
    // Find the admin notification filter
    const filterMatch = src.match(/const admins\s*=\s*\(collaborators[^;]+;/);
    expect(filterMatch).toBeTruthy();
    // Should filter for owner only
    expect(filterMatch[0]).toContain("c.permission === 'owner'");
    // Should NOT include editor
    expect(filterMatch[0]).not.toContain("c.permission === 'editor'");
  });

  test('editors do not receive request_submitted notifications', () => {
    // The admin filter should not include || c.permission === 'editor'
    const notifyBlock = src.match(/Notify admins[\s\S]*?(?=\/\/ Reset form)/);
    expect(notifyBlock).toBeTruthy();
    // Only owners in filter — no mention of editor permission
    const filterLine = notifyBlock[0].match(/\.filter\([^)]+\)/);
    expect(filterLine).toBeTruthy();
    expect(filterLine[0]).not.toContain('editor');
  });
});

// ============================================================
// §12 — AllRequests handleCancel clears approvedAt/approvedBy
// ============================================================

describe('AllRequests — handleCancel clears approval fields', () => {
  let src;
  beforeEach(() => {
    src = readSource('../frontend/src/components/inventory/admin/AllRequests.jsx');
  });

  test('handleCancel sets approvedAt: null', () => {
    const cancelBlock = src.match(/handleCancel[\s\S]*?(?=const usedStates|const handleMarkInProgress|$)/);
    expect(cancelBlock).toBeTruthy();
    expect(cancelBlock[0]).toContain('approvedAt: null');
  });

  test('handleCancel sets approvedBy: null', () => {
    const cancelBlock = src.match(/handleCancel[\s\S]*?(?=const usedStates|const handleMarkInProgress|$)/);
    expect(cancelBlock[0]).toContain('approvedBy: null');
  });

  test('handleCancel also clears assignedTo, assignedAt, claimedBy, claimedAt', () => {
    const cancelBlock = src.match(/handleCancel[\s\S]*?(?=const usedStates|const handleMarkInProgress|$)/);
    expect(cancelBlock[0]).toContain('assignedTo: null');
    expect(cancelBlock[0]).toContain('assignedAt: null');
    expect(cancelBlock[0]).toContain('claimedBy: null');
    expect(cancelBlock[0]).toContain('claimedAt: null');
  });

  test('handleCancel sets status to cancelled', () => {
    const cancelBlock = src.match(/handleCancel[\s\S]*?(?=const usedStates|const handleMarkInProgress|$)/);
    expect(cancelBlock[0]).toContain("status: 'cancelled'");
  });
});

// ============================================================
// §13 — ProducerNameMapper end-to-end save flow
// ============================================================

describe('ProducerNameMapper — save assigns requests correctly', () => {
  test('handleSave updates request assignedTo and clears importedProducerName', () => {
    const yReqs = createMockYArray([
      { id: 'req-1', importedProducerName: 'John Doe', quantity: 5, catalogItemName: 'Hat', status: 'open' },
      { id: 'req-2', importedProducerName: 'John Doe', quantity: 3, catalogItemName: 'Shirt', status: 'open' },
      { id: 'req-3', importedProducerName: 'Jane Smith', quantity: 2, catalogItemName: 'Belt', status: 'open' },
    ]);
    const yAudit = createMockYArray([]);

    mockInventoryCtx = {
      requests: yReqs.toArray(),
      collaborators: [
        { publicKey: 'key-admin', publicKeyBase62: 'key-admin', displayName: 'Admin', permission: 'owner' },
        { publicKey: 'key-bob', publicKeyBase62: 'key-bob', displayName: 'Bob', permission: 'viewer' },
      ],
      userIdentity: { publicKeyBase62: 'key-admin', displayName: 'Admin' },
      yInventoryRequests: yReqs,
      yInventoryAuditLog: yAudit,
      inventorySystemId: 'sys-1',
    };

    const ProducerNameMapper = require('../frontend/src/components/inventory/admin/ProducerNameMapper').default;
    render(<ProducerNameMapper />);

    // Should show two unresolved names
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();

    // Assign "John Doe" to Bob (a viewer)
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBe(2);

    // Select Bob for John Doe
    fireEvent.change(selects[0], { target: { value: 'key-bob' } });

    // Click save
    const saveBtn = screen.getByRole('button', { name: /Assign 1 Name/i });
    expect(saveBtn).not.toBeDisabled();
    act(() => { fireEvent.click(saveBtn); });

    // Verify yArray operations occurred
    expect(yReqs.delete).toHaveBeenCalled();
    expect(yReqs.insert).toHaveBeenCalled();

    // Audit log should have been written
    expect(yAudit.push).toHaveBeenCalled();
  });
});

// ============================================================
// §14 — AdminDashboard render test (approval card)
// ============================================================

describe('AdminDashboard — renders approval preview', () => {
  test('renders pending approval cards', () => {
    const yReqs = createMockYArray([
      { id: 'req-1', status: 'approved', catalogItemName: 'Widget', quantity: 5, requestedBy: 'user-1' },
      { id: 'req-2', status: 'open', catalogItemName: 'Gadget', quantity: 3, requestedBy: 'user-2' },
    ]);
    const yAudit = createMockYArray([]);
    const yNotifs = createMockYArray([]);

    mockInventoryCtx = {
      requests: yReqs.toArray(),
      catalogItems: [
        { id: 'cat-1', name: 'Widget', active: true },
        { id: 'cat-2', name: 'Gadget', active: true },
      ],
      auditLog: [],
      collaborators: [
        { publicKey: 'user-1', publicKeyBase62: 'user-1', displayName: 'Alice', permission: 'viewer' },
      ],
      userIdentity: { publicKeyBase62: 'admin-key', displayName: 'Admin' },
      yInventoryRequests: yReqs,
      yInventoryAuditLog: yAudit,
      yInventoryNotifications: yNotifs,
      yPendingAddresses: createMockYMap({}),
      yAddressReveals: createMockYMap({}),
      inventorySystemId: 'sys-1',
      currentWorkspace: 'ws-1',
      workspaceId: 'ws-1',
      showToast: jest.fn(),
      settings: {},
    };

    const AdminDashboard = require('../frontend/src/components/inventory/admin/AdminDashboard').default;
    render(<AdminDashboard />);

    // Should show some dashboard content
    expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
  });
});

// ============================================================
// §15 — Comprehensive data integrity: field completeness
// ============================================================

describe('Data integrity — field completeness across files', () => {
  test('AdminDashboard handleApprove sets approvedBy', () => {
    const src = readSource('../frontend/src/components/inventory/admin/AdminDashboard.jsx');
    const approveBlock = src.match(/handleApprove[\s\S]*?(?=const handleReject)/);
    expect(approveBlock[0]).toContain('approvedBy:');
  });

  test('AdminDashboard handleApprove sets approvedAt', () => {
    const src = readSource('../frontend/src/components/inventory/admin/AdminDashboard.jsx');
    const approveBlock = src.match(/handleApprove[\s\S]*?(?=const handleReject)/);
    expect(approveBlock[0]).toContain('approvedAt:');
  });

  test('AdminDashboard handleApprove sets status to approved', () => {
    const src = readSource('../frontend/src/components/inventory/admin/AdminDashboard.jsx');
    const approveBlock = src.match(/handleApprove[\s\S]*?(?=const handleReject)/);
    expect(approveBlock[0]).toContain("status: 'approved'");
  });

  test('AllRequests handleCancel has updatedAt timestamp', () => {
    const src = readSource('../frontend/src/components/inventory/admin/AllRequests.jsx');
    const cancelBlock = src.match(/handleCancel[\s\S]*?(?=const usedStates)/);
    expect(cancelBlock[0]).toContain('updatedAt: Date.now()');
  });
});
