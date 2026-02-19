/**
 * useFileStorageSync Hook
 * 
 * Observes Yjs shared type changes for file storage and converts to React state.
 * Follows the useInventorySync pattern: observe Yjs → return reactive state.
 * 
 * See docs/FILE_STORAGE_SPEC.md §3, §15.2
 */

import { useState, useEffect, useRef, useMemo } from 'react';

/**
 * Observe a Yjs Map and return its entries as a plain JS object.
 * Uses a ref alongside state so the returned value is immediately consistent
 * when the Yjs Map identity changes (no one-frame stale-data window).
 * @param {import('yjs').Map|null} yMap
 * @returns {Object}
 */
function useYjsMap(yMap) {
  const [, setVersion] = useState(0);
  const yMapRef = useRef(null);
  const dataRef = useRef({});

  // Sync data immediately during render when yMap identity changes
  // to eliminate the stale-data window between yMap becoming non-null
  // and the useEffect firing.
  if (yMap !== yMapRef.current) {
    yMapRef.current = yMap;
    if (yMap) {
      const result = {};
      yMap.forEach((value, key) => { result[key] = value; });
      dataRef.current = result;
    } else {
      dataRef.current = {};
    }
  }

  useEffect(() => {
    if (!yMap) { dataRef.current = {}; setVersion(v => v + 1); return; }

    const sync = () => {
      const result = {};
      yMap.forEach((value, key) => { result[key] = value; });
      dataRef.current = result;
      setVersion(v => v + 1);
    };

    sync();
    yMap.observe(sync);
    return () => yMap.unobserve(sync);
  }, [yMap]);

  return dataRef.current;
}

/**
 * Observe a Yjs Array and return its entries as a plain JS array.
 * Uses a ref alongside state so the returned value is immediately consistent
 * when the Yjs Array identity changes (no one-frame stale-data window).
 * @param {import('yjs').Array|null} yArray
 * @returns {Array}
 */
function useYjsArray(yArray) {
  const [, setVersion] = useState(0);
  const yArrayRef = useRef(null);
  const dataRef = useRef([]);

  // Sync data immediately during render when yArray identity changes
  if (yArray !== yArrayRef.current) {
    yArrayRef.current = yArray;
    if (yArray) {
      dataRef.current = yArray.toArray();
    } else {
      dataRef.current = [];
    }
  }

  useEffect(() => {
    if (!yArray) { dataRef.current = []; setVersion(v => v + 1); return; }

    const sync = () => { dataRef.current = yArray.toArray(); setVersion(v => v + 1); };

    sync();
    yArray.observe(sync);
    return () => yArray.unobserve(sync);
  }, [yArray]);

  return dataRef.current;
}

/**
 * Observe a Yjs Map and return its values as a plain JS array.
 * Each value gets its `id` field set to the map key if not already present.
 * @param {import('yjs').Map|null} yMap
 * @returns {Array}
 */
function useYjsMapAsArray(yMap) {
  const [data, setData] = useState([]);

  useEffect(() => {
    if (!yMap) { setData([]); return; }

    const sync = () => {
      const result = [];
      yMap.forEach((value, key) => {
        result.push({ ...value, id: value.id || key });
      });
      setData(result);
    };

    sync();
    yMap.observe(sync);
    return () => yMap.unobserve(sync);
  }, [yMap]);

  return data;
}

/**
 * Main hook: observe all file storage Yjs shared types and return React state.
 * 
 * @param {Object} params
 * @param {import('yjs').Map|null} params.yFileStorageSystems
 * @param {import('yjs').Array|null} params.yStorageFiles
 * @param {import('yjs').Array|null} params.yStorageFolders
 * @param {import('yjs').Map|null} params.yChunkAvailability
 * @param {import('yjs').Array|null} params.yFileAuditLog
 * @param {string|null} fileStorageId - Filter results to this file storage system
 * @returns {Object} Reactive file storage state
 */
export function useFileStorageSync({
  yFileStorageSystems,
  yStorageFiles,
  yStorageFolders,
  yChunkAvailability,
  yFileAuditLog,
}, fileStorageId) {
  // Observe raw Yjs data
  const fileStorageSystemsMap = useYjsMap(yFileStorageSystems);
  const allStorageFiles = useYjsArray(yStorageFiles);
  const allStorageFolders = useYjsMapAsArray(yStorageFolders);
  const chunkAvailabilityMap = useYjsMap(yChunkAvailability);
  const allAuditLog = useYjsArray(yFileAuditLog);

  // Current file storage system
  const currentSystem = fileStorageId ? fileStorageSystemsMap[fileStorageId] : null;

  // All systems as array
  const fileStorageSystems = useMemo(
    () => Object.values(fileStorageSystemsMap),
    [fileStorageSystemsMap]
  );

  // Filter by current file storage system
  const storageFiles = useMemo(
    () => allStorageFiles.filter(f => f.fileStorageId === fileStorageId),
    [allStorageFiles, fileStorageId]
  );

  const storageFolders = useMemo(
    () => allStorageFolders.filter(f => f.fileStorageId === fileStorageId),
    [allStorageFolders, fileStorageId]
  );

  const auditLog = useMemo(
    () => allAuditLog.filter(e => e.fileStorageId === fileStorageId),
    [allAuditLog, fileStorageId]
  );

  // Active (non-deleted) files
  const activeFiles = useMemo(
    () => storageFiles.filter(f => !f.deletedAt),
    [storageFiles]
  );

  // Trashed files
  const trashedFiles = useMemo(
    () => storageFiles.filter(f => !!f.deletedAt),
    [storageFiles]
  );

  // Active (non-deleted) folders
  const activeFolders = useMemo(
    () => storageFolders.filter(f => !f.deletedAt),
    [storageFolders]
  );

  // Trashed folders
  const trashedFolders = useMemo(
    () => storageFolders.filter(f => !!f.deletedAt),
    [storageFolders]
  );

  // Derived counts
  const totalFileCount = activeFiles.length;
  const totalFolderCount = activeFolders.length;
  const totalSizeBytes = useMemo(
    () => activeFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0),
    [activeFiles]
  );
  const trashedFileCount = trashedFiles.length;

  // Size by category
  const sizeByCategory = useMemo(() => {
    const map = {};
    for (const f of activeFiles) {
      const cat = f.typeCategory || 'other';
      map[cat] = (map[cat] || 0) + (f.sizeBytes || 0);
    }
    return map;
  }, [activeFiles]);

  return {
    // Raw data
    currentSystem,
    fileStorageSystems,
    storageFiles,
    storageFolders,
    activeFiles,
    trashedFiles,
    activeFolders,
    trashedFolders,
    chunkAvailability: chunkAvailabilityMap,
    auditLog,
    // Derived counts
    totalFileCount,
    totalFolderCount,
    totalSizeBytes,
    trashedFileCount,
    sizeByCategory,
    // All raw arrays (for cross-system references)
    allStorageFiles,
    allStorageFolders,
  };
}

export default useFileStorageSync;
