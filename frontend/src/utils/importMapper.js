/**
 * importMapper.js
 *
 * Column auto-detection + mapping for inventory import.
 * Maps source headers from a CSV/XLSX to target inventory fields.
 *
 * See docs/INVENTORY_SYSTEM_SPEC.md §9.2
 */

// ---------------------------------------------------------------------------
// Known field aliases  (§9.2)
// ---------------------------------------------------------------------------

const FIELD_ALIASES = {
  external_id: [
    'external_id', 'id', 'id_number', 'request_id', 'order_id', 'ref',
    'reference', 'ticket', 'ticket_number', 'row_id',
  ],
  item: [
    'item', 'product', 'sku', 'catalog_item', 'item_name', 'product_name',
    'catalog', 'material', 'type',
  ],
  quantity: [
    'quantity', 'qty', 'amount', 'count', 'units', 'num', 'number',
    'order_quantity', 'order_qty', 'qty_requested',
  ],
  requester_name: [
    'requester_name', 'requester', 'requestor', 'requestor_name',
    'name', 'full_name', 'customer', 'customer_name', 'recipient',
    'recipient_name', 'ordered_by',
  ],
  requester_state: [
    'requester_state', 'state', 'us_state', 'st', 'province',
    'region', 'ship_state', 'shipping_state',
  ],
  requester_city: [
    'requester_city', 'city', 'ship_city', 'shipping_city', 'town',
  ],
  address_line1: [
    'address_line1', 'address', 'street', 'address1', 'street_address',
    'shipping_address', 'ship_address', 'address_line_1',
  ],
  address_line2: [
    'address_line2', 'address2', 'apt', 'suite', 'unit', 'apartment',
    'address_line_2',
  ],
  zip: [
    'zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postcode',
  ],
  phone: [
    'phone', 'phone_number', 'tel', 'telephone', 'contact_phone',
    'mobile', 'cell',
  ],
  urgency: [
    'urgency', 'priority', 'rush', 'urgent', 'importance',
  ],
  notes: [
    'notes', 'note', 'comments', 'comment', 'description', 'message',
    'special_instructions', 'instructions', 'remarks',
  ],
  admin_notes: [
    'admin_notes', 'admin_note', 'input_admin_notes', 'internal_notes',
    'admin_comments', 'staff_notes',
  ],
  printer_notes: [
    'printer_notes', 'printer_note', 'producer_notes', 'maker_notes',
    'fulfillment_notes',
  ],
  assigned_to: [
    'assigned_to', 'claimed_by', 'producer', 'printer', 'fulfilled_by',
    'shipped_by', 'assigned', 'printer_name', 'producer_name',
    'maker', 'maker_name', 'assignee',
  ],
  status: [
    'status', 'order_status', 'request_status', 'shipped_status',
    'delivery_status', 'click_link_to_mark_as_shipped_or_add_notes',
    'click_link_to_mark_as_shipped', 'mark_as_shipped',
    'fulfillment_status', 'shipping_status',
  ],
  date: [
    'date', 'created', 'created_at', 'order_date', 'request_date',
    'submitted', 'submitted_at', 'timestamp',
  ],
  shipped_date: [
    'shipped_date', 'ship_date', 'fulfilled_date', 'fulfillment_date',
    'date_shipped', 'delivery_date',
  ],
  quantity_shipped: [
    'quantity_shipped', 'qty_shipped', 'shipped_quantity', 'shipped_qty',
    'amount_shipped',
  ],
  cancelled: [
    'cancelled', 'canceled', 'cancel', 'void', 'voided',
  ],
};

// Target fields — the canonical set
export const TARGET_FIELDS = Object.keys(FIELD_ALIASES);

// Required fields
export const REQUIRED_FIELDS = ['item', 'quantity'];

// ---------------------------------------------------------------------------
// Auto-mapping
// ---------------------------------------------------------------------------

/**
 * Given an array of normalized source headers, return a mapping:
 *   { sourceHeader: { target: targetField|null, confidence: 0–100 } }
 *
 * @param {string[]} sourceHeaders – normalized column names from parseFile()
 * @returns {Record<string, { target: string|null, confidence: number }>}
 */
export function autoMapColumns(sourceHeaders) {
  const result = {};
  const usedTargets = new Set();

  // Sort by best match first to avoid double-claiming
  const matches = [];
  for (const src of sourceHeaders) {
    const srcNorm = src.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_|_$/g, '');
    let best = { target: null, confidence: 0 };

    for (const [target, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (srcNorm === aliasNorm) {
          if (100 > best.confidence) best = { target, confidence: 100 };
        } else if (srcNorm.includes(aliasNorm) || aliasNorm.includes(srcNorm)) {
          if (50 > best.confidence) best = { target, confidence: 50 };
        }
      }
    }
    matches.push({ src, ...best });
  }

  // Sort by confidence descending so exact matches claim targets first
  matches.sort((a, b) => b.confidence - a.confidence);

  for (const { src, target, confidence } of matches) {
    if (target && !usedTargets.has(target) && confidence > 0) {
      result[src] = { target, confidence };
      // Allow multiple columns to map to 'status' — don't block it
      if (target !== 'status') usedTargets.add(target);
    } else {
      result[src] = { target: null, confidence: 0 };
    }
  }

  return result;
}

/**
 * Build a flat mapping object from the autoMap result,
 * suitable for passing to validateRow / ImportPreview.
 *
 * @param {Record<string, {target:string|null}>} autoMap
 * @returns {Record<string, string>} – { sourceCol: targetField | '__skip__' }
 */
export function flattenMapping(autoMap) {
  const out = {};
  for (const [src, { target }] of Object.entries(autoMap)) {
    out[src] = target || '__skip__';
  }
  return out;
}

/**
 * Detect status values from raw data and map to canonical statuses.
 */
export function inferStatus(rawStatus) {
  if (!rawStatus) return 'open';
  const s = String(rawStatus).toLowerCase().trim();

  // Exact match lookup
  const map = {
    open: 'open',
    new: 'open',
    pending: 'pending_approval',
    pending_approval: 'pending_approval',
    approved: 'approved',
    claimed: 'claimed',
    assigned: 'claimed',
    shipped: 'shipped',
    'shipped!': 'shipped',
    'in transit': 'shipped',
    'in_transit': 'shipped',
    delivered: 'delivered',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    blocked: 'blocked',
    rejected: 'rejected',
    closed: 'delivered',
    completed: 'delivered',
    done: 'delivered',
    fulfilled: 'delivered',
    'mark as shipped': 'claimed',
    'not started': 'open',
    'in progress': 'claimed',
    'in_progress': 'claimed',
  };
  if (map[s]) return map[s];

  // Pattern-based matching for freeform status text (e.g. CSV columns
  // like "Click link to mark as shipped or add notes")
  if (s.includes('shipped') || s.includes('sent') || s.includes('mailed')) return 'shipped';
  if (s.includes('deliver') || s.includes('complete') || s.includes('done') || s.includes('fulfill')) return 'delivered';
  if (s.includes('cancel') || s.includes('void')) return 'cancelled';
  if (s.includes('claim') || s.includes('assign') || s.includes('progress')) return 'claimed';
  if (s.includes('approv')) return 'approved';
  if (s.includes('pend') || s.includes('waiting') || s.includes('review')) return 'pending_approval';
  if (s.includes('block') || s.includes('reject') || s.includes('denied')) return 'blocked';

  return 'open';
}

/**
 * Detect urgency values from raw data.
 */
export function inferUrgency(rawUrgency) {
  if (!rawUrgency) return 'normal';
  const u = String(rawUrgency).toLowerCase().trim();
  if (['urgent', 'rush', 'high', 'critical', 'asap', 'yes', 'true', '1'].includes(u)) {
    return 'urgent';
  }
  if (['low', 'no', 'false', '0'].includes(u)) return 'low';
  return 'normal';
}
