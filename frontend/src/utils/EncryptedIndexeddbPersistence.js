/**
 * EncryptedIndexeddbPersistence
 * 
 * A wrapper around y-indexeddb's IndexeddbPersistence that encrypts Yjs updates
 * before they are stored in IndexedDB and decrypts them when loaded.
 * 
 * This ensures that browser-side local data is also encrypted at rest,
 * matching the server-side encrypted persistence for a complete E2E encryption story.
 * 
 * Uses NaCl secretbox (XSalsa20-Poly1305) — same algorithm as sidecar and server.
 * 
 * Usage:
 *   import { EncryptedIndexeddbPersistence } from './EncryptedIndexeddbPersistence';
 *   const persistence = new EncryptedIndexeddbPersistence(dbName, ydoc, encryptionKey);
 *   persistence.on('synced', () => { ... });
 *   // ...
 *   persistence.destroy();
 * 
 * When no key is provided, falls back to standard unencrypted IndexeddbPersistence.
 */

import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import nacl from 'tweetnacl';
import { Observable } from 'lib0/observable';

const PADDING_BLOCK_SIZE = 4096;
const MAX_UPDATE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Encrypt a Yjs update/state with NaCl secretbox + 4KB padding
 * @param {Uint8Array} data - Raw data to encrypt
 * @param {Uint8Array} key - 32-byte NaCl key
 * @returns {Uint8Array|null} nonce || ciphertext, or null on error
 */
function encrypt(data, key) {
  if (!(data instanceof Uint8Array) || data.length === 0) return null;
  if (!(key instanceof Uint8Array) || key.length !== nacl.secretbox.keyLength) return null;
  if (data.length > MAX_UPDATE_SIZE) return null;

  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const minSize = 4 + data.length;
  const paddedSize = Math.ceil(minSize / PADDING_BLOCK_SIZE) * PADDING_BLOCK_SIZE;
  const padded = new Uint8Array(paddedSize);
  new DataView(padded.buffer).setUint32(0, data.length, false);
  padded.set(data, 4);

  const ciphertext = nacl.secretbox(padded, nonce, key);
  // Wipe padded plaintext
  for (let i = 0; i < padded.length; i++) padded[i] = 0;

  const packed = new Uint8Array(nonce.length + ciphertext.length);
  packed.set(nonce, 0);
  packed.set(ciphertext, nonce.length);
  return packed;
}

/**
 * Decrypt packed data (nonce || ciphertext) with NaCl secretbox
 * @param {Uint8Array} packed - Encrypted packed data
 * @param {Uint8Array} key - 32-byte NaCl key
 * @returns {Uint8Array|null} Original data, or null on error
 */
function decrypt(packed, key) {
  if (!(packed instanceof Uint8Array)) return null;
  if (!(key instanceof Uint8Array) || key.length !== nacl.secretbox.keyLength) return null;

  const minLen = nacl.secretbox.nonceLength + nacl.secretbox.overheadLength + 4;
  if (packed.length < minLen) return null;

  const nonce = packed.slice(0, nacl.secretbox.nonceLength);
  const ciphertext = packed.slice(nacl.secretbox.nonceLength);

  const padded = nacl.secretbox.open(ciphertext, nonce, key);
  if (!padded) return null;

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  const originalLength = view.getUint32(0, false);

  if (originalLength > padded.byteLength - 4 || originalLength < 0 || originalLength > MAX_UPDATE_SIZE) {
    return null;
  }

  return padded.slice(4, 4 + originalLength);
}

/**
 * EncryptedIndexeddbPersistence
 * 
 * Wraps y-indexeddb's IndexeddbPersistence with transparent encryption.
 * When a key is provided, encrypts the full document state before storing
 * and decrypts when loading.
 * 
 * If no key is provided, behaves identically to IndexeddbPersistence.
 */
export class EncryptedIndexeddbPersistence extends Observable {
  /**
   * @param {string} name - IndexedDB database name
   * @param {Y.Doc} doc - Yjs document
   * @param {Uint8Array|null} encryptionKey - 32-byte NaCl key, or null for unencrypted
   */
  constructor(name, doc, encryptionKey = null) {
    super();
    this.name = name;
    this.doc = doc;
    this._key = encryptionKey;
    this._destroyed = false;
    this.synced = false;

    if (!encryptionKey || !(encryptionKey instanceof Uint8Array) || encryptionKey.length !== nacl.secretbox.keyLength) {
      // No valid key — fall back to standard unencrypted persistence
      this._inner = new IndexeddbPersistence(name, doc);
      this._inner.on('synced', () => {
        this.synced = true;
        this.emit('synced', [this]);
      });
      this.whenSynced = this._inner.whenSynced;
      return;
    }

    // Encrypted mode: use a "shim" IndexedDB database
    // We intercept the state going into and coming out of IndexedDB
    this._inner = null;

    // Create a proxy Y.Doc that stores encrypted data in IndexedDB
    this._proxyDoc = new Y.Doc();
    this._idb = new IndexeddbPersistence(name, this._proxyDoc);

    this.whenSynced = new Promise((resolve) => {
      this._idb.on('synced', () => {
        try {
          // The proxy doc now has the encrypted state from IndexedDB
          // Decrypt it and apply to the real doc
          const encryptedState = Y.encodeStateAsUpdate(this._proxyDoc);
          // Check if the proxy doc has any actual content
          // An empty Y.Doc still encodes to a small state vector
          if (encryptedState.length > 2) {
            // The proxy doc stores a single Y.Map with key 'e' containing the encrypted blob
            const proxyMap = this._proxyDoc.getMap('encrypted');
            const encryptedBlob = proxyMap.get('state');
            if (encryptedBlob && encryptedBlob instanceof Uint8Array) {
              const decrypted = decrypt(encryptedBlob, this._key);
              if (decrypted) {
                Y.applyUpdate(doc, decrypted, 'encrypted-idb-load');
                console.debug(`[EncryptedIDB] Loaded and decrypted state for: ${name}`);
              } else {
                console.warn(`[EncryptedIDB] Failed to decrypt state for: ${name} (wrong key?)`);
              }
            }
          }
        } catch (e) {
          console.error(`[EncryptedIDB] Error loading encrypted state for ${name}:`, e);
        }

        this.synced = true;
        this.emit('synced', [this]);
        resolve(this);
      });
    });

    // Listen for updates on the real doc and persist encrypted snapshots (debounced)
    this._debounceTimer = null;
    this._DEBOUNCE_MS = 1000;

    this._updateHandler = (update, origin) => {
      if (origin === 'encrypted-idb-load') return;
      if (this._destroyed) return;

      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        if (this._destroyed) return;
        this._persistEncryptedState();
      }, this._DEBOUNCE_MS);
    };

    doc.on('update', this._updateHandler);
  }

  /**
   * Encrypt the full document state and store in the proxy doc / IndexedDB
   */
  _persistEncryptedState() {
    if (this._destroyed || !this._key) return;
    try {
      const state = Y.encodeStateAsUpdate(this.doc);
      const encrypted = encrypt(state, this._key);
      if (encrypted) {
        const proxyMap = this._proxyDoc.getMap('encrypted');
        proxyMap.set('state', encrypted);
        // The IndexeddbPersistence on the proxy doc will automatically persist this
      }
    } catch (e) {
      console.error(`[EncryptedIDB] Error persisting encrypted state for ${this.name}:`, e);
    }
  }

  /**
   * Destroy the persistence provider and clean up
   */
  async destroy() {
    this._destroyed = true;

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    if (this._updateHandler) {
      this.doc.off('update', this._updateHandler);
      this._updateHandler = null;
    }

    // Final encrypted persist before destroying
    if (this._key && this._proxyDoc) {
      this._persistEncryptedState();
    }

    if (this._inner) {
      await this._inner.destroy();
    }
    if (this._idb) {
      await this._idb.destroy();
    }
    if (this._proxyDoc) {
      this._proxyDoc.destroy();
    }

    super.destroy();
  }

  /**
   * Clear all stored data (static utility matching y-indexeddb API)
   */
  static clearDocument(name) {
    return IndexeddbPersistence.clearDocument
      ? IndexeddbPersistence.clearDocument(name)
      : new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = resolve;
          req.onerror = resolve;
        });
  }
}

export default EncryptedIndexeddbPersistence;
