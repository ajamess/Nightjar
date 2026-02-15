/**
 * FileUpload.jsx
 *
 * Step 1 of the import wizard — drag-drop or browse for CSV/XLSX files.
 * Supports multiple files with automatic merge-by-ID deduplication.
 * Auto-detects header row and previews detected columns.
 *
 * See docs/INVENTORY_SYSTEM_SPEC.md §9.1
 */

import React, { useState, useCallback, useRef } from 'react';

const ACCEPTED = '.csv,.xlsx,.xls';
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB per file

/**
 * Merge multiple parsed results into one. Rows with the same external ID
 * (the column named "id" or "id_number" etc.) are deduplicated by keeping
 * the row with the most non-empty fields. Non-duplicate rows are concatenated.
 */
function mergeResults(results) {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  // Union of all headers
  const headerSet = new Set();
  for (const r of results) {
    for (const h of r.headers) headerSet.add(h);
  }
  const headers = Array.from(headerSet);

  // Find the ID column — look for common normalized names
  const idNames = ['id', 'id_number', 'request_id', 'order_id', 'ref'];
  const idCol = headers.find(h => idNames.includes(h));

  // Merge all rows
  const allRows = [];
  for (const r of results) {
    for (const row of r.rows) allRows.push(row);
  }

  if (!idCol) {
    // No ID column found — just concatenate without dedup
    return { headers, rows: allRows, sheetNames: [], mergeStats: { total: allRows.length, unique: allRows.length, duplicates: 0 } };
  }

  // Deduplicate by ID — keep row with most non-empty fields
  const byId = new Map();
  for (const row of allRows) {
    const id = String(row[idCol] || '').trim();
    if (!id) {
      // No ID — always keep
      if (!byId.has('__no_id__')) byId.set('__no_id__', []);
      byId.get('__no_id__').push(row);
      continue;
    }

    if (!byId.has(id)) {
      byId.set(id, row);
    } else {
      const existing = byId.get(id);
      // If existing is an array (no-id bucket), skip — shouldn't happen
      if (Array.isArray(existing)) continue;

      // Merge: for each field, prefer non-empty values from either row
      const merged = { ...existing };
      for (const key of Object.keys(row)) {
        const val = String(row[key] || '').trim();
        const existingVal = String(merged[key] || '').trim();
        if (val && !existingVal) {
          merged[key] = row[key];
        }
        // If both have values, keep existing (first file wins) unless incoming has more detail
        if (val && existingVal && val.length > existingVal.length) {
          merged[key] = row[key];
        }
      }
      byId.set(id, merged);
    }
  }

  // Flatten back to array
  const mergedRows = [];
  for (const [key, value] of byId) {
    if (key === '__no_id__') {
      mergedRows.push(...value);
    } else {
      mergedRows.push(value);
    }
  }

  const duplicates = allRows.length - mergedRows.length;
  return {
    headers,
    rows: mergedRows,
    sheetNames: [],
    mergeStats: { total: allRows.length, unique: mergedRows.length, duplicates },
  };
}

/**
 * @param {{ onFileLoaded: (file: File|File[], parsed: { headers, rows, sheetNames, mergeStats? }) => void }} props
 */
export default function FileUpload({ onFileLoaded }) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [fileNames, setFileNames] = useState([]);
  const inputRef = useRef(null);

  const handleFiles = useCallback(async (files, sheetName) => {
    setError(null);
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);

    // Validate all files
    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext)) {
        setError(`Unsupported file type: ${file.name}. Please use CSV, XLSX, or XLS.`);
        return;
      }
      if (file.size > MAX_SIZE) {
        setError(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`);
        return;
      }
    }

    setLoading(true);
    setFileNames(fileList.map(f => f.name));
    try {
      const { parseFile } = await import('../../../utils/importParser');

      // Single file with potential multi-sheet
      if (fileList.length === 1) {
        const file = fileList[0];
        const result = await parseFile(file, { sheetName });

        // If multi-sheet XLSX and no sheet was explicitly selected, show selector
        if (!sheetName && result.sheetNames && result.sheetNames.length > 1) {
          setPendingFile(file);
          setSheetNames(result.sheetNames);
          setSelectedSheet(result.sheetNames[0]);
          setLoading(false);
          return;
        }

        setPendingFile(null);
        setSheetNames([]);
        onFileLoaded(file, result);
      } else {
        // Multiple files — parse each and merge
        const results = [];
        for (const file of fileList) {
          const result = await parseFile(file);
          results.push(result);
        }
        const merged = mergeResults(results);
        setPendingFile(null);
        setSheetNames([]);
        onFileLoaded(fileList, merged);
      }
    } catch (err) {
      setError(`Failed to parse file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [onFileLoaded]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files?.length > 0) handleFiles(files);
  }, [handleFiles]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  return (
    <div className="file-upload">
      <div
        className={`fu-dropzone ${dragOver ? 'drag-over' : ''} ${loading ? 'loading' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          onChange={e => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        {loading ? (
          <div className="fu-loading">
            <span className="fu-spinner" />
            <p>Parsing {fileNames.length > 1 ? `${fileNames.length} files` : 'file'}...</p>
          </div>
        ) : (
          <>
            <div className="fu-icon">📁</div>
            <p className="fu-text">Drag & drop files here, or click to browse</p>
            <p className="fu-hint">CSV, XLSX, or XLS — up to 50 MB each — select multiple to merge</p>
          </>
        )}
      </div>

      {error && <p className="fu-error">{error}</p>}

      {/* Sheet selector for multi-sheet XLSX */}
      {sheetNames.length > 1 && pendingFile && (
        <div className="fu-sheet-selector">
          <p>This workbook has multiple sheets. Select which one to import:</p>
          <select value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)}>
            {sheetNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button className="btn-primary btn-sm" onClick={() => handleFiles([pendingFile], selectedSheet)}>
            Import "{selectedSheet}"
          </button>
        </div>
      )}
    </div>
  );
}
