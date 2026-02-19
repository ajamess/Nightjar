/**
 * useInventorySync Hook
 * 
 * Observes Yjs shared type changes and converts them to React state arrays/objects.
 * Analogous to how useWorkspaceSync observes workspace-level maps and returns React-friendly state.
 * 
 * Usage: Called inside InventoryDashboard to get reactive state from Yjs shared types.
 * The returned arrays/objects re-render when Yjs data changes.
 * 
 * See docs/INVENTORY_SYSTEM_SPEC.md §11.2.4b
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * Observe a Yjs Map and return its entries as a plain JS object.
 * Uses a ref alongside state so the returned value is immediately consistent
 * when the Yjs Map identity changes (no one-frame stale-data window).
 * @param {Y.Map|null} yMap - Yjs Map to observe
 * @returns {Object} Plain JS object with map entries
 */
function useYjsMap(yMap) {
  const [, setVersion] = useState(0);
  const yMapRef = useRef(null);
  const dataRef = useRef({});

  // CRITICAL FIX: Sync data immediately during render when yMap identity changes.
  // Without this, there is a one-frame window where yMap is non-null but the
  // returned data is still {} (stale initial value), because useEffect runs
  // after paint. Updating dataRef during render ensures consumers see correct
  // data on the same render cycle that the Yjs type becomes available.
  if (yMap !== yMapRef.current) {
    yMapRef.current = yMap;
    if (yMap) {
      const result = {};
      yMap.forEach((value, key) => {
        result[key] = value;
      });
      dataRef.current = result;
    } else {
      dataRef.current = {};
    }
  }

  useEffect(() => {
    if (!yMap) {
      dataRef.current = {};
      setVersion(v => v + 1);
      return;
    }

    // Sync + observe for ongoing changes
    const syncFromMap = () => {
      const result = {};
      yMap.forEach((value, key) => {
        result[key] = value;
      });
      dataRef.current = result;
      setVersion(v => v + 1);
    };

    syncFromMap();

    const observer = () => syncFromMap();
    yMap.observe(observer);

    return () => {
      yMap.unobserve(observer);
    };
  }, [yMap]);

  return dataRef.current;
}

/**
 * Observe a Yjs Array and return its entries as a plain JS array.
 * Uses a ref alongside state so the returned value is immediately consistent
 * when the Yjs Array identity changes (no one-frame stale-data window).
 * @param {Y.Array|null} yArray - Yjs Array to observe
 * @returns {Array} Plain JS array
 */
function useYjsArray(yArray) {
  const [, setVersion] = useState(0);
  const yArrayRef = useRef(null);
  const dataRef = useRef([]);

  // CRITICAL FIX: Same pattern as useYjsMap — sync immediately during render
  // to eliminate the stale-data window between yArray becoming non-null and
  // the useEffect firing.
  if (yArray !== yArrayRef.current) {
    yArrayRef.current = yArray;
    if (yArray) {
      dataRef.current = yArray.toArray();
    } else {
      dataRef.current = [];
    }
  }

  useEffect(() => {
    if (!yArray) {
      dataRef.current = [];
      setVersion(v => v + 1);
      return;
    }

    // Sync + observe for ongoing changes
    const syncFromArray = () => {
      dataRef.current = yArray.toArray();
      setVersion(v => v + 1);
    };

    syncFromArray();

    const observer = () => syncFromArray();
    yArray.observe(observer);

    return () => {
      yArray.unobserve(observer);
    };
  }, [yArray]);

  return dataRef.current;
}

/**
 * Main hook: observe all inventory Yjs shared types and return React state.
 * 
 * @param {Object} params
 * @param {Y.Map} params.yInventorySystems
 * @param {Y.Array} params.yCatalogItems
 * @param {Y.Array} params.yInventoryRequests
 * @param {Y.Map} params.yProducerCapacities
 * @param {Y.Map} params.yAddressReveals
 * @param {Y.Map} params.yPendingAddresses
 * @param {Y.Array} params.yInventoryAuditLog
 * @param {string} inventorySystemId - Filter results to this inventory system
 * @returns {Object} Reactive inventory state
 */
export function useInventorySync({
  yInventorySystems,
  yCatalogItems,
  yInventoryRequests,
  yProducerCapacities,
  yAddressReveals,
  yPendingAddresses,
  yInventoryAuditLog,
}, inventorySystemId) {
  // Observe raw Yjs data
  const inventorySystemsMap = useYjsMap(yInventorySystems);
  const allCatalogItems = useYjsArray(yCatalogItems);
  const allRequests = useYjsArray(yInventoryRequests);
  const producerCapacitiesMap = useYjsMap(yProducerCapacities);
  const addressRevealsMap = useYjsMap(yAddressReveals);
  const pendingAddressesMap = useYjsMap(yPendingAddresses);
  const allAuditLog = useYjsArray(yInventoryAuditLog);

  // Current inventory system
  const currentSystem = useMemo(
    () => inventorySystemId ? inventorySystemsMap[inventorySystemId] : null,
    [inventorySystemsMap, inventorySystemId]
  );

  // All inventory systems as array
  const inventorySystems = useMemo(
    () => Object.values(inventorySystemsMap),
    [inventorySystemsMap]
  );

  // Filter by current inventory system
  const catalogItems = useMemo(
    () => allCatalogItems.filter(item => item.inventorySystemId === inventorySystemId),
    [allCatalogItems, inventorySystemId]
  );

  const requests = useMemo(
    () => allRequests.filter(req => req.inventorySystemId === inventorySystemId),
    [allRequests, inventorySystemId]
  );

  const auditLog = useMemo(
    () => allAuditLog.filter(entry => entry.inventorySystemId === inventorySystemId),
    [allAuditLog, inventorySystemId]
  );

  // Producer capacities for this system (preserved as object keyed by producer public key)
  const producerCapacities = useMemo(
    () => Object.entries(producerCapacitiesMap)
      .filter(([, cap]) => cap.inventorySystemId === inventorySystemId)
      .reduce((acc, [key, val]) => { acc[key] = val; return acc; }, {}),
    [producerCapacitiesMap, inventorySystemId]
  );

  // Address reveals for this system
  const addressReveals = useMemo(
    () => Object.entries(addressRevealsMap)
      .filter(([, reveal]) => reveal.inventorySystemId === inventorySystemId)
      .reduce((acc, [key, val]) => { acc[key] = val; return acc; }, {}),
    [addressRevealsMap, inventorySystemId]
  );

  // Pending addresses for this system (keyed by requestId)
  // Filter by inventorySystemId to match other data types, but also include
  // entries without inventorySystemId for backward compat (older entries)
  const pendingAddresses = useMemo(
    () => Object.entries(pendingAddressesMap)
      .filter(([, val]) => !val.inventorySystemId || val.inventorySystemId === inventorySystemId)
      .reduce((acc, [key, val]) => { acc[key] = val; return acc; }, {}),
    [pendingAddressesMap, inventorySystemId]
  );

  // Ready flag: true when all primary Yjs shared types are available.
  // Consumers should check this before performing mutations on raw Yjs refs.
  const ready = !!(yInventorySystems && yCatalogItems && yInventoryRequests);

  // Derived counts
  const openRequestCount = useMemo(
    () => requests.filter(r => r.status === 'open').length,
    [requests]
  );
  const pendingApprovalCount = useMemo(
    () => requests.filter(r => r.status === 'claimed' || r.status === 'pending_approval').length,
    [requests]
  );
  const activeRequestCount = useMemo(
    () => requests.filter(r => !['cancelled', 'delivered'].includes(r.status)).length,
    [requests]
  );

  return {
    // Readiness flag (false while Yjs types are still null)
    ready,
    // Raw data
    currentSystem,
    inventorySystems,
    catalogItems,
    requests,
    producerCapacities,
    addressReveals,
    pendingAddresses,
    auditLog,
    // Derived counts
    openRequestCount,
    pendingApprovalCount,
    activeRequestCount,
    // All systems map (for sidebar badge counts across systems)
    allRequests,
  };
}

export default useInventorySync;
