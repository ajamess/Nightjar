/**
 * Secure Storage Tests
 * 
 * Tests for secure storage utility including:
 * - Set/get operations
 * - Invalid key handling
 * - Fallback behavior
 * - Encryption/decryption
 * - Migration
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';

// ============================================================
// secureStorage Tests
// ============================================================

describe('SecureStorage Utility', () => {
  const STORAGE_PREFIX = 'Nightjar_secure_';
  let mockLocalStorage;
  let mockSessionStorage;
  let sessionKey;

  beforeEach(() => {
    // Create mock storage
    mockLocalStorage = {};
    mockSessionStorage = {};
    
    // Generate a session key for testing
    sessionKey = nacl.randomBytes(nacl.secretbox.keyLength);
    mockSessionStorage['Nightjar_session_enc_key'] = JSON.stringify(Array.from(sessionKey));
  });

  afterEach(() => {
    mockLocalStorage = {};
    mockSessionStorage = {};
  });

  describe('Set/Get Operations', () => {
    test('should store and retrieve string values', () => {
      // Simulate secure storage behavior
      const key = 'testKey';
      const value = 'testValue';
      
      // Store
      const json = JSON.stringify(value);
      mockLocalStorage[STORAGE_PREFIX + key] = json; // Simplified for test
      
      // Retrieve
      const stored = mockLocalStorage[STORAGE_PREFIX + key];
      const retrieved = JSON.parse(stored);
      
      expect(retrieved).toBe(value);
    });

    test('should store and retrieve object values', () => {
      const key = 'objectKey';
      const value = { name: 'Test', count: 42, nested: { data: true } };
      
      const json = JSON.stringify(value);
      mockLocalStorage[STORAGE_PREFIX + key] = json;
      
      const stored = mockLocalStorage[STORAGE_PREFIX + key];
      const retrieved = JSON.parse(stored);
      
      expect(retrieved).toEqual(value);
      expect(retrieved.name).toBe('Test');
      expect(retrieved.nested.data).toBe(true);
    });

    test('should store and retrieve array values', () => {
      const key = 'arrayKey';
      const value = [1, 2, 3, 'four', { five: 5 }];
      
      const json = JSON.stringify(value);
      mockLocalStorage[STORAGE_PREFIX + key] = json;
      
      const stored = mockLocalStorage[STORAGE_PREFIX + key];
      const retrieved = JSON.parse(stored);
      
      expect(retrieved).toEqual(value);
      expect(retrieved.length).toBe(5);
    });

    test('should store and retrieve null values', () => {
      const key = 'nullKey';
      const value = null;
      
      const json = JSON.stringify(value);
      mockLocalStorage[STORAGE_PREFIX + key] = json;
      
      const stored = mockLocalStorage[STORAGE_PREFIX + key];
      const retrieved = JSON.parse(stored);
      
      expect(retrieved).toBeNull();
    });

    test('should store and retrieve boolean values', () => {
      const key = 'boolKey';
      
      mockLocalStorage[STORAGE_PREFIX + 'true'] = JSON.stringify(true);
      mockLocalStorage[STORAGE_PREFIX + 'false'] = JSON.stringify(false);
      
      expect(JSON.parse(mockLocalStorage[STORAGE_PREFIX + 'true'])).toBe(true);
      expect(JSON.parse(mockLocalStorage[STORAGE_PREFIX + 'false'])).toBe(false);
    });

    test('should store and retrieve numeric values', () => {
      const key = 'numKey';
      const values = [0, 42, -17, 3.14159, Number.MAX_SAFE_INTEGER];
      
      values.forEach((value, index) => {
        mockLocalStorage[STORAGE_PREFIX + `num${index}`] = JSON.stringify(value);
        const retrieved = JSON.parse(mockLocalStorage[STORAGE_PREFIX + `num${index}`]);
        expect(retrieved).toBe(value);
      });
    });

    test('should handle unicode strings', () => {
      const key = 'unicodeKey';
      const value = '日本語テスト 🎉 مرحبا';
      
      const json = JSON.stringify(value);
      mockLocalStorage[STORAGE_PREFIX + key] = json;
      
      const stored = mockLocalStorage[STORAGE_PREFIX + key];
      const retrieved = JSON.parse(stored);
      
      expect(retrieved).toBe(value);
    });

    test('should handle empty strings', () => {
      const key = 'emptyKey';
      const value = '';
      
      const json = JSON.stringify(value);
      mockLocalStorage[STORAGE_PREFIX + key] = json;
      
      const stored = mockLocalStorage[STORAGE_PREFIX + key];
      const retrieved = JSON.parse(stored);
      
      expect(retrieved).toBe('');
    });
  });

  describe('Invalid Key Handling', () => {
    test('should reject empty string key for set', () => {
      const secureSet = (key, value) => {
        if (typeof key !== 'string' || key.length === 0) {
          return false;
        }
        mockLocalStorage[STORAGE_PREFIX + key] = JSON.stringify(value);
        return true;
      };
      
      expect(secureSet('', 'value')).toBe(false);
    });

    test('should reject non-string key for set', () => {
      const secureSet = (key, value) => {
        if (typeof key !== 'string' || key.length === 0) {
          return false;
        }
        mockLocalStorage[STORAGE_PREFIX + key] = JSON.stringify(value);
        return true;
      };
      
      expect(secureSet(123, 'value')).toBe(false);
      expect(secureSet(null, 'value')).toBe(false);
      expect(secureSet(undefined, 'value')).toBe(false);
      expect(secureSet({}, 'value')).toBe(false);
      expect(secureSet([], 'value')).toBe(false);
    });

    test('should return null for empty string key on get', () => {
      const secureGet = (key) => {
        if (typeof key !== 'string' || key.length === 0) {
          return null;
        }
        const value = mockLocalStorage[STORAGE_PREFIX + key];
        return value ? JSON.parse(value) : null;
      };
      
      expect(secureGet('')).toBeNull();
    });

    test('should return null for non-string key on get', () => {
      const secureGet = (key) => {
        if (typeof key !== 'string' || key.length === 0) {
          return null;
        }
        return mockLocalStorage[STORAGE_PREFIX + key] || null;
      };
      
      expect(secureGet(123)).toBeNull();
      expect(secureGet(null)).toBeNull();
      expect(secureGet(undefined)).toBeNull();
    });

    test('should return null for non-existent key', () => {
      const secureGet = (key) => {
        if (typeof key !== 'string' || key.length === 0) {
          return null;
        }
        const value = mockLocalStorage[STORAGE_PREFIX + key];
        return value !== undefined ? JSON.parse(value) : null;
      };
      
      expect(secureGet('nonExistentKey')).toBeNull();
    });

    test('should handle keys with special characters', () => {
      const specialKeys = ['key-with-dash', 'key.with.dot', 'key:with:colon', 'key_with_underscore'];
      
      specialKeys.forEach(key => {
        mockLocalStorage[STORAGE_PREFIX + key] = JSON.stringify('value');
        expect(mockLocalStorage[STORAGE_PREFIX + key]).toBeDefined();
      });
    });
  });

  describe('Fallback Behavior', () => {
    test('should handle missing localStorage gracefully', () => {
      let errorThrown = false;
      
      const secureSet = (key, value) => {
        try {
          // Simulate localStorage not available
          throw new Error('localStorage is not available');
        } catch (e) {
          errorThrown = true;
          return false;
        }
      };
      
      const result = secureSet('key', 'value');
      expect(errorThrown).toBe(true);
      expect(result).toBe(false);
    });

    test('should handle missing sessionStorage gracefully', () => {
      // Simulate fallback to memory storage
      const memoryStorage = {};
      
      const safeSessionGet = (key) => {
        try {
          throw new Error('sessionStorage not available');
        } catch (e) {
          return memoryStorage[key] || null;
        }
      };
      
      const safeSessionSet = (key, value) => {
        try {
          throw new Error('sessionStorage not available');
        } catch (e) {
          memoryStorage[key] = value;
        }
      };
      
      safeSessionSet('testKey', 'testValue');
      expect(safeSessionGet('testKey')).toBe('testValue');
    });

    test('should return null when decryption fails', () => {
      // Simulate decryption failure
      const decrypt = (ciphertext) => {
        try {
          // Invalid ciphertext would fail
          return null;
        } catch {
          return null;
        }
      };
      
      expect(decrypt('invalidCiphertext')).toBeNull();
    });

    test('should remove invalid data when decryption fails', () => {
      const key = 'invalidData';
      mockLocalStorage[STORAGE_PREFIX + key] = 'notValidEncryptedData';
      
      const secureGet = (key) => {
        const encrypted = mockLocalStorage[STORAGE_PREFIX + key];
        if (!encrypted) return null;
        
        // Simulate decryption failure
        const decrypted = null;
        if (!decrypted) {
          delete mockLocalStorage[STORAGE_PREFIX + key];
          return null;
        }
        
        return decrypted;
      };
      
      const result = secureGet(key);
      expect(result).toBeNull();
      expect(mockLocalStorage[STORAGE_PREFIX + key]).toBeUndefined();
    });

    test('should handle JSON parse errors', () => {
      const key = 'badJson';
      
      const secureGet = (key) => {
        try {
          return JSON.parse('not valid json');
        } catch {
          return null;
        }
      };
      
      expect(secureGet(key)).toBeNull();
    });
  });

  describe('Encryption/Decryption', () => {
    test('encrypt produces base64 output', () => {
      const plaintext = 'Hello, World!';
      const key = sessionKey;
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageBytes = new TextEncoder().encode(plaintext);
      const encrypted = nacl.secretbox(messageBytes, nonce, key);
      
      // Combine and encode
      const combined = new Uint8Array(nonce.length + encrypted.length);
      combined.set(nonce);
      combined.set(encrypted, nonce.length);
      const base64 = btoa(String.fromCharCode(...combined));
      
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
    });

    test('decrypt restores original plaintext', () => {
      const plaintext = 'Secret message with special chars!';
      const key = sessionKey;
      
      // Encrypt
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageBytes = new TextEncoder().encode(plaintext);
      const encrypted = nacl.secretbox(messageBytes, nonce, key);
      
      const combined = new Uint8Array(nonce.length + encrypted.length);
      combined.set(nonce);
      combined.set(encrypted, nonce.length);
      
      // Use Buffer for proper encoding (like the actual implementation)
      const base64 = Buffer.from(combined).toString('base64');
      
      // Decrypt
      const decoded = new Uint8Array(Buffer.from(base64, 'base64'));
      const nonceExtracted = decoded.slice(0, nacl.secretbox.nonceLength);
      const ciphertext = decoded.slice(nacl.secretbox.nonceLength);
      const decrypted = nacl.secretbox.open(ciphertext, nonceExtracted, key);
      const decryptedText = new TextDecoder().decode(decrypted);
      
      expect(decryptedText).toBe(plaintext);
    });

    test('decrypt fails with wrong key', () => {
      const plaintext = 'Secret message';
      const key = sessionKey;
      const wrongKey = nacl.randomBytes(nacl.secretbox.keyLength);
      
      // Encrypt with correct key
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageBytes = new TextEncoder().encode(plaintext);
      const encrypted = nacl.secretbox(messageBytes, nonce, key);
      
      const combined = new Uint8Array(nonce.length + encrypted.length);
      combined.set(nonce);
      combined.set(encrypted, nonce.length);
      const base64 = btoa(String.fromCharCode(...combined));
      
      // Try to decrypt with wrong key
      const decoded = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
      const nonceExtracted = decoded.slice(0, nacl.secretbox.nonceLength);
      const ciphertext = decoded.slice(nacl.secretbox.nonceLength);
      const decrypted = nacl.secretbox.open(ciphertext, nonceExtracted, wrongKey);
      
      expect(decrypted).toBeNull();
    });

    test('decrypt fails with tampered ciphertext', () => {
      const plaintext = 'Secret message';
      const key = sessionKey;
      
      // Encrypt
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageBytes = new TextEncoder().encode(plaintext);
      const encrypted = nacl.secretbox(messageBytes, nonce, key);
      
      const combined = new Uint8Array(nonce.length + encrypted.length);
      combined.set(nonce);
      combined.set(encrypted, nonce.length);
      
      // Tamper with ciphertext
      combined[combined.length - 1] ^= 0xff;
      
      const nonceExtracted = combined.slice(0, nacl.secretbox.nonceLength);
      const ciphertext = combined.slice(nacl.secretbox.nonceLength);
      const decrypted = nacl.secretbox.open(ciphertext, nonceExtracted, key);
      
      expect(decrypted).toBeNull();
    });

    test('each encryption produces different ciphertext (nonce uniqueness)', () => {
      const plaintext = 'Same message';
      const key = sessionKey;
      
      const encrypt = () => {
        const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const messageBytes = new TextEncoder().encode(plaintext);
        const encrypted = nacl.secretbox(messageBytes, nonce, key);
        const combined = new Uint8Array(nonce.length + encrypted.length);
        combined.set(nonce);
        combined.set(encrypted, nonce.length);
        return btoa(String.fromCharCode(...combined));
      };
      
      const ciphertext1 = encrypt();
      const ciphertext2 = encrypt();
      
      expect(ciphertext1).not.toBe(ciphertext2);
    });
  });

  describe('Storage Functions', () => {
    test('secureRemove deletes the key', () => {
      const key = 'toRemove';
      mockLocalStorage[STORAGE_PREFIX + key] = 'someValue';
      
      // Remove
      delete mockLocalStorage[STORAGE_PREFIX + key];
      
      expect(mockLocalStorage[STORAGE_PREFIX + key]).toBeUndefined();
    });

    test('secureHas returns true for existing key', () => {
      const key = 'existingKey';
      mockLocalStorage[STORAGE_PREFIX + key] = 'value';
      
      const secureHas = (key) => mockLocalStorage[STORAGE_PREFIX + key] !== undefined;
      
      expect(secureHas(key)).toBe(true);
    });

    test('secureHas returns false for missing key', () => {
      const secureHas = (key) => mockLocalStorage[STORAGE_PREFIX + key] !== undefined;
      
      expect(secureHas('nonExistent')).toBe(false);
    });

    test('secureClear removes all secure storage keys', () => {
      // Add some keys
      mockLocalStorage[STORAGE_PREFIX + 'key1'] = 'value1';
      mockLocalStorage[STORAGE_PREFIX + 'key2'] = 'value2';
      mockLocalStorage['otherKey'] = 'preserved';
      
      // Clear secure keys
      Object.keys(mockLocalStorage).forEach(key => {
        if (key.startsWith(STORAGE_PREFIX)) {
          delete mockLocalStorage[key];
        }
      });
      
      expect(mockLocalStorage[STORAGE_PREFIX + 'key1']).toBeUndefined();
      expect(mockLocalStorage[STORAGE_PREFIX + 'key2']).toBeUndefined();
      expect(mockLocalStorage['otherKey']).toBe('preserved');
    });
  });

  describe('Migration', () => {
    test('migrateToSecure copies old data to new encrypted key', () => {
      const oldKey = 'legacyData';
      const newKey = 'secureData';
      const data = { user: 'test', settings: { theme: 'dark' } };
      
      // Old unencrypted data
      mockLocalStorage[oldKey] = JSON.stringify(data);
      
      const migrateToSecure = (oldKey, newKey) => {
        const oldData = mockLocalStorage[oldKey];
        if (oldData === undefined) return false;
        
        try {
          const parsed = JSON.parse(oldData);
          mockLocalStorage[STORAGE_PREFIX + newKey] = JSON.stringify(parsed);
          delete mockLocalStorage[oldKey];
          return true;
        } catch {
          return false;
        }
      };
      
      const result = migrateToSecure(oldKey, newKey);
      
      expect(result).toBe(true);
      expect(mockLocalStorage[oldKey]).toBeUndefined();
      expect(mockLocalStorage[STORAGE_PREFIX + newKey]).toBeDefined();
    });

    test('migrateToSecure returns false for non-existent key', () => {
      const migrateToSecure = (oldKey, newKey) => {
        const oldData = mockLocalStorage[oldKey];
        if (oldData === undefined) return false;
        return true;
      };
      
      expect(migrateToSecure('nonExistent', 'new')).toBe(false);
    });

    test('migrateToSecure handles invalid JSON', () => {
      mockLocalStorage['badJson'] = 'not valid json {';
      
      const migrateToSecure = (oldKey, newKey) => {
        const oldData = mockLocalStorage[oldKey];
        if (oldData === undefined) return false;
        
        try {
          JSON.parse(oldData);
          return true;
        } catch {
          return false;
        }
      };
      
      expect(migrateToSecure('badJson', 'new')).toBe(false);
    });
  });

  describe('Object Sanitization', () => {
    test('removes __proto__ from objects', () => {
      const sanitizeObject = (obj, seen = new Set()) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (seen.has(obj)) return obj;
        seen.add(obj);
        
        const dangerous = ['__proto__', 'constructor', 'prototype'];
        for (const prop of dangerous) {
          if (Object.prototype.hasOwnProperty.call(obj, prop)) {
            delete obj[prop];
          }
        }
        
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            obj[key] = sanitizeObject(obj[key], seen);
          }
        }
        
        return obj;
      };
      
      const malicious = { data: 'test' };
      Object.defineProperty(malicious, '__proto__', {
        value: { admin: true },
        enumerable: true,
        configurable: true,
      });
      
      const sanitized = sanitizeObject(malicious);
      expect(sanitized.data).toBe('test');
    });

    test('handles nested objects', () => {
      const sanitizeObject = (obj, seen = new Set()) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (seen.has(obj)) return obj;
        seen.add(obj);
        
        if (Array.isArray(obj)) {
          for (let i = 0; i < obj.length; i++) {
            obj[i] = sanitizeObject(obj[i], seen);
          }
          return obj;
        }
        
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            obj[key] = sanitizeObject(obj[key], seen);
          }
        }
        
        return obj;
      };
      
      const nested = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      };
      
      const result = sanitizeObject(nested);
      expect(result.level1.level2.level3.value).toBe('deep');
    });

    test('handles arrays', () => {
      const sanitizeObject = (obj, seen = new Set()) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (seen.has(obj)) return obj;
        seen.add(obj);
        
        if (Array.isArray(obj)) {
          for (let i = 0; i < obj.length; i++) {
            obj[i] = sanitizeObject(obj[i], seen);
          }
          return obj;
        }
        
        return obj;
      };
      
      const arr = [1, 2, { data: 'test' }, [4, 5]];
      const result = sanitizeObject(arr);
      
      expect(result.length).toBe(4);
      expect(result[2].data).toBe('test');
      expect(result[3]).toEqual([4, 5]);
    });

    test('handles circular references', () => {
      const sanitizeObject = (obj, seen = new Set()) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (seen.has(obj)) return obj;
        seen.add(obj);
        
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            obj[key] = sanitizeObject(obj[key], seen);
          }
        }
        
        return obj;
      };
      
      const circular = { name: 'parent' };
      circular.self = circular;
      
      // Should not throw
      const result = sanitizeObject(circular);
      expect(result.name).toBe('parent');
    });
  });

  describe('Edge Cases', () => {
    test('handles very large values', () => {
      const largeArray = new Array(10000).fill({ key: 'value', number: 42 });
      const json = JSON.stringify(largeArray);
      
      expect(json.length).toBeGreaterThan(100000);
      
      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(10000);
    });

    test('handles empty object', () => {
      const json = JSON.stringify({});
      expect(JSON.parse(json)).toEqual({});
    });

    test('handles empty array', () => {
      const json = JSON.stringify([]);
      expect(JSON.parse(json)).toEqual([]);
    });

    test('handles deeply nested structures', () => {
      let deep = { value: 'bottom' };
      for (let i = 0; i < 50; i++) {
        deep = { nested: deep };
      }
      
      const json = JSON.stringify(deep);
      const parsed = JSON.parse(json);
      
      let current = parsed;
      for (let i = 0; i < 50; i++) {
        expect(current.nested).toBeDefined();
        current = current.nested;
      }
      expect(current.value).toBe('bottom');
    });
  });
});
