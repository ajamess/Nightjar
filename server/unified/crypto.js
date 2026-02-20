/**
 * Server-side Encryption Module for Yjs Persistence
 * 
 * Encrypts/decrypts Yjs document state before writing to / after reading from SQLite.
 * Port of sidecar/crypto.js adapted for ESM (server uses ES modules).
 * 
 * Uses NaCl secretbox (XSalsa20-Poly1305) — symmetric authenticated encryption.
 * Includes 4KB block padding for traffic analysis resistance.
 * 
 * Wire format: nonce (24 bytes) || ciphertext (padded plaintext + 16 byte MAC)
 * Plaintext format: 4-byte big-endian length prefix || original data || zero padding
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const nacl = require('tweetnacl');

const PADDING_BLOCK_SIZE = 4096; // 4KB blocks for traffic analysis resistance
const MIN_PACKED_LENGTH = nacl.secretbox.nonceLength + nacl.secretbox.overheadLength + 4;
const MAX_UPDATE_SIZE = 100 * 1024 * 1024; // 100MB max

/**
 * Timing-safe comparison of two byte arrays
 * @param {Uint8Array} a - First array
 * @param {Uint8Array} b - Second array
 * @returns {boolean} True if equal
 */
export function timingSafeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
    return false;
  }
  const lengthsMatch = a.length === b.length;
  const compareTo = lengthsMatch ? b : new Uint8Array(a.length);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ compareTo[i];
  }
  return result === 0 && lengthsMatch;
}

/**
 * Validate encryption key
 * @param {Uint8Array} key - Key to validate
 * @returns {boolean} True if valid 32-byte non-zero key
 */
export function isValidKey(key) {
  return (
    key instanceof Uint8Array &&
    key.length === nacl.secretbox.keyLength &&
    !key.every(b => b === 0)
  );
}

/**
 * Securely wipe sensitive data from a Uint8Array
 * @param {Uint8Array} data - Data to wipe
 */
export function secureWipe(data) {
  if (!(data instanceof Uint8Array)) return;
  try {
    const random = nacl.randomBytes(data.length);
    for (let i = 0; i < data.length; i++) data[i] = random[i];
    for (let i = 0; i < data.length; i++) data[i] = 0;
  } catch (err) {
    console.warn('[ServerCrypto] secureWipe failed (data may be frozen):', err.message);
  }
}

/**
 * Encrypts a Yjs state/update with padding.
 * @param {Uint8Array} update The raw Yjs update/state.
 * @param {Uint8Array} key The 256-bit symmetric key.
 * @returns {Uint8Array|null} The packed encrypted data (nonce + ciphertext), or null on error.
 */
export function encryptUpdate(update, key) {
  // Validate inputs
  if (!(update instanceof Uint8Array) || update.length === 0) {
    console.error('[ServerCrypto] Invalid update data');
    return null;
  }
  if (!isValidKey(key)) {
    console.error('[ServerCrypto] Invalid encryption key');
    return null;
  }
  if (update.length > MAX_UPDATE_SIZE) {
    console.error('[ServerCrypto] Update too large');
    return null;
  }

  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  // 1. Calculate padded size (4 bytes length prefix + data, rounded up to block size)
  const minSize = 4 + update.length;
  const paddedSize = Math.ceil(minSize / PADDING_BLOCK_SIZE) * PADDING_BLOCK_SIZE;

  // 2. Create padded buffer with length prefix
  const padded = new Uint8Array(paddedSize);
  const view = new DataView(padded.buffer);
  view.setUint32(0, update.length, false); // Big-endian
  padded.set(update, 4);

  // 3. Encrypt
  const ciphertext = nacl.secretbox(padded, nonce, key);

  // 4. Securely wipe the padded plaintext
  secureWipe(padded);

  // 5. Pack nonce and ciphertext together
  const packed = new Uint8Array(nonce.length + ciphertext.length);
  packed.set(nonce, 0);
  packed.set(ciphertext, nonce.length);

  return packed;
}

/**
 * Decrypts a packed update and removes padding.
 * @param {Uint8Array} packed The encrypted data (nonce + ciphertext).
 * @param {Uint8Array} key The 256-bit symmetric key.
 * @returns {Uint8Array|null} The decrypted Yjs update/state, or null if decryption fails.
 */
export function decryptUpdate(packed, key) {
  try {
    // Validate key
    if (!isValidKey(key)) {
      console.error('[ServerCrypto] Invalid decryption key');
      return null;
    }

    // Ensure packed is a proper Uint8Array (convert from Buffer if needed)
    if (Buffer.isBuffer(packed) || !(packed instanceof Uint8Array)) {
      packed = new Uint8Array(packed);
    }

    // Validate minimum length
    if (packed.length < MIN_PACKED_LENGTH) {
      console.log('[ServerCrypto] Packed data too short');
      return null;
    }

    const nonce = packed.slice(0, nacl.secretbox.nonceLength);
    const ciphertext = packed.slice(nacl.secretbox.nonceLength);

    // 1. Decrypt
    const padded = nacl.secretbox.open(ciphertext, nonce, key);
    if (!padded) {
      console.log('[ServerCrypto] Decryption returned null (wrong key or corrupted data)');
      return null;
    }

    // 2. Unpad - use byteOffset to handle Uint8Array views correctly
    const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
    const originalLength = view.getUint32(0, false); // Big-endian

    // Sanity check
    if (originalLength > padded.byteLength - 4 || originalLength < 0 || originalLength > MAX_UPDATE_SIZE) {
      console.log(`[ServerCrypto] Invalid originalLength: ${originalLength}, padded size: ${padded.byteLength}`);
      return null;
    }

    const update = padded.slice(4, 4 + originalLength);
    console.debug(`[ServerCrypto] Decrypted successfully: ${originalLength} bytes`);

    return update;
  } catch (e) {
    console.error('[ServerCrypto] Decryption failed:', e.message);
    return null;
  }
}

/**
 * Generates a new random key for encryption.
 * @returns {Uint8Array} A 256-bit (32-byte) key.
 */
export function generateKey() {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

/**
 * Convert a base64 string to a Uint8Array key
 * @param {string} base64Key - Base64-encoded key string
 * @returns {Uint8Array|null} The key bytes, or null if invalid
 */
export function keyFromBase64(base64Key) {
  try {
    if (typeof base64Key !== 'string' || base64Key.length === 0) return null;
    const key = new Uint8Array(Buffer.from(base64Key, 'base64'));
    return isValidKey(key) ? key : null;
  } catch {
    return null;
  }
}

export default {
  encryptUpdate,
  decryptUpdate,
  generateKey,
  isValidKey,
  secureWipe,
  timingSafeEqual,
  keyFromBase64,
};
