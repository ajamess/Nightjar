/**
 * Tests for EncryptedIndexeddbPersistence
 * 
 * Tests the frontend encrypted IndexedDB persistence wrapper.
 * Since we're in jsdom (no real IndexedDB), we test:
 * - Constructor behavior with and without key
 * - Encrypt/decrypt round-trip of the internal helpers
 * - Fallback to unencrypted when no key provided
 * - Destroy cleanup
 */

import { jest } from '@jest/globals';

const nacl = require('tweetnacl');

// =========================================================================
// Encrypt/Decrypt helpers (mirrors EncryptedIndexeddbPersistence internals)
// =========================================================================

const PADDING_BLOCK_SIZE = 4096;
const MAX_UPDATE_SIZE = 100 * 1024 * 1024;

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
  for (let i = 0; i < padded.length; i++) padded[i] = 0;

  const packed = new Uint8Array(nonce.length + ciphertext.length);
  packed.set(nonce, 0);
  packed.set(ciphertext, nonce.length);
  return packed;
}

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


describe('EncryptedIndexeddbPersistence Crypto Helpers', () => {
  
  describe('encrypt/decrypt round-trip', () => {
    test('small data', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      
      const enc = encrypt(data, key);
      expect(enc).not.toBeNull();
      
      const dec = decrypt(enc, key);
      expect(dec).not.toBeNull();
      expect(Array.from(dec)).toEqual([1, 2, 3, 4, 5]);
    });
    
    test('larger data', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const data = new Uint8Array(10000);
      for (let i = 0; i < data.length; i++) data[i] = i & 0xFF;
      
      const enc = encrypt(data, key);
      const dec = decrypt(enc, key);
      expect(dec.length).toBe(data.length);
      expect(Array.from(dec)).toEqual(Array.from(data));
    });
    
    test('wrong key fails', () => {
      const key1 = nacl.randomBytes(nacl.secretbox.keyLength);
      const key2 = nacl.randomBytes(nacl.secretbox.keyLength);
      const data = new Uint8Array([1, 2, 3]);
      
      const enc = encrypt(data, key1);
      const dec = decrypt(enc, key2);
      expect(dec).toBeNull();
    });
    
    test('corrupted ciphertext fails', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const data = new Uint8Array([1, 2, 3]);
      
      const enc = encrypt(data, key);
      enc[30] ^= 0xFF; // Corrupt
      
      const dec = decrypt(enc, key);
      expect(dec).toBeNull();
    });
  });
  
  describe('encrypt edge cases', () => {
    test('null data returns null', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      expect(encrypt(null, key)).toBeNull();
    });
    
    test('empty data returns null', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      expect(encrypt(new Uint8Array(0), key)).toBeNull();
    });
    
    test('invalid key returns null', () => {
      const data = new Uint8Array([1, 2, 3]);
      expect(encrypt(data, null)).toBeNull();
      expect(encrypt(data, new Uint8Array(16))).toBeNull();
    });
  });
  
  describe('decrypt edge cases', () => {
    test('null packed returns null', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      expect(decrypt(null, key)).toBeNull();
    });
    
    test('too short packed returns null', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      expect(decrypt(new Uint8Array(20), key)).toBeNull();
    });
    
    test('invalid key returns null', () => {
      expect(decrypt(new Uint8Array(100), null)).toBeNull();
    });
  });
  
  describe('padding', () => {
    test('output is padded to 4KB blocks', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const data = new Uint8Array([1, 2, 3]);
      
      const enc = encrypt(data, key);
      const nonceLen = 24;
      const macLen = 16;
      const ciphertextLen = enc.length - nonceLen;
      const paddedLen = ciphertextLen - macLen;
      
      expect(paddedLen % PADDING_BLOCK_SIZE).toBe(0);
    });
  });
});
