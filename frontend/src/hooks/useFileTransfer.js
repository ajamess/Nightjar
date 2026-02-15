/**
 * useFileTransfer
 * 
 * React hook for P2P file chunk distribution.
 * Listens for chunk requests from peers, serves chunks from local IndexedDB,
 * and requests chunks from peers when downloading.
 * 
 * See docs/FILE_STORAGE_SPEC.md §8
 */

import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Open the IndexedDB chunk store for a workspace.
 */
function openChunkStore(workspaceId) {
  return new Promise((resolve, reject) => {
    const dbName = `nightjar-chunks-${workspaceId}`;
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a chunk from local IndexedDB.
 */
function getLocalChunk(db, fileId, chunkIndex) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chunks', 'readonly');
    const store = tx.objectStore('chunks');
    const key = `${fileId}:${chunkIndex}`;
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store a chunk in local IndexedDB (received from peer).
 */
function storeLocalChunk(db, fileId, chunkIndex, chunkData) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    const key = `${fileId}:${chunkIndex}`;
    store.put({ ...chunkData, fileId, chunkIndex }, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.userPublicKey
 * @param {object} params.workspaceProvider - Yjs WebSocket provider (has awareness)
 * @param {function} params.setChunkAvailability - from FileStorageContext
 */
export default function useFileTransfer({
  workspaceId,
  userPublicKey,
  workspaceProvider,
  setChunkAvailability,
}) {
  const dbRef = useRef(null);
  const [transferStats, setTransferStats] = useState({
    chunksServed: 0,
    chunksFetched: 0,
    bytesServed: 0,
    bytesFetched: 0,
  });

  /** Open/get the local chunk store */
  const getDb = useCallback(async () => {
    if (!dbRef.current && workspaceId) {
      dbRef.current = await openChunkStore(workspaceId);
    }
    return dbRef.current;
  }, [workspaceId]);

  /**
   * Handle an incoming chunk request from a peer.
   * Used as a message handler attached to the P2P layer.
   * 
   * @param {{ fileId: string, chunkIndex: number, requestId: string }} request
   * @returns {Promise<{ encrypted: Uint8Array, nonce: Uint8Array } | null>}
   */
  const handleChunkRequest = useCallback(async (request) => {
    try {
      const db = await getDb();
      const chunk = await getLocalChunk(db, request.fileId, request.chunkIndex);
      if (chunk) {
        setTransferStats(prev => ({
          ...prev,
          chunksServed: prev.chunksServed + 1,
          bytesServed: prev.bytesServed + (chunk.encrypted?.length || 0),
        }));
        return {
          encrypted: chunk.encrypted,
          nonce: chunk.nonce,
        };
      }
      return null;
    } catch (err) {
      console.error('[FileTransfer] Error serving chunk:', err);
      return null;
    }
  }, [getDb]);

  /**
   * Request a chunk from peers.
   * Currently uses a simple sequential strategy: try each known holder.
   * 
   * @param {string} fileId
   * @param {number} chunkIndex
   * @param {string[]} [holders] - known peer public keys that have this chunk
   * @returns {Promise<{ encrypted: Uint8Array, nonce: Uint8Array } | null>}
   */
  const requestChunkFromPeer = useCallback(async (fileId, chunkIndex, holders = []) => {
    // In a full implementation, this would send a P2P message to each holder
    // and wait for a response. For now, we check local availability.
    try {
      const db = await getDb();
      const localChunk = await getLocalChunk(db, fileId, chunkIndex);
      if (localChunk) return localChunk;
      
      // TODO: Implement actual P2P chunk request via mesh protocol
      // The message format would be:
      // { type: MESSAGE_TYPES.FILE_CHUNK_REQUEST, fileId, chunkIndex, requestId }
      // Response: { type: MESSAGE_TYPES.FILE_CHUNK_RESPONSE, requestId, encrypted, nonce }
      
      console.warn(`[FileTransfer] Chunk ${chunkIndex} for ${fileId} not available locally or from peers`);
      return null;
    } catch (err) {
      console.error('[FileTransfer] Error requesting chunk:', err);
      return null;
    }
  }, [getDb]);

  /**
   * Announce which chunks we have for a file.
   * Updates the Yjs chunkAvailability map so peers know we can serve them.
   * 
   * @param {string} fileId
   * @param {number} chunkCount
   */
  const announceAvailability = useCallback(async (fileId, chunkCount) => {
    if (!setChunkAvailability || !userPublicKey) return;
    
    const db = await getDb();
    for (let i = 0; i < chunkCount; i++) {
      const chunk = await getLocalChunk(db, fileId, i);
      if (chunk) {
        setChunkAvailability(fileId, i, [userPublicKey]);
      }
    }
  }, [getDb, setChunkAvailability, userPublicKey]);

  /**
   * Check how many chunks we have locally for a given file.
   * @param {string} fileId
   * @param {number} chunkCount
   * @returns {Promise<number>} number of chunks available locally
   */
  const getLocalChunkCount = useCallback(async (fileId, chunkCount) => {
    const db = await getDb();
    let count = 0;
    for (let i = 0; i < chunkCount; i++) {
      const chunk = await getLocalChunk(db, fileId, i);
      if (chunk) count++;
    }
    return count;
  }, [getDb]);

  return {
    handleChunkRequest,
    requestChunkFromPeer,
    announceAvailability,
    getLocalChunkCount,
    transferStats,
  };
}
