/**
 * tests/inventory-workflow-audit-iter5.test.js
 *
 * Iteration 5 (FINAL) audit tests — verifies fixes for issues found in fifth pass:
 *
 * 1. ProducerManagement avg fulfillment uses requestedAt (not createdAt)
 * 2. ProducerManagement detail panel uses catalogItemName (not item)
 * 3. CatalogManager audit log actorId uses userIdentity (not 'system')
 * 4. CatalogManager audit log deps include userIdentity
 * 5. AuditLog has catalog_item_activated label/icon
 * 6. InventorySettings has no unused assignRequests import
 * 7. ApprovalQueue handleReject clears approvedBy/approvedAt
 * 8. MyRequests handleRequestAgain includes country field
 * 9. MyRequests handleRequestAgain notifies admins
 * 10. NotificationInbox uses Yjs observer for live updates
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

jest.mock('../frontend/src/utils/trackingLinks', () => ({
  parseTrackingNumber: jest.fn(() => null),
  genericTrackingUrl: jest.fn(() => ''),
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
  const observers = [];
  return {
    toArray: () => [...arr],
    push: jest.fn(items => { arr.push(...items); observers.forEach(fn => fn()); }),
    insert: jest.fn((idx, items) => { arr.splice(idx, 0, ...items); observers.forEach(fn => fn()); }),
    delete: jest.fn((idx, len) => { arr.splice(idx, len); observers.forEach(fn => fn()); }),
    get length() { return arr.length; },
    observe: jest.fn(fn => observers.push(fn)),
    unobserve: jest.fn(fn => { const i = observers.indexOf(fn); if (i >= 0) observers.splice(i, 1); }),
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
// §1 — ProducerManagement avg fulfillment uses requestedAt
// ============================================================

describe('ProducerManagement — avg fulfillment calculation', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/ProducerManagement.jsx'); });

  test('avg fulfillment uses requestedAt, not createdAt', () => {
    // Should contain r.requestedAt for the calculation
    expect(src).toContain('r.shippedAt && r.requestedAt');
  });

  test('does NOT use createdAt for avg fulfillment', () => {
    // Should not have the old createdAt reference in the fulfillment calc
    expect(src).not.toContain('r.shippedAt && r.createdAt');
  });

  test('uses shippedAt - requestedAt for days calculation', () => {
    const calcBlock = src.match(/totalDays[\s\S]*?withDays/);
    expect(calcBlock).toBeTruthy();
    expect(calcBlock[0]).toContain('r.shippedAt - r.requestedAt');
  });
});

// ============================================================
// §2 — ProducerManagement detail panel uses catalogItemName
// ============================================================

describe('ProducerManagement — detail panel fields', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/ProducerManagement.jsx'); });

  test('detail panel shows r.catalogItemName', () => {
    expect(src).toContain('r.catalogItemName');
  });

  test('detail panel does NOT use r.item', () => {
    // r.item is not a valid field on requests
    expect(src).not.toMatch(/\br\.item\b/);
  });
});

// ============================================================
// §3 — CatalogManager audit log uses userIdentity
// ============================================================

describe('CatalogManager — audit log actorId', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/CatalogManager.jsx'); });

  test('destructures userIdentity from useInventory', () => {
    expect(src).toMatch(/\{\s*[^}]*userIdentity[^}]*\}\s*=\s*useInventory\(\)/);
  });

  test('audit log actorId uses userIdentity.publicKeyBase62', () => {
    const auditBlocks = src.match(/actorId:\s*[^,\n]+/g);
    expect(auditBlocks).toBeTruthy();
    // All audit entries should reference userIdentity, none should be just 'system'
    for (const block of auditBlocks) {
      expect(block).toContain('userIdentity');
    }
  });

  test('does NOT use hardcoded system as actorId', () => {
    expect(src).not.toMatch(/actorId:\s*['"]system['"]/);
  });

  test('handleAddItem deps include userIdentity', () => {
    const addBlock = src.match(/handleAddItem[\s\S]*?(?=const handleSaveEdit)/);
    expect(addBlock).toBeTruthy();
    const depsMatch = addBlock[0].match(/\},\s*\[([^\]]+)\]/);
    expect(depsMatch).toBeTruthy();
    expect(depsMatch[1]).toContain('userIdentity');
  });

  test('handleSaveEdit deps include userIdentity', () => {
    const editBlock = src.match(/handleSaveEdit[\s\S]*?(?=const handleToggleActive)/);
    expect(editBlock).toBeTruthy();
    const depsMatch = editBlock[0].match(/\},\s*\[([^\]]+)\]/);
    expect(depsMatch).toBeTruthy();
    expect(depsMatch[1]).toContain('userIdentity');
  });

  test('handleToggleActive deps include userIdentity', () => {
    const toggleBlock = src.match(/handleToggleActive[\s\S]*?(?=const startEditing)/);
    expect(toggleBlock).toBeTruthy();
    const depsMatch = toggleBlock[0].match(/\},\s*\[([^\]]+)\]/);
    expect(depsMatch).toBeTruthy();
    expect(depsMatch[1]).toContain('userIdentity');
  });
});

// ============================================================
// §4 — AuditLog has catalog_item_activated
// ============================================================

describe('AuditLog — catalog_item_activated', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/AuditLog.jsx'); });

  test('ACTION_LABELS includes catalog_item_activated', () => {
    const labelsBlock = src.match(/const ACTION_LABELS\s*=\s*\{[\s\S]*?\};/);
    expect(labelsBlock[0]).toContain('catalog_item_activated');
  });

  test('ACTION_ICONS includes catalog_item_activated', () => {
    const iconsBlock = src.match(/const ACTION_ICONS\s*=\s*\{[\s\S]*?\};/);
    expect(iconsBlock[0]).toContain('catalog_item_activated');
  });

  test('catalog_item_activated label is descriptive', () => {
    expect(src).toContain("catalog_item_activated: 'Item Activated'");
  });
});

// ============================================================
// §5 — InventorySettings no unused imports
// ============================================================

describe('InventorySettings — clean imports', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/InventorySettings.jsx'); });

  test('does not import unused assignRequests', () => {
    expect(src).not.toMatch(/import\s+\{[^}]*assignRequests[^}]*\}/);
  });

  test('still imports runAutoAssign', () => {
    expect(src).toContain('runAutoAssign');
  });
});

// ============================================================
// §6 — ApprovalQueue handleReject clears approval fields
// ============================================================

describe('ApprovalQueue — handleReject clears approval fields', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/ApprovalQueue.jsx'); });

  test('handleReject sets approvedBy: null', () => {
    const rejectBlock = src.match(/handleReject[\s\S]*?(?=const handleBulkApprove)/);
    expect(rejectBlock).toBeTruthy();
    expect(rejectBlock[0]).toContain('approvedBy: null');
  });

  test('handleReject sets approvedAt: null', () => {
    const rejectBlock = src.match(/handleReject[\s\S]*?(?=const handleBulkApprove)/);
    expect(rejectBlock[0]).toContain('approvedAt: null');
  });

  test('handleReject still sets status to open', () => {
    const rejectBlock = src.match(/handleReject[\s\S]*?(?=const handleBulkApprove)/);
    expect(rejectBlock[0]).toContain("status: 'open'");
  });

  test('handleReject clears assignedTo/claimedBy', () => {
    const rejectBlock = src.match(/handleReject[\s\S]*?(?=const handleBulkApprove)/);
    expect(rejectBlock[0]).toContain('assignedTo: null');
    expect(rejectBlock[0]).toContain('claimedBy: null');
  });
});

// ============================================================
// §7 — MyRequests handleRequestAgain includes country
// ============================================================

describe('MyRequests — handleRequestAgain completeness', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/requestor/MyRequests.jsx'); });

  test('new request includes country field from original', () => {
    const reqAgainBlock = src.match(/handleRequestAgain[\s\S]*?(?=const handleStartEdit)/);
    expect(reqAgainBlock).toBeTruthy();
    expect(reqAgainBlock[0]).toContain('country:');
  });

  test('country has US default fallback', () => {
    const reqAgainBlock = src.match(/handleRequestAgain[\s\S]*?(?=const handleStartEdit)/);
    expect(reqAgainBlock[0]).toMatch(/country:\s*req\.country\s*\|\|\s*['"]US['"]/);
  });
});

// ============================================================
// §8 — MyRequests handleRequestAgain notifies admins
// ============================================================

describe('MyRequests — re-request admin notification', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/requestor/MyRequests.jsx'); });

  test('handleRequestAgain calls pushNotification', () => {
    const reqAgainBlock = src.match(/handleRequestAgain[\s\S]*?(?=const handleStartEdit)/);
    expect(reqAgainBlock).toBeTruthy();
    expect(reqAgainBlock[0]).toContain('pushNotification');
  });

  test('notification filter selects owners only', () => {
    const reqAgainBlock = src.match(/handleRequestAgain[\s\S]*?(?=const handleStartEdit)/);
    expect(reqAgainBlock[0]).toContain("c.permission === 'owner'");
    // Should NOT include editors
    expect(reqAgainBlock[0]).not.toMatch(/filter\([^)]*editor/);
  });

  test('notification type is request_submitted', () => {
    const reqAgainBlock = src.match(/handleRequestAgain[\s\S]*?(?=const handleStartEdit)/);
    expect(reqAgainBlock[0]).toContain("type: 'request_submitted'");
  });

  test('does not self-notify', () => {
    const reqAgainBlock = src.match(/handleRequestAgain[\s\S]*?(?=const handleStartEdit)/);
    expect(reqAgainBlock[0]).toContain('adminKey !== userIdentity?.publicKeyBase62');
  });
});

// ============================================================
// §9 — NotificationInbox Yjs observer for live updates
// ============================================================

describe('NotificationInbox — Yjs reactivity', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/common/NotificationInbox.jsx'); });

  test('imports useEffect', () => {
    expect(src).toMatch(/import[^;]*useEffect[^;]*from\s+['"]react['"]/);
  });

  test('uses useState for notification snapshot', () => {
    expect(src).toContain('notifSnapshot');
  });

  test('calls yInventoryNotifications.observe', () => {
    expect(src).toContain('yInventoryNotifications.observe');
  });

  test('calls yInventoryNotifications.unobserve in cleanup', () => {
    expect(src).toContain('yInventoryNotifications.unobserve');
  });

  test('allNotifications depends on notifSnapshot (not raw Y.Array)', () => {
    const memoBlock = src.match(/allNotifications\s*=\s*useMemo[\s\S]*?\[([^\]]+)\]/);
    expect(memoBlock).toBeTruthy();
    expect(memoBlock[1]).toContain('notifSnapshot');
    expect(memoBlock[1]).not.toContain('yInventoryNotifications');
  });
});

// ============================================================
// §10 — NotificationInbox live update behavioral test
// ============================================================

describe('NotificationInbox — live update behavior', () => {
  test('shows notifications pushed after mount', async () => {
    const yNotifs = createMockYArray([]);

    mockInventoryCtx = {
      yInventoryNotifications: yNotifs,
      inventorySystemId: 'sys-1',
      userIdentity: { publicKeyBase62: 'my-key' },
      collaborators: [],
    };

    const NotificationInbox = require('../frontend/src/components/inventory/common/NotificationInbox').default;
    const { rerender } = render(<NotificationInbox />);

    // Initially no notifications
    expect(screen.getByText(/No notifications yet/i)).toBeInTheDocument();

    // Push a notification via the mock Y.Array (triggers observers)
    act(() => {
      yNotifs.push([{
        id: 'notif-live-1',
        recipientId: 'my-key',
        inventorySystemId: 'sys-1',
        type: 'request_approved',
        message: 'Your widget request was approved',
        createdAt: Date.now(),
        read: false,
      }]);
    });

    // The observer should have fired and updated the snapshot
    expect(screen.getByText(/Your widget request was approved/)).toBeInTheDocument();
  });
});

// ============================================================
// §11 — ProducerManagement render test
// ============================================================

describe('ProducerManagement — renders producer table', () => {
  test('renders producer with correct avg days', () => {
    const now = Date.now();
    mockInventoryCtx = {
      collaborators: [
        { publicKey: 'prod-1', publicKeyBase62: 'prod-1', displayName: 'Bob', permission: 'editor', isOnline: true },
      ],
      userIdentity: { publicKeyBase62: 'admin-key', displayName: 'Admin' },
      requests: [
        {
          id: 'req-1', assignedTo: 'prod-1', status: 'shipped', catalogItemName: 'Widget',
          requestedAt: now - 5 * 86400000, shippedAt: now, quantity: 10,
        },
      ],
      producerCapacities: {},
      onStartChatWith: jest.fn(),
    };

    const ProducerManagement = require('../frontend/src/components/inventory/admin/ProducerManagement').default;
    render(<ProducerManagement />);

    // Should show Bob
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Should show avg days (5.0d)
    expect(screen.getByText('5d')).toBeInTheDocument();
  });
});

// ============================================================
// §12 — Cross-component field consistency
// ============================================================

describe('Cross-component field consistency', () => {
  test('SubmitRequest and MyRequests both set country field', () => {
    const submitSrc = readSource('../frontend/src/components/inventory/requestor/SubmitRequest.jsx');
    const myReqSrc = readSource('../frontend/src/components/inventory/requestor/MyRequests.jsx');
    expect(submitSrc).toContain("country:");
    expect(myReqSrc).toContain("country:");
  });

  test('SubmitRequest uses requestedAt (not createdAt)', () => {
    const src = readSource('../frontend/src/components/inventory/requestor/SubmitRequest.jsx');
    expect(src).toContain('requestedAt:');
    // Should not set createdAt on requests
    expect(src).not.toMatch(/createdAt:\s*now/);
  });

  test('ImportWizard uses requestedAt (not createdAt)', () => {
    const src = readSource('../frontend/src/components/inventory/import/ImportWizard.jsx');
    expect(src).toContain('requestedAt:');
  });

  test('All reject handlers clear approvedBy', () => {
    const adminDash = readSource('../frontend/src/components/inventory/admin/AdminDashboard.jsx');
    const allReqs = readSource('../frontend/src/components/inventory/admin/AllRequests.jsx');
    const approval = readSource('../frontend/src/components/inventory/admin/ApprovalQueue.jsx');

    const adminReject = adminDash.match(/handleReject[\s\S]*?(?=const getAssignedName|$)/);
    const allReject = allReqs.match(/handleReject[\s\S]*?(?=const handleCancel)/);
    const approvalReject = approval.match(/handleReject[\s\S]*?(?=const handleBulkApprove)/);

    expect(adminReject[0]).toContain('approvedBy: null');
    expect(allReject[0]).toContain('approvedBy: null');
    expect(approvalReject[0]).toContain('approvedBy: null');
  });

  test('All cancel handlers clear approvedBy and approvedAt', () => {
    const allReqs = readSource('../frontend/src/components/inventory/admin/AllRequests.jsx');
    const cancelBlock = allReqs.match(/handleCancel[\s\S]*?(?=const usedStates)/);
    expect(cancelBlock[0]).toContain('approvedBy: null');
    expect(cancelBlock[0]).toContain('approvedAt: null');
  });

  test('All audit log writes reference userIdentity (not system)', () => {
    const catalogSrc = readSource('../frontend/src/components/inventory/admin/CatalogManager.jsx');
    // No hardcoded 'system' actorId
    expect(catalogSrc).not.toMatch(/actorId:\s*['"]system['"]/);
  });
});

// ============================================================
// §13 — Complete action types coverage
// ============================================================

describe('AuditLog — complete action coverage', () => {
  let src;
  beforeEach(() => { src = readSource('../frontend/src/components/inventory/admin/AuditLog.jsx'); });

  const ALL_EXPECTED_ACTIONS = [
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
    'catalog_item_activated',
    'settings_changed',
    'data_imported',
    'request_submitted',
    'request_edited',
    'request_reassigned',
    'producer_names_mapped',
    'bulk_claim_imported',
    'system_configured',
  ];

  test('ACTION_LABELS covers all known actions', () => {
    const labelsBlock = src.match(/const ACTION_LABELS\s*=\s*\{[\s\S]*?\};/);
    expect(labelsBlock).toBeTruthy();
    for (const action of ALL_EXPECTED_ACTIONS) {
      expect(labelsBlock[0]).toContain(action);
    }
  });

  test('ACTION_ICONS covers all known actions', () => {
    const iconsBlock = src.match(/const ACTION_ICONS\s*=\s*\{[\s\S]*?\};/);
    expect(iconsBlock).toBeTruthy();
    for (const action of ALL_EXPECTED_ACTIONS) {
      expect(iconsBlock[0]).toContain(action);
    }
  });
});
