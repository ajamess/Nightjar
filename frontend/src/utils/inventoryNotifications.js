/**
 * inventoryNotifications.js
 *
 * Utility functions for the Yjs-backed notification system.
 * Notifications are stored in a Y.Array and delivered to specific users.
 *
 * See docs/INVENTORY_SYSTEM_SPEC.md §6.9 (Notifications)
 */

import { generateId } from './inventoryValidation';

/**
 * Push a notification to the Yjs notifications array.
 *
 * @param {Y.Array} yNotifications - Yjs notification array
 * @param {Object} opts
 * @param {string} opts.inventorySystemId
 * @param {string} opts.recipientId - public key of the recipient
 * @param {string} opts.type - e.g., 'request_approved', 'request_shipped', 'request_claimed'
 * @param {string} opts.message - Human-readable message
 * @param {string} [opts.relatedId] - Related entity ID (request, catalog item, etc.)
 */
export function pushNotification(yNotifications, {
  inventorySystemId,
  recipientId,
  type,
  message,
  relatedId = null,
}) {
  if (!yNotifications) return;
  yNotifications.push([{
    id: generateId('notif-'),
    inventorySystemId,
    recipientId,
    type,
    message,
    relatedId,
    read: false,
    createdAt: Date.now(),
  }]);
}

/**
 * Mark a notification as read.
 *
 * @param {Y.Array} yNotifications
 * @param {string} notificationId
 */
export function markNotificationRead(yNotifications, notificationId) {
  if (!yNotifications) return;
  const arr = yNotifications.toArray();
  const idx = arr.findIndex(n => n.id === notificationId);
  if (idx === -1) return;
  yNotifications.delete(idx, 1);
  yNotifications.insert(idx, [{ ...arr[idx], read: true }]);
}

/**
 * Mark all notifications as read for a user.
 *
 * @param {Y.Array} yNotifications
 * @param {string} recipientId
 * @param {string} inventorySystemId
 */
export function markAllRead(yNotifications, recipientId, inventorySystemId) {
  if (!yNotifications) return;
  const arr = yNotifications.toArray();
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = arr[i];
    if (n.recipientId === recipientId && n.inventorySystemId === inventorySystemId && !n.read) {
      yNotifications.delete(i, 1);
      yNotifications.insert(i, [{ ...n, read: true }]);
    }
  }
}

/**
 * Get unread notification count for a user.
 *
 * @param {Array} notifications - Plain array from Yjs
 * @param {string} recipientId
 * @param {string} inventorySystemId
 * @returns {number}
 */
export function getUnreadCount(notifications, recipientId, inventorySystemId) {
  return notifications.filter(
    n => n.recipientId === recipientId &&
         n.inventorySystemId === inventorySystemId &&
         !n.read
  ).length;
}
