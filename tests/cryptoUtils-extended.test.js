/**
 * Extended CryptoUtils Test Suite - Coverage Gap Tests
 * 
 * Tests for previously uncovered security-critical functions:
 * - safeJsonParse: Prototype pollution protection
 * - sanitizeObject: Object sanitization
 * - sanitizeId: Path traversal protection
 * - isValidUrl: URL validation / SSRF protection
 * - constantTimeSelect: Timing-safe conditional
 * - ClientRateLimiter: Rate limiting
 * - isValidKey / isValidNonce: Key validation
 * - generateSecureKey / generateSecureNonce: Key generation
 */

import nacl from 'tweetnacl';
import {
  safeJsonParse,
  sanitizeObject,
  sanitizeId,
  isValidUrl,
  constantTimeSelect,
  ClientRateLimiter,
  isValidKey,
  isValidNonce,
  generateSecureKey,
  generateSecureNonce,
  secureWipeString,
} from '../frontend/src/utils/cryptoUtils';

// ============================================================
// safeJsonParse Tests - Prototype Pollution Protection
// ============================================================

describe('CryptoUtils: safeJsonParse', () => {
  test('parses valid JSON', () => {
    const result = safeJsonParse('{"name": "test", "value": 123}');
    expect(result).toEqual({ name: 'test', value: 123 });
  });

  test('returns default value for invalid JSON', () => {
    expect(safeJsonParse('not valid json')).toBeNull();
    expect(safeJsonParse('not valid json', 'default')).toBe('default');
  });

  test('returns default value for non-string input', () => {
    expect(safeJsonParse(123)).toBeNull();
    expect(safeJsonParse(null)).toBeNull();
    expect(safeJsonParse(undefined)).toBeNull();
    expect(safeJsonParse({})).toBeNull();
  });

  test('removes __proto__ pollution attempts', () => {
    const malicious = '{"__proto__": {"polluted": true}}';
    const result = safeJsonParse(malicious);
    expect(result.__proto__).not.toEqual({ polluted: true });
    expect(({}).polluted).toBeUndefined(); // Object prototype not polluted
  });

  test('removes constructor pollution attempts', () => {
    const malicious = '{"constructor": {"polluted": true}}';
    const result = safeJsonParse(malicious);
    expect(result.constructor).not.toEqual({ polluted: true });
  });

  test('removes prototype pollution attempts', () => {
    const malicious = '{"prototype": {"polluted": true}}';
    const result = safeJsonParse(malicious);
    expect(result.prototype).toBeUndefined();
  });

  test('handles nested pollution attempts', () => {
    const malicious = '{"nested": {"__proto__": {"evil": true}}}';
    const result = safeJsonParse(malicious);
    expect(result.nested).toBeDefined();
    expect(({}).evil).toBeUndefined();
  });

  test('parses arrays correctly', () => {
    const result = safeJsonParse('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  test('handles null and primitive values', () => {
    expect(safeJsonParse('null')).toBeNull();
    expect(safeJsonParse('123')).toBe(123);
    expect(safeJsonParse('"string"')).toBe('string');
    expect(safeJsonParse('true')).toBe(true);
  });
});

// ============================================================
// sanitizeObject Tests
// ============================================================

describe('CryptoUtils: sanitizeObject', () => {
  test('removes __proto__ from objects', () => {
    const obj = { name: 'test' };
    Object.defineProperty(obj, '__proto__', { value: { evil: true }, configurable: true });
    const result = sanitizeObject(obj);
    expect(result.name).toBe('test');
  });

  test('removes constructor from objects', () => {
    const obj = { name: 'test', constructor: { evil: true } };
    const result = sanitizeObject(obj);
    expect(result.constructor).not.toEqual({ evil: true });
  });

  test('sanitizes nested objects', () => {
    const obj = {
      level1: {
        level2: {
          data: 'safe',
          prototype: { evil: true }
        }
      }
    };
    const result = sanitizeObject(obj);
    expect(result.level1.level2.data).toBe('safe');
    expect(result.level1.level2.prototype).toBeUndefined();
  });

  test('handles arrays', () => {
    const arr = [{ name: 'item1' }, { name: 'item2' }];
    const result = sanitizeObject(arr);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('item1');
  });

  test('handles arrays with malicious items', () => {
    const arr = [{ prototype: { evil: true } }];
    const result = sanitizeObject(arr);
    expect(result[0].prototype).toBeUndefined();
  });

  test('handles null and primitives gracefully', () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(undefined)).toBeUndefined();
    expect(sanitizeObject('string')).toBe('string');
    expect(sanitizeObject(123)).toBe(123);
    expect(sanitizeObject(true)).toBe(true);
  });

  test('handles circular references without crashing', () => {
    const obj = { name: 'circular' };
    obj.self = obj; // Create circular reference
    
    expect(() => sanitizeObject(obj)).not.toThrow();
  });

  test('does not modify original if already safe', () => {
    const obj = { name: 'safe', value: 42 };
    const result = sanitizeObject(obj);
    expect(result.name).toBe('safe');
    expect(result.value).toBe(42);
  });
});

// ============================================================
// sanitizeId Tests - Path Traversal Protection
// ============================================================

describe('CryptoUtils: sanitizeId', () => {
  test('accepts valid alphanumeric IDs', () => {
    expect(sanitizeId('abc123')).toBe('abc123');
    expect(sanitizeId('ABC123')).toBe('ABC123');
    expect(sanitizeId('test_id')).toBe('test_id');
    expect(sanitizeId('test-id')).toBe('test-id');
    expect(sanitizeId('file.txt')).toBe('file.txt');
  });

  test('rejects non-string input', () => {
    expect(sanitizeId(123)).toBeNull();
    expect(sanitizeId(null)).toBeNull();
    expect(sanitizeId(undefined)).toBeNull();
    expect(sanitizeId({})).toBeNull();
    expect(sanitizeId(['array'])).toBeNull();
  });

  test('rejects empty strings', () => {
    expect(sanitizeId('')).toBeNull();
    expect(sanitizeId('   ')).toBeNull();
  });

  test('rejects overly long IDs', () => {
    const longId = 'a'.repeat(257);
    expect(sanitizeId(longId)).toBeNull();
    
    const okId = 'a'.repeat(256);
    expect(sanitizeId(okId)).toBe(okId);
  });

  test('rejects path traversal attempts', () => {
    expect(sanitizeId('..')).toBeNull();
    expect(sanitizeId('../etc/passwd')).toBeNull();
    expect(sanitizeId('..\\windows\\system32')).toBeNull();
    expect(sanitizeId('foo/../bar')).toBeNull();
    expect(sanitizeId('./test')).toBeNull();
    expect(sanitizeId('test/.hidden')).toBeNull();
  });

  test('rejects special characters', () => {
    expect(sanitizeId('test/id')).toBeNull();
    expect(sanitizeId('test\\id')).toBeNull();
    expect(sanitizeId('test:id')).toBeNull();
    expect(sanitizeId('test*id')).toBeNull();
    expect(sanitizeId('test?id')).toBeNull();
    expect(sanitizeId('test<id>')).toBeNull();
    expect(sanitizeId('test|id')).toBeNull();
    expect(sanitizeId('test"id')).toBeNull();
    expect(sanitizeId("test'id")).toBeNull();
    expect(sanitizeId('test id')).toBeNull(); // spaces
  });

  test('rejects shell injection attempts', () => {
    expect(sanitizeId('$(whoami)')).toBeNull();
    expect(sanitizeId('`ls`')).toBeNull();
    expect(sanitizeId('test;rm -rf /')).toBeNull();
    expect(sanitizeId('test && cat /etc/passwd')).toBeNull();
  });

  test('trims whitespace', () => {
    expect(sanitizeId('  valid  ')).toBe('valid');
  });
});

// ============================================================
// isValidUrl Tests - SSRF Protection
// ============================================================

describe('CryptoUtils: isValidUrl', () => {
  test('accepts valid HTTPS URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path')).toBe(true);
    expect(isValidUrl('https://api.example.com:8443/v1/data')).toBe(true);
  });

  test('rejects HTTP by default', () => {
    expect(isValidUrl('http://example.com')).toBe(false);
  });

  test('accepts HTTP when allowed', () => {
    expect(isValidUrl('http://example.com', ['http:', 'https:'])).toBe(true);
  });

  test('rejects localhost', () => {
    expect(isValidUrl('https://localhost')).toBe(false);
    expect(isValidUrl('https://localhost:8080')).toBe(false);
    expect(isValidUrl('https://LOCALHOST')).toBe(false);
  });

  test('rejects internal IPs (127.x.x.x)', () => {
    expect(isValidUrl('https://127.0.0.1')).toBe(false);
    expect(isValidUrl('https://127.0.0.1:3000')).toBe(false);
    expect(isValidUrl('https://127.1.2.3')).toBe(false);
  });

  test('rejects private network IPs (10.x.x.x)', () => {
    expect(isValidUrl('https://10.0.0.1')).toBe(false);
    expect(isValidUrl('https://10.255.255.255')).toBe(false);
  });

  test('rejects private network IPs (172.16-31.x.x)', () => {
    expect(isValidUrl('https://172.16.0.1')).toBe(false);
    expect(isValidUrl('https://172.31.255.255')).toBe(false);
    // 172.32+ is public
    expect(isValidUrl('https://172.32.0.1')).toBe(true);
  });

  test('rejects private network IPs (192.168.x.x)', () => {
    expect(isValidUrl('https://192.168.0.1')).toBe(false);
    expect(isValidUrl('https://192.168.1.1')).toBe(false);
  });

  test('rejects IPv6 loopback', () => {
    // IPv6 URLs use brackets like [::1] - now properly handled
    expect(isValidUrl('https://[::1]')).toBe(false);
    expect(isValidUrl('https://[::1]:8080')).toBe(false);
  });

  test('rejects 0.0.0.0', () => {
    expect(isValidUrl('https://0.0.0.0')).toBe(false);
  });

  test('rejects link-local IPs (169.254.x.x)', () => {
    expect(isValidUrl('https://169.254.0.1')).toBe(false);
  });

  test('rejects invalid URLs', () => {
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  test('respects allowlist when provided', () => {
    expect(isValidUrl('https://api.example.com', ['https:'], ['api.example.com'])).toBe(true);
    expect(isValidUrl('https://evil.com', ['https:'], ['api.example.com'])).toBe(false);
  });
});

// ============================================================
// constantTimeSelect Tests
// ============================================================

describe('CryptoUtils: constantTimeSelect', () => {
  test('returns a when condition is truthy', () => {
    expect(constantTimeSelect(true, 10, 20)).toBe(10);
    expect(constantTimeSelect(1, 10, 20)).toBe(10);
  });

  test('returns b when condition is falsy', () => {
    expect(constantTimeSelect(false, 10, 20)).toBe(20);
    expect(constantTimeSelect(0, 10, 20)).toBe(20);
  });

  test('works with negative numbers', () => {
    expect(constantTimeSelect(true, -5, -10)).toBe(-5);
    expect(constantTimeSelect(false, -5, -10)).toBe(-10);
  });

  test('works with zero', () => {
    expect(constantTimeSelect(true, 0, 100)).toBe(0);
    expect(constantTimeSelect(false, 0, 100)).toBe(100);
  });
});

// ============================================================
// ClientRateLimiter Tests
// ============================================================

describe('CryptoUtils: ClientRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('allows initial attempts', () => {
    const limiter = new ClientRateLimiter(5, 60000, 300000);
    const result = limiter.check();
    
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBe(5);
    expect(result.lockedFor).toBe(0);
  });

  test('decrements remaining attempts', () => {
    const limiter = new ClientRateLimiter(5, 60000, 300000);
    
    limiter.recordAttempt();
    const result = limiter.check();
    
    expect(result.remainingAttempts).toBe(4);
  });

  test('triggers lockout after max attempts', () => {
    const limiter = new ClientRateLimiter(3, 60000, 300000);
    
    limiter.recordAttempt();
    limiter.recordAttempt();
    limiter.recordAttempt();
    
    const result = limiter.check();
    expect(result.allowed).toBe(false);
    expect(result.remainingAttempts).toBe(0);
    expect(result.lockedFor).toBeGreaterThan(0);
  });

  test('unlocks after lockout period', () => {
    const limiter = new ClientRateLimiter(3, 60000, 300000);
    
    // Trigger lockout
    limiter.recordAttempt();
    limiter.recordAttempt();
    limiter.recordAttempt();
    
    expect(limiter.check().allowed).toBe(false);
    
    // Fast-forward past lockout
    jest.advanceTimersByTime(300001);
    
    // Should be unlocked now (but window also expired)
    const result = limiter.check();
    expect(result.allowed).toBe(true);
  });

  test('clears old attempts outside window', () => {
    const limiter = new ClientRateLimiter(3, 60000, 300000);
    
    limiter.recordAttempt();
    limiter.recordAttempt();
    
    // Fast-forward past window
    jest.advanceTimersByTime(61000);
    
    const result = limiter.check();
    expect(result.remainingAttempts).toBe(3);
  });

  test('reset clears all state', () => {
    const limiter = new ClientRateLimiter(3, 60000, 300000);
    
    // Trigger lockout
    limiter.recordAttempt();
    limiter.recordAttempt();
    limiter.recordAttempt();
    
    expect(limiter.check().allowed).toBe(false);
    
    limiter.reset();
    
    const result = limiter.check();
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBe(3);
  });
});

// ============================================================
// Key and Nonce Validation Tests
// ============================================================

describe('CryptoUtils: Key Validation', () => {
  test('isValidKey accepts valid 32-byte key', () => {
    const key = nacl.randomBytes(32);
    expect(isValidKey(key)).toBe(true);
  });

  test('isValidKey rejects wrong length', () => {
    expect(isValidKey(nacl.randomBytes(16))).toBe(false);
    expect(isValidKey(nacl.randomBytes(64))).toBe(false);
  });

  test('isValidKey rejects non-Uint8Array', () => {
    expect(isValidKey('not an array')).toBe(false);
    expect(isValidKey([1, 2, 3])).toBe(false);
    expect(isValidKey(null)).toBe(false);
    expect(isValidKey(undefined)).toBe(false);
  });

  test('isValidKey rejects all-zero key', () => {
    const zeroKey = new Uint8Array(32);
    expect(isValidKey(zeroKey)).toBe(false);
  });

  test('isValidKey accepts custom length', () => {
    const key = nacl.randomBytes(16);
    expect(isValidKey(key, 16)).toBe(true);
  });
});

describe('CryptoUtils: Nonce Validation', () => {
  test('isValidNonce accepts valid 24-byte nonce', () => {
    const nonce = nacl.randomBytes(24);
    expect(isValidNonce(nonce)).toBe(true);
  });

  test('isValidNonce rejects wrong length', () => {
    expect(isValidNonce(nacl.randomBytes(16))).toBe(false);
    expect(isValidNonce(nacl.randomBytes(32))).toBe(false);
  });

  test('isValidNonce rejects non-Uint8Array', () => {
    expect(isValidNonce('not an array')).toBe(false);
    expect(isValidNonce(null)).toBe(false);
  });
});

// ============================================================
// Key Generation Tests
// ============================================================

describe('CryptoUtils: Key Generation', () => {
  test('generateSecureKey creates 32-byte key by default', () => {
    const key = generateSecureKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  test('generateSecureKey creates custom length key', () => {
    const key = generateSecureKey(64);
    expect(key.length).toBe(64);
  });

  test('generateSecureKey produces unique keys', () => {
    const key1 = generateSecureKey();
    const key2 = generateSecureKey();
    
    // Extremely unlikely to be equal (2^256 possibilities)
    let equal = true;
    for (let i = 0; i < key1.length; i++) {
      if (key1[i] !== key2[i]) {
        equal = false;
        break;
      }
    }
    expect(equal).toBe(false);
  });

  test('generateSecureNonce creates 24-byte nonce', () => {
    const nonce = generateSecureNonce();
    expect(nonce).toBeInstanceOf(Uint8Array);
    expect(nonce.length).toBe(24);
  });

  test('generateSecureNonce produces unique nonces', () => {
    const nonce1 = generateSecureNonce();
    const nonce2 = generateSecureNonce();
    
    let equal = true;
    for (let i = 0; i < nonce1.length; i++) {
      if (nonce1[i] !== nonce2[i]) {
        equal = false;
        break;
      }
    }
    expect(equal).toBe(false);
  });
});

// ============================================================
// secureWipeString Tests
// ============================================================

describe('CryptoUtils: secureWipeString', () => {
  test('wipes string property on object', () => {
    const obj = { secret: 'sensitive-data', other: 'keep-this' };
    secureWipeString(obj, 'secret');
    
    expect(obj.secret).toBe('');
    expect(obj.other).toBe('keep-this');
  });

  test('handles missing property gracefully', () => {
    const obj = { other: 'value' };
    expect(() => secureWipeString(obj, 'nonexistent')).not.toThrow();
  });

  test('handles null object gracefully', () => {
    expect(() => secureWipeString(null, 'key')).not.toThrow();
  });

  test('handles non-string property gracefully', () => {
    const obj = { number: 123 };
    expect(() => secureWipeString(obj, 'number')).not.toThrow();
    expect(obj.number).toBe(123); // unchanged
  });
});
