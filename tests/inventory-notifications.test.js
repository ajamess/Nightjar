/**
 * tests/inventory-notifications.test.js
 *
 * Unit tests for inventoryNotifications.js utility.
 * Covers: pushNotification, markNotificationRead, markAllRead, getUnreadCount.
 */

import {
  pushNotification,
  markNotificationRead,
  markAllRead,
  getUnreadCount,
} from '../frontend/src/utils/inventoryNotifications';

// Mock Y.Array-like object
function createMockYArray(initialData = []) {
  const data = [...initialData];
  return {
    toArray: () => [...data],
    push: (items) => { data.push(...items); },
    delete: (idx, count) => { data.splice(idx, count); },
    insert: (idx, items) => { data.splice(idx, 0, ...items); },
    get length() { return data.length; },
    _data: data, // for test inspection
  };
}

describe('inventoryNotifications', () => {
  // ─── pushNotification ───────────────────────────────────
  describe('pushNotification', () => {
    it('pushes a notification to the Y.Array', () => {
      const yArr = createMockYArray();
      pushNotification(yArr, {
        inventorySystemId: 'sys-1',
        recipientId: 'user-1',
        type: 'request_approved',
        message: 'Your request was approved',
        relatedId: 'req-123',
      });
      expect(yArr._data.length).toBe(1);
      expect(yArr._data[0].recipientId).toBe('user-1');
      expect(yArr._data[0].type).toBe('request_approved');
      expect(yArr._data[0].message).toBe('Your request was approved');
      expect(yArr._data[0].relatedId).toBe('req-123');
      expect(yArr._data[0].read).toBe(false);
      expect(yArr._data[0].createdAt).toBeDefined();
    });

    it('generates a unique ID with notif- prefix', () => {
      const yArr = createMockYArray();
      pushNotification(yArr, {
        inventorySystemId: 'sys-1',
        recipientId: 'user-1',
        type: 'test',
        message: 'test',
      });
      expect(yArr._data[0].id).toMatch(/^notif-/);
    });

    it('defaults relatedId to null', () => {
      const yArr = createMockYArray();
      pushNotification(yArr, {
        inventorySystemId: 'sys-1',
        recipientId: 'user-1',
        type: 'test',
        message: 'test',
      });
      expect(yArr._data[0].relatedId).toBeNull();
    });

    it('does nothing when yNotifications is null', () => {
      expect(() => pushNotification(null, {
        inventorySystemId: 'sys-1',
        recipientId: 'user-1',
        type: 'test',
        message: 'test',
      })).not.toThrow();
    });

    it('does nothing when yNotifications is undefined', () => {
      expect(() => pushNotification(undefined, {
        inventorySystemId: 'sys-1',
        recipientId: 'user-1',
        type: 'test',
        message: 'test',
      })).not.toThrow();
    });

    it('stores inventorySystemId on the notification', () => {
      const yArr = createMockYArray();
      pushNotification(yArr, {
        inventorySystemId: 'sys-42',
        recipientId: 'user-1',
        type: 'test',
        message: 'test',
      });
      expect(yArr._data[0].inventorySystemId).toBe('sys-42');
    });
  });

  // ─── markNotificationRead ───────────────────────────────
  describe('markNotificationRead', () => {
    it('marks a specific notification as read', () => {
      const yArr = createMockYArray([
        { id: 'n1', recipientId: 'u1', read: false },
        { id: 'n2', recipientId: 'u1', read: false },
      ]);
      markNotificationRead(yArr, 'n1');
      const arr = yArr.toArray();
      expect(arr[0].read).toBe(true);
      expect(arr[1].read).toBe(false);
    });

    it('does nothing if notification ID not found', () => {
      const yArr = createMockYArray([
        { id: 'n1', recipientId: 'u1', read: false },
      ]);
      markNotificationRead(yArr, 'nonexistent');
      expect(yArr.toArray()[0].read).toBe(false);
    });

    it('does nothing when yNotifications is null', () => {
      expect(() => markNotificationRead(null, 'n1')).not.toThrow();
    });
  });

  // ─── markAllRead ────────────────────────────────────────
  describe('markAllRead', () => {
    it('marks all unread notifications for a user as read', () => {
      const yArr = createMockYArray([
        { id: 'n1', recipientId: 'u1', inventorySystemId: 'sys-1', read: false },
        { id: 'n2', recipientId: 'u1', inventorySystemId: 'sys-1', read: false },
        { id: 'n3', recipientId: 'u2', inventorySystemId: 'sys-1', read: false },
      ]);
      markAllRead(yArr, 'u1', 'sys-1');
      const arr = yArr.toArray();
      expect(arr[0].read).toBe(true);
      expect(arr[1].read).toBe(true);
      expect(arr[2].read).toBe(false); // different user
    });

    it('only marks notifications for the specified system', () => {
      const yArr = createMockYArray([
        { id: 'n1', recipientId: 'u1', inventorySystemId: 'sys-1', read: false },
        { id: 'n2', recipientId: 'u1', inventorySystemId: 'sys-2', read: false },
      ]);
      markAllRead(yArr, 'u1', 'sys-1');
      const arr = yArr.toArray();
      expect(arr[0].read).toBe(true);
      expect(arr[1].read).toBe(false); // different system
    });

    it('skips already-read notifications', () => {
      const yArr = createMockYArray([
        { id: 'n1', recipientId: 'u1', inventorySystemId: 'sys-1', read: true },
        { id: 'n2', recipientId: 'u1', inventorySystemId: 'sys-1', read: false },
      ]);
      markAllRead(yArr, 'u1', 'sys-1');
      const arr = yArr.toArray();
      expect(arr.length).toBe(2);
      expect(arr[0].read).toBe(true);
      expect(arr[1].read).toBe(true);
    });

    it('does nothing when yNotifications is null', () => {
      expect(() => markAllRead(null, 'u1', 'sys-1')).not.toThrow();
    });
  });

  // ─── getUnreadCount ─────────────────────────────────────
  describe('getUnreadCount', () => {
    it('counts unread notifications for a specific user and system', () => {
      const notifications = [
        { recipientId: 'u1', inventorySystemId: 'sys-1', read: false },
        { recipientId: 'u1', inventorySystemId: 'sys-1', read: false },
        { recipientId: 'u1', inventorySystemId: 'sys-1', read: true },
        { recipientId: 'u2', inventorySystemId: 'sys-1', read: false },
        { recipientId: 'u1', inventorySystemId: 'sys-2', read: false },
      ];
      expect(getUnreadCount(notifications, 'u1', 'sys-1')).toBe(2);
    });

    it('returns 0 when all are read', () => {
      const notifications = [
        { recipientId: 'u1', inventorySystemId: 'sys-1', read: true },
      ];
      expect(getUnreadCount(notifications, 'u1', 'sys-1')).toBe(0);
    });

    it('returns 0 for empty array', () => {
      expect(getUnreadCount([], 'u1', 'sys-1')).toBe(0);
    });

    it('returns 0 when no notifications match user', () => {
      const notifications = [
        { recipientId: 'u2', inventorySystemId: 'sys-1', read: false },
      ];
      expect(getUnreadCount(notifications, 'u1', 'sys-1')).toBe(0);
    });
  });
});
