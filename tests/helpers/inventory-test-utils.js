/**
 * tests/helpers/inventory-test-utils.js
 *
 * Shared test utilities for the inventory management system tests.
 * Provides mock factories, Yjs mock helpers, and render wrappers.
 */

import React from 'react';
import { render } from '@testing-library/react';

// ── Mock Factory: Yjs Map ────────────────────────────────────

/**
 * Create a mock Y.Map with get/set/delete/forEach/observe/unobserve.
 * @param {Object} [initial={}] - Initial entries
 * @returns {Object} Mock Y.Map
 */
export function createMockYMap(initial = {}) {
  const data = { ...initial };
  const observers = [];
  return {
    get: jest.fn((key) => data[key]),
    set: jest.fn((key, val) => {
      data[key] = val;
      observers.forEach(fn => fn());
    }),
    delete: jest.fn((key) => {
      delete data[key];
      observers.forEach(fn => fn());
    }),
    has: jest.fn((key) => key in data),
    forEach: jest.fn((fn) => {
      for (const [k, v] of Object.entries(data)) fn(v, k);
    }),
    keys: jest.fn(() => Object.keys(data)),
    entries: jest.fn(() => Object.entries(data)),
    observe: jest.fn((fn) => observers.push(fn)),
    unobserve: jest.fn((fn) => {
      const idx = observers.indexOf(fn);
      if (idx >= 0) observers.splice(idx, 1);
    }),
    toJSON: jest.fn(() => ({ ...data })),
    _data: data,
  };
}

// ── Mock Factory: Yjs Array ──────────────────────────────────

/**
 * Create a mock Y.Array with toArray/push/delete/insert/observe/unobserve.
 * @param {Array} [initial=[]] - Initial items
 * @returns {Object} Mock Y.Array
 */
export function createMockYArray(initial = []) {
  const data = [...initial];
  const observers = [];
  return {
    toArray: jest.fn(() => [...data]),
    push: jest.fn((items) => {
      data.push(...items);
      observers.forEach(fn => fn());
    }),
    delete: jest.fn((idx, count = 1) => {
      data.splice(idx, count);
      observers.forEach(fn => fn());
    }),
    insert: jest.fn((idx, items) => {
      data.splice(idx, 0, ...items);
      observers.forEach(fn => fn());
    }),
    get length() { return data.length; },
    get: jest.fn((idx) => data[idx]),
    observe: jest.fn((fn) => observers.push(fn)),
    unobserve: jest.fn((fn) => {
      const idx = observers.indexOf(fn);
      if (idx >= 0) observers.splice(idx, 1);
    }),
    doc: { transact: jest.fn((fn) => fn()) },
    _data: data,
  };
}

// ── Mock Factory: Test Data Builders ─────────────────────────

let idCounter = 0;
function nextId(prefix = '') {
  idCounter++;
  return `${prefix}test-${idCounter}`;
}

/**
 * Create a test inventory request.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createTestRequest(overrides = {}) {
  return {
    id: nextId('req-'),
    inventorySystemId: 'sys-1',
    itemId: 'cat-1',
    item: 'Test Item',
    catalogItemName: 'Test Item',
    quantity: 10,
    unit: 'units',
    status: 'open',
    urgency: 'normal',
    urgent: false,
    requesterName: 'Test User',
    requesterState: 'CO',
    requesterCity: 'Denver',
    shippingState: 'CO',
    shippingCity: 'Denver',
    city: 'Denver',
    state: 'CO',
    assignedTo: null,
    claimedBy: null,
    requestedAt: Date.now() - 86400000,
    requestedBy: 'user-abc',
    createdAt: Date.now() - 86400000,
    notes: '',
    trackingNumber: '',
    ...overrides,
  };
}

/**
 * Create a test catalog item.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createTestCatalogItem(overrides = {}) {
  return {
    id: nextId('cat-'),
    inventorySystemId: 'sys-1',
    name: 'Test Item',
    unit: 'units',
    unitName: 'units',
    description: 'A test item',
    quantityMin: 1,
    quantityMax: 100,
    quantityStep: 1,
    isActive: true,
    ...overrides,
  };
}

/**
 * Create a test producer capacity record.
 * @param {string} [producerKey]
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createTestCapacity(producerKey = 'producer-a', overrides = {}) {
  return {
    producerKey,
    inventorySystemId: 'sys-1',
    items: {
      'cat-1': { currentStock: 10, capacityPerDay: 5 },
    },
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create a test user identity.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createTestIdentity(overrides = {}) {
  return {
    publicKeyBase62: 'testUserPubKey123',
    publicKeyHex: 'aa'.repeat(32),
    displayName: 'Test User',
    name: 'Test User',
    ...overrides,
  };
}

/**
 * Create a test audit log entry.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createTestAuditEntry(overrides = {}) {
  return {
    id: nextId('aud-'),
    inventorySystemId: 'sys-1',
    timestamp: Date.now(),
    actorId: 'testUserPubKey123',
    actorName: 'Test User',
    actorRole: 'owner',
    action: 'request_created',
    targetType: 'request',
    targetId: 'req-1',
    summary: 'Test action',
    ...overrides,
  };
}

// ── Context / Provider Wrappers ──────────────────────────────

/**
 * Default mock inventory context value.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createMockInventoryContext(overrides = {}) {
  return {
    inventorySystemId: 'sys-1',
    workspaceId: 'ws-1',
    yInventorySystems: createMockYMap({ 'sys-1': { name: 'Test System', icon: '📦' } }),
    yCatalogItems: createMockYArray([createTestCatalogItem()]),
    yInventoryRequests: createMockYArray([]),
    yProducerCapacities: createMockYMap({}),
    yAddressReveals: createMockYMap({}),
    yPendingAddresses: createMockYMap({}),
    yInventoryAuditLog: createMockYArray([]),
    userIdentity: createTestIdentity(),
    collaborators: [],
    ...overrides,
  };
}

/**
 * Default mock toast context value.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createMockToastContext(overrides = {}) {
  return {
    toast: null,
    showToast: jest.fn(),
    dismissToast: jest.fn(),
    ...overrides,
  };
}

/**
 * Reset the internal id counter (call in beforeEach if needed).
 */
export function resetIdCounter() {
  idCounter = 0;
}
