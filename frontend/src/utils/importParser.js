/**
 * importParser.js
 *
 * Generic CSV / XLSX parsing with header auto-detection.
 * Uses SheetJS (xlsx) for multi-format support.
 *
 * See docs/INVENTORY_SYSTEM_SPEC.md §9.1–9.4
 */

import * as XLSX from 'xlsx';
import { inferStatus } from './importMapper';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a File/Blob into { headers: string[], rows: object[], sheetNames?: string[] }.
 *
 * @param {File} file
 * @param {object} [opts]
 * @param {number}  [opts.headerRow]   – 0-based row index for headers (auto-detect if omitted)
 * @param {string}  [opts.sheetName]   – For multi-sheet XLSX
 * @param {number}  [opts.maxRows]     – Safety cap (default 50 000)
 * @returns {Promise<{ headers: string[], rows: object[], sheetNames: string[] }>}
 */
export async function parseFile(file, opts = {}) {
  const { maxRows = 50_000 } = opts;
  const ext = file.name.split('.').pop().toLowerCase();

  let workbook;
  if (ext === 'csv') {
    const text = await file.text();
    workbook = XLSX.read(text, { type: 'string', raw: false });
  } else {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: 'array', raw: false });
  }

  const sheetNames = workbook.SheetNames;
  const sheetName = opts.sheetName || sheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);

  // Convert to array of arrays
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Detect or use explicit header row
  const headerIdx = opts.headerRow ?? detectHeaderRow(aoa);
  const rawHeaders = (aoa[headerIdx] || []).map(h => normalizeHeader(String(h)));

  // Build rows (objects keyed by normalized header)
  const rows = [];
  for (let i = headerIdx + 1; i < aoa.length && rows.length < maxRows; i++) {
    const row = aoa[i];
    if (isEmptyRow(row)) continue;
    const obj = {};
    rawHeaders.forEach((h, ci) => {
      if (h) {
        const val = row[ci];
        // Preserve numeric values (e.g., Excel serial dates from SheetJS)
        // so downstream parsers like parseDate can handle them correctly.
        // Only coerce non-numeric, non-boolean values to strings.
        if (val == null) {
          obj[h] = '';
        } else if (typeof val === 'number') {
          obj[h] = val;
        } else if (typeof val === 'boolean') {
          obj[h] = val;
        } else {
          obj[h] = String(val).trim();
        }
      }
    });
    rows.push(obj);
  }

  return { headers: rawHeaders.filter(Boolean), rows, sheetNames };
}

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

/**
 * Auto-detect header row: first row where >50 % of cells are non-empty strings.
 */
export function detectHeaderRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i];
    if (!row || row.length === 0) continue;
    const filled = row.filter(c => c != null && String(c).trim() !== '').length;
    if (filled / row.length > 0.5) return i;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHeader(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function isEmptyRow(row) {
  if (!row) return true;
  return row.every(c => c == null || String(c).trim() === '');
}

/**
 * Validate a single parsed row against the column mapping.
 *
 * @param {object} row – raw parsed row
 * @param {object} mapping – { sourceCol: targetField, __defaultItem?, __defaultStatus? }
 * @param {object} catalogLookup – { itemName: catalogItem }
 * @param {object[]} [collaborators] – workspace collaborators for assigned_to validation
 * @returns {{ valid: boolean, warnings: string[], errors: string[], mapped: object }}
 */
export function validateRow(row, mapping, catalogLookup = {}, collaborators = []) {
  const errors = [];
  const warnings = [];

  // Map source → target (skip internal keys prefixed with __)
  // Multiple source columns can map to 'status' — merge them
  const mapped = {};
  const statusSources = [];
  for (const [src, tgt] of Object.entries(mapping)) {
    if (tgt && typeof tgt === 'string' && tgt !== '__skip__' && typeof src === 'string' && !src.startsWith('__')) {
      if (tgt === 'status') {
        // Collect all status source values for merging
        const val = row[src] ?? '';
        if (val) statusSources.push(val);
      } else {
        mapped[tgt] = row[src] ?? '';
      }
    }
  }
  // Merge status sources: pick the most specific non-empty value
  if (statusSources.length > 0) {
    // Prefer a value that looks like a real status (e.g. "Shipped!") over generic text
    let bestStatus = statusSources[0];
    for (const sv of statusSources) {
      const inferred = inferStatus(sv);
      if (inferred !== 'open') {
        bestStatus = sv;
        break;
      }
    }
    mapped.status = bestStatus;
  }

  // Apply defaults from ColumnMapper for fields that weren't mapped or are empty
  if (!mapped.item && mapping.__defaultItem) {
    mapped.item = mapping.__defaultItem;
  }
  if (!mapped.status) {
    mapped.status = mapping.__defaultStatus || 'open';
  }

  // Required: item, quantity
  if (!mapped.item) errors.push('Missing item');
  else if (catalogLookup && Object.keys(catalogLookup).length > 0) {
    const key = String(mapped.item).trim().toLowerCase();
    if (!Object.keys(catalogLookup).some(k => k.toLowerCase() === key)) {
      warnings.push(`Unknown catalog item: "${mapped.item}"`);
    }
  }

  if (!mapped.quantity) {
    errors.push('Missing quantity');
  } else {
    const q = parseInt(mapped.quantity, 10);
    if (isNaN(q) || q <= 0) errors.push(`Invalid quantity: "${mapped.quantity}"`);
  }

  if (mapped.requester_state) {
    // Loose validation — just flag suspicious
    const stateStr = String(mapped.requester_state);
    if (stateStr.length > 2 && stateStr.length < 4) {
      warnings.push(`State may be abbreviated incorrectly: "${mapped.requester_state}"`);
    }
  }

  // Validate assigned_to against collaborators if present
  if (mapped.assigned_to && collaborators.length > 0) {
    const nameToMatch = String(mapped.assigned_to).trim().toLowerCase();
    const match = collaborators.find(c =>
      (c.displayName || '').toLowerCase() === nameToMatch ||
      (c.name || '').toLowerCase() === nameToMatch
    );
    if (!match) {
      warnings.push(`Unknown producer: "${mapped.assigned_to}" — will need manual mapping`);
    }
  }

  return { valid: errors.length === 0, warnings, errors, mapped };
}
