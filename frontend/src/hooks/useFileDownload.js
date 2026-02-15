/**
 * useFileDownload
 * 
 * React hook for downloading files from the file storage system.
 * Retrieves encrypted chunks from IndexedDB (local) or P2P peers,
 * decrypts them, validates hashes, and triggers browser download.
 * 
 * See docs/FILE_STORAGE_SPEC.md §7
 */

import { useState, useCallback, useRef } from 'react';
import { decryptChunk, reassembleFile, toBlob, downloadBlob, sha256 } from '../utils/fileChunking';
import { getChunk } from './useFileUpload';

/**
 * Download states
 */
export const DOWNLOAD_STATUS = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  DECRYPTING: 'decrypting',
  ASSEMBLING: 'assembling',
  COMPLETE: 'complete',
  ERROR: 'error',
};

/**
 * Open the IndexedDB chunk store for a workspace (same as useFileUpload).
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
 * React hook providing file download functionality.
 * 
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {Uint8Array} params.workspaceKey - 32-byte NaCl key
 * @param {function} [params.requestChunkFromPeer] - P2P chunk fetch callback
 * @param {function} [params.addAuditEntry] - from FileStorageContext
 */
export default function useFileDownload({
  workspaceId,
  workspaceKey,
  requestChunkFromPeer,
  addAuditEntry,
}) {
  const [downloads, setDownloads] = useState(new Map()); // downloadId -> state
  const dbRef = useRef(null);
  const downloadIdCounter = useRef(0);

  const getDb = useCallback(async () => {
    if (!dbRef.current && workspaceId) {
      dbRef.current = await openChunkStore(workspaceId);
    }
    return dbRef.current;
  }, [workspaceId]);

  /**
   * Download a file.
   * 
   * @param {object} fileRecord - Yjs file record
   * @param {object} [options] - { skipBrowserDownload: bool }
   * @returns {Promise<{ data: Uint8Array, downloadId: string }>}
   */
  const downloadFile = useCallback(async (fileRecord, options = {}) => {
    const downloadId = `download-${++downloadIdCounter.current}`;
    const { id: fileId, name, chunkCount, chunkHashes, sizeBytes, mimeType } = fileRecord;

    const updateStatus = (status, progress = {}) => {
      setDownloads(prev => {
        const next = new Map(prev);
        next.set(downloadId, {
          downloadId,
          fileId,
          fileName: name,
          fileSize: sizeBytes,
          status,
          chunksDownloaded: 0,
          totalChunks: chunkCount,
          error: null,
          ...progress,
        });
        return next;
      });
    };

    try {
      updateStatus(DOWNLOAD_STATUS.FETCHING);
      
      const db = await getDb();
      const decryptedChunks = [];

      for (let i = 0; i < chunkCount; i++) {
        // Try local IndexedDB first
        let chunkData = await getChunk(db, fileId, i);
        
        // If not available locally, try P2P
        if (!chunkData && requestChunkFromPeer) {
          try {
            chunkData = await requestChunkFromPeer(fileId, i);
            // Store locally for future seeding
            if (chunkData) {
              const tx = db.transaction('chunks', 'readwrite');
              tx.objectStore('chunks').put(chunkData, `${fileId}:${i}`);
            }
          } catch (err) {
            console.warn(`[FileDownload] P2P fetch failed for chunk ${i}:`, err);
          }
        }

        if (!chunkData) {
          throw new Error(`Chunk ${i} not available locally or from peers`);
        }

        // Decrypt
        updateStatus(DOWNLOAD_STATUS.DECRYPTING, {
          chunksDownloaded: i,
          totalChunks: chunkCount,
        });
        
        const decrypted = decryptChunk(chunkData.encrypted, chunkData.nonce, workspaceKey);
        if (!decrypted) {
          throw new Error(`Failed to decrypt chunk ${i} — wrong key?`);
        }

        decryptedChunks.push({ data: decrypted, index: i });
        
        updateStatus(DOWNLOAD_STATUS.FETCHING, {
          chunksDownloaded: i + 1,
          totalChunks: chunkCount,
        });
      }

      // Reassemble
      updateStatus(DOWNLOAD_STATUS.ASSEMBLING, {
        chunksDownloaded: chunkCount,
        totalChunks: chunkCount,
      });
      
      const { data, valid, errors } = await reassembleFile(decryptedChunks, chunkHashes, sizeBytes);
      
      if (!valid) {
        throw new Error(`File integrity check failed: ${errors.join('; ')}`);
      }

      // Trigger browser download unless suppressed
      if (!options.skipBrowserDownload) {
        const blob = toBlob(data, mimeType || 'application/octet-stream');
        downloadBlob(blob, name);
      }

      updateStatus(DOWNLOAD_STATUS.COMPLETE, {
        chunksDownloaded: chunkCount,
        totalChunks: chunkCount,
      });

      if (addAuditEntry) {
        addAuditEntry(
          'file_downloaded',
          'file',
          fileId,
          name,
          `Downloaded ${name}`,
        );
      }

      return { data, downloadId };
    } catch (err) {
      updateStatus(DOWNLOAD_STATUS.ERROR, { error: err.message });
      throw err;
    }
  }, [workspaceId, workspaceKey, requestChunkFromPeer, addAuditEntry, getDb]);

  /**
   * Check which chunks we have locally for a file.
   * @param {string} fileId 
   * @param {number} chunkCount 
   * @returns {Promise<{ available: number[], missing: number[] }>}
   */
  const checkLocalAvailability = useCallback(async (fileId, chunkCount) => {
    const db = await getDb();
    const available = [];
    const missing = [];
    
    for (let i = 0; i < chunkCount; i++) {
      const chunk = await getChunk(db, fileId, i);
      if (chunk) {
        available.push(i);
      } else {
        missing.push(i);
      }
    }
    
    return { available, missing };
  }, [getDb]);

  /** Clear a completed/errored download from state */
  const clearDownload = useCallback((downloadId) => {
    setDownloads(prev => {
      const next = new Map(prev);
      next.delete(downloadId);
      return next;
    });
  }, []);

  return {
    downloadFile,
    checkLocalAvailability,
    downloads: Array.from(downloads.values()),
    clearDownload,
    DOWNLOAD_STATUS,
  };
}
