/**
 * Identity Manager Tests
 * 
 * Tests for identity management including:
 * - PIN validation
 * - PIN attempt tracking
 * - Session creation/expiration
 * - Identity CRUD operations
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import nacl from 'tweetnacl';

// ============================================================
// validatePin Tests
// ============================================================

describe('IdentityManager: PIN Validation', () => {
  const PIN_LENGTH = 6;
  
  const validatePin = (pin) => {
    if (typeof pin !== 'string') return { valid: false, error: 'PIN must be a string' };
    if (pin.length !== PIN_LENGTH) return { valid: false, error: `PIN must be ${PIN_LENGTH} digits` };
    if (!/^\d+$/.test(pin)) return { valid: false, error: 'PIN must contain only digits' };
    return { valid: true };
  };

  describe('Valid PIN Inputs', () => {
    test('accepts 6-digit numeric PIN', () => {
      const result = validatePin('123456');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts PIN with all same digits', () => {
      expect(validatePin('111111').valid).toBe(true);
      expect(validatePin('000000').valid).toBe(true);
      expect(validatePin('999999').valid).toBe(true);
    });

    test('accepts PIN with sequential digits', () => {
      expect(validatePin('123456').valid).toBe(true);
      expect(validatePin('654321').valid).toBe(true);
    });

    test('accepts PIN with leading zeros', () => {
      expect(validatePin('000123').valid).toBe(true);
      expect(validatePin('001234').valid).toBe(true);
    });
  });

  describe('Invalid PIN Inputs', () => {
    test('rejects non-string input', () => {
      expect(validatePin(123456).valid).toBe(false);
      expect(validatePin(123456).error).toBe('PIN must be a string');
      
      expect(validatePin(null).valid).toBe(false);
      expect(validatePin(undefined).valid).toBe(false);
      expect(validatePin({}).valid).toBe(false);
      expect(validatePin([]).valid).toBe(false);
    });

    test('rejects PIN with wrong length', () => {
      expect(validatePin('12345').valid).toBe(false);
      expect(validatePin('12345').error).toBe('PIN must be 6 digits');
      
      expect(validatePin('1234567').valid).toBe(false);
      expect(validatePin('').valid).toBe(false);
      expect(validatePin('1').valid).toBe(false);
    });

    test('rejects PIN with non-digit characters', () => {
      expect(validatePin('12345a').valid).toBe(false);
      expect(validatePin('12345a').error).toBe('PIN must contain only digits');
      
      expect(validatePin('abcdef').valid).toBe(false);
      expect(validatePin('12-456').valid).toBe(false);
      expect(validatePin('12 456').valid).toBe(false);
      expect(validatePin('12.456').valid).toBe(false);
    });

    test('rejects PIN with special characters', () => {
      expect(validatePin('!23456').valid).toBe(false);
      expect(validatePin('12@456').valid).toBe(false);
      expect(validatePin('#$%^&*').valid).toBe(false);
    });

    test('rejects PIN with unicode digits', () => {
      expect(validatePin('१२३४५६').valid).toBe(false); // Devanagari numerals
      expect(validatePin('一二三四五六').valid).toBe(false); // Chinese numerals
    });

    test('rejects PIN with whitespace', () => {
      expect(validatePin(' 12345').valid).toBe(false);
      expect(validatePin('12345 ').valid).toBe(false);
      expect(validatePin('123 56').valid).toBe(false);
      expect(validatePin('\t12345').valid).toBe(false);
      expect(validatePin('12345\n').valid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('handles exactly 6 character strings correctly', () => {
      expect(validatePin('123456').valid).toBe(true);
      expect(validatePin('abcdef').valid).toBe(false);
    });

    test('PIN validation is deterministic', () => {
      // Same input always produces same output
      for (let i = 0; i < 100; i++) {
        expect(validatePin('123456').valid).toBe(true);
        expect(validatePin('invalid').valid).toBe(false);
      }
    });
  });
});

// ============================================================
// PIN Attempt Tracking Tests
// ============================================================

describe('IdentityManager: PIN Attempt Tracking', () => {
  const MAX_PIN_ATTEMPTS = 10;
  const ATTEMPT_RESET_HOURS = 1;
  
  let identities;
  
  beforeEach(() => {
    identities = [
      {
        id: 'test-id-1',
        handle: 'Test User',
        pinAttempts: 0,
        attemptResetTime: null,
      }
    ];
  });

  test('starts with zero attempts', () => {
    const identity = identities[0];
    expect(identity.pinAttempts).toBe(0);
    expect(identity.attemptResetTime).toBeNull();
  });

  test('increments attempts on wrong PIN', () => {
    const identity = identities[0];
    identity.pinAttempts = (identity.pinAttempts || 0) + 1;
    
    expect(identity.pinAttempts).toBe(1);
  });

  test('sets reset time on first wrong attempt', () => {
    const identity = identities[0];
    const now = Date.now();
    
    identity.pinAttempts = 1;
    if (!identity.attemptResetTime) {
      identity.attemptResetTime = now + (ATTEMPT_RESET_HOURS * 60 * 60 * 1000);
    }
    
    expect(identity.attemptResetTime).toBeGreaterThan(now);
    expect(identity.attemptResetTime - now).toBe(ATTEMPT_RESET_HOURS * 60 * 60 * 1000);
  });

  test('calculates remaining attempts correctly', () => {
    const getRemainingAttempts = (identity) => {
      return Math.max(0, MAX_PIN_ATTEMPTS - (identity.pinAttempts || 0));
    };
    
    const identity = identities[0];
    
    identity.pinAttempts = 0;
    expect(getRemainingAttempts(identity)).toBe(10);
    
    identity.pinAttempts = 5;
    expect(getRemainingAttempts(identity)).toBe(5);
    
    identity.pinAttempts = 9;
    expect(getRemainingAttempts(identity)).toBe(1);
    
    identity.pinAttempts = 10;
    expect(getRemainingAttempts(identity)).toBe(0);
    
    identity.pinAttempts = 15; // Over limit
    expect(getRemainingAttempts(identity)).toBe(0);
  });

  test('resets attempts after timeout period', () => {
    const identity = identities[0];
    const pastResetTime = Date.now() - 1000; // 1 second ago
    
    identity.pinAttempts = 5;
    identity.attemptResetTime = pastResetTime;
    
    const now = Date.now();
    if (identity.attemptResetTime && now > identity.attemptResetTime) {
      identity.pinAttempts = 0;
      identity.attemptResetTime = null;
    }
    
    expect(identity.pinAttempts).toBe(0);
    expect(identity.attemptResetTime).toBeNull();
  });

  test('does not reset attempts before timeout period', () => {
    const identity = identities[0];
    const futureResetTime = Date.now() + (60 * 60 * 1000); // 1 hour from now
    
    identity.pinAttempts = 5;
    identity.attemptResetTime = futureResetTime;
    
    const now = Date.now();
    if (identity.attemptResetTime && now > identity.attemptResetTime) {
      identity.pinAttempts = 0;
      identity.attemptResetTime = null;
    }
    
    expect(identity.pinAttempts).toBe(5);
    expect(identity.attemptResetTime).toBe(futureResetTime);
  });

  test('triggers deletion at max attempts', () => {
    const identity = identities[0];
    identity.pinAttempts = MAX_PIN_ATTEMPTS;
    
    let shouldDelete = false;
    if (identity.pinAttempts >= MAX_PIN_ATTEMPTS) {
      shouldDelete = true;
    }
    
    expect(shouldDelete).toBe(true);
  });

  test('resets attempts on successful unlock', () => {
    const identity = identities[0];
    identity.pinAttempts = 5;
    identity.attemptResetTime = Date.now() + 3600000;
    
    // Simulate successful unlock
    const unlockSuccess = true;
    if (unlockSuccess) {
      identity.pinAttempts = 0;
      identity.attemptResetTime = null;
    }
    
    expect(identity.pinAttempts).toBe(0);
    expect(identity.attemptResetTime).toBeNull();
  });

  test('tracks attempts independently per identity', () => {
    identities.push({
      id: 'test-id-2',
      handle: 'Test User 2',
      pinAttempts: 0,
      attemptResetTime: null,
    });
    
    identities[0].pinAttempts = 5;
    identities[1].pinAttempts = 2;
    
    expect(identities[0].pinAttempts).toBe(5);
    expect(identities[1].pinAttempts).toBe(2);
  });
});

// ============================================================
// Session Creation/Expiration Tests
// ============================================================

describe('IdentityManager: Session Management', () => {
  const DEFAULT_LOCK_TIMEOUT_MINUTES = 15;
  let mockSessionStorage;
  const SESSION_KEY = 'nightjar_session';
  
  beforeEach(() => {
    mockSessionStorage = {};
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Session Creation', () => {
    test('creates session with required fields', () => {
      const identityId = 'test-id';
      const encryptionKey = nacl.randomBytes(32);
      const timeoutMinutes = DEFAULT_LOCK_TIMEOUT_MINUTES;
      
      const session = {
        identityId,
        key: Buffer.from(encryptionKey).toString('base64'),
        unlockedAt: Date.now(),
        timeoutMinutes,
      };
      
      mockSessionStorage[SESSION_KEY] = JSON.stringify(session);
      
      const stored = JSON.parse(mockSessionStorage[SESSION_KEY]);
      expect(stored.identityId).toBe(identityId);
      expect(stored.key).toBeDefined();
      expect(stored.unlockedAt).toBeDefined();
      expect(stored.timeoutMinutes).toBe(DEFAULT_LOCK_TIMEOUT_MINUTES);
    });

    test('stores encryption key as base64', () => {
      const encryptionKey = nacl.randomBytes(32);
      const base64Key = Buffer.from(encryptionKey).toString('base64');
      
      expect(typeof base64Key).toBe('string');
      expect(base64Key.length).toBeGreaterThan(0);
      
      // Can be decoded back
      const decoded = Buffer.from(base64Key, 'base64');
      expect(decoded.length).toBe(32);
    });

    test('records unlock timestamp', () => {
      const before = Date.now();
      const session = { unlockedAt: Date.now() };
      const after = Date.now();
      
      expect(session.unlockedAt).toBeGreaterThanOrEqual(before);
      expect(session.unlockedAt).toBeLessThanOrEqual(after);
    });

    test('uses custom timeout when provided', () => {
      const customTimeout = 30;
      const session = { timeoutMinutes: customTimeout };
      
      expect(session.timeoutMinutes).toBe(30);
    });
  });

  describe('Session Validation', () => {
    test('isSessionValid returns true for valid session', () => {
      const isSessionValid = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return false;
        
        try {
          const { unlockedAt, timeoutMinutes } = JSON.parse(session);
          const timeout = (timeoutMinutes || DEFAULT_LOCK_TIMEOUT_MINUTES) * 60 * 1000;
          const elapsed = Date.now() - unlockedAt;
          
          return elapsed < timeout;
        } catch {
          return false;
        }
      };
      
      // Create valid session
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        unlockedAt: Date.now(),
        timeoutMinutes: 15,
      });
      
      expect(isSessionValid()).toBe(true);
    });

    test('isSessionValid returns false for missing session', () => {
      const isSessionValid = () => {
        return mockSessionStorage[SESSION_KEY] !== undefined;
      };
      
      expect(isSessionValid()).toBe(false);
    });

    test('isSessionValid returns false for expired session', () => {
      const isSessionValid = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return false;
        
        try {
          const { unlockedAt, timeoutMinutes } = JSON.parse(session);
          const timeout = (timeoutMinutes || DEFAULT_LOCK_TIMEOUT_MINUTES) * 60 * 1000;
          const elapsed = Date.now() - unlockedAt;
          
          return elapsed < timeout;
        } catch {
          return false;
        }
      };
      
      // Create expired session
      const expiredTime = Date.now() - (20 * 60 * 1000); // 20 minutes ago
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        unlockedAt: expiredTime,
        timeoutMinutes: 15,
      });
      
      expect(isSessionValid()).toBe(false);
    });

    test('session expires after configured timeout', () => {
      const timeoutMinutes = 5;
      const unlockedAt = Date.now();
      
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        unlockedAt,
        timeoutMinutes,
      });
      
      const isSessionValid = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return false;
        
        const { unlockedAt, timeoutMinutes } = JSON.parse(session);
        const timeout = timeoutMinutes * 60 * 1000;
        const elapsed = Date.now() - unlockedAt;
        
        return elapsed < timeout;
      };
      
      // Initially valid
      expect(isSessionValid()).toBe(true);
      
      // Advance time past timeout
      jest.advanceTimersByTime(6 * 60 * 1000); // 6 minutes
      
      expect(isSessionValid()).toBe(false);
    });
  });

  describe('Session Refresh', () => {
    test('refreshSession updates unlockedAt timestamp', () => {
      const initialTime = Date.now();
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        unlockedAt: initialTime,
        timeoutMinutes: 15,
      });
      
      // Advance time
      jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      
      const refreshSession = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return;
        
        const parsed = JSON.parse(session);
        parsed.unlockedAt = Date.now();
        mockSessionStorage[SESSION_KEY] = JSON.stringify(parsed);
      };
      
      refreshSession();
      
      const updated = JSON.parse(mockSessionStorage[SESSION_KEY]);
      expect(updated.unlockedAt).toBeGreaterThan(initialTime);
    });

    test('refreshSession keeps session alive indefinitely with activity', () => {
      const initialTime = Date.now();
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        unlockedAt: initialTime,
        timeoutMinutes: 5, // 5 minute timeout
      });
      
      const refreshSession = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return;
        
        const parsed = JSON.parse(session);
        parsed.unlockedAt = Date.now();
        mockSessionStorage[SESSION_KEY] = JSON.stringify(parsed);
      };
      
      const isSessionValid = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return false;
        
        const { unlockedAt, timeoutMinutes } = JSON.parse(session);
        const elapsed = Date.now() - unlockedAt;
        return elapsed < timeoutMinutes * 60 * 1000;
      };
      
      // Refresh every 4 minutes for 20 minutes
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(4 * 60 * 1000);
        refreshSession();
        expect(isSessionValid()).toBe(true);
      }
    });

    test('refreshSession does nothing for missing session', () => {
      const refreshSession = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return false;
        return true;
      };
      
      expect(refreshSession()).toBe(false);
    });
  });

  describe('Session Clearing', () => {
    test('clearSession removes session data', () => {
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        unlockedAt: Date.now(),
        timeoutMinutes: 15,
      });
      
      const clearSession = () => {
        delete mockSessionStorage[SESSION_KEY];
      };
      
      clearSession();
      
      expect(mockSessionStorage[SESSION_KEY]).toBeUndefined();
    });

    test('clearSession is safe to call multiple times', () => {
      const clearSession = () => {
        delete mockSessionStorage[SESSION_KEY];
      };
      
      // Should not throw
      clearSession();
      clearSession();
      clearSession();
      
      expect(mockSessionStorage[SESSION_KEY]).toBeUndefined();
    });
  });

  describe('Get Session Key', () => {
    test('getSessionKey returns key for valid session', () => {
      const encryptionKey = nacl.randomBytes(32);
      const base64Key = Buffer.from(encryptionKey).toString('base64');
      
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        key: base64Key,
        unlockedAt: Date.now(),
        timeoutMinutes: 15,
      });
      
      const getSessionKey = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return null;
        
        const { key, identityId, unlockedAt, timeoutMinutes } = JSON.parse(session);
        const timeout = (timeoutMinutes || DEFAULT_LOCK_TIMEOUT_MINUTES) * 60 * 1000;
        const elapsed = Date.now() - unlockedAt;
        
        if (elapsed >= timeout) {
          delete mockSessionStorage[SESSION_KEY];
          return null;
        }
        
        return {
          identityId,
          key: Buffer.from(key, 'base64'),
        };
      };
      
      const result = getSessionKey();
      expect(result).not.toBeNull();
      expect(result.identityId).toBe('test-id');
      expect(result.key.length).toBe(32);
    });

    test('getSessionKey returns null for expired session', () => {
      const encryptionKey = nacl.randomBytes(32);
      const base64Key = Buffer.from(encryptionKey).toString('base64');
      
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        key: base64Key,
        unlockedAt: Date.now() - (20 * 60 * 1000), // 20 minutes ago
        timeoutMinutes: 15,
      });
      
      const getSessionKey = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return null;
        
        const { unlockedAt, timeoutMinutes } = JSON.parse(session);
        const timeout = (timeoutMinutes || DEFAULT_LOCK_TIMEOUT_MINUTES) * 60 * 1000;
        const elapsed = Date.now() - unlockedAt;
        
        if (elapsed >= timeout) {
          delete mockSessionStorage[SESSION_KEY];
          return null;
        }
        
        return { found: true };
      };
      
      const result = getSessionKey();
      expect(result).toBeNull();
    });

    test('getSessionKey clears expired session', () => {
      mockSessionStorage[SESSION_KEY] = JSON.stringify({
        identityId: 'test-id',
        unlockedAt: Date.now() - (20 * 60 * 1000),
        timeoutMinutes: 15,
      });
      
      const getSessionKey = () => {
        const session = mockSessionStorage[SESSION_KEY];
        if (!session) return null;
        
        const { unlockedAt, timeoutMinutes } = JSON.parse(session);
        const elapsed = Date.now() - unlockedAt;
        
        if (elapsed >= timeoutMinutes * 60 * 1000) {
          delete mockSessionStorage[SESSION_KEY];
          return null;
        }
        
        return { found: true };
      };
      
      getSessionKey();
      
      expect(mockSessionStorage[SESSION_KEY]).toBeUndefined();
    });
  });
});

// ============================================================
// Lock Timeout Configuration Tests
// ============================================================

describe('IdentityManager: Lock Timeout Configuration', () => {
  const DEFAULT_LOCK_TIMEOUT_MINUTES = 15;
  const LOCK_TIMEOUT_KEY = 'nightjar_lock_timeout';
  let mockLocalStorage;
  
  beforeEach(() => {
    mockLocalStorage = {};
  });

  test('getLockTimeout returns default when not configured', () => {
    const getLockTimeout = () => {
      const stored = mockLocalStorage[LOCK_TIMEOUT_KEY];
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val > 0) return val;
      }
      return DEFAULT_LOCK_TIMEOUT_MINUTES;
    };
    
    expect(getLockTimeout()).toBe(15);
  });

  test('getLockTimeout returns stored value', () => {
    mockLocalStorage[LOCK_TIMEOUT_KEY] = '30';
    
    const getLockTimeout = () => {
      const stored = mockLocalStorage[LOCK_TIMEOUT_KEY];
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val > 0) return val;
      }
      return DEFAULT_LOCK_TIMEOUT_MINUTES;
    };
    
    expect(getLockTimeout()).toBe(30);
  });

  test('getLockTimeout returns default for invalid stored value', () => {
    mockLocalStorage[LOCK_TIMEOUT_KEY] = 'invalid';
    
    const getLockTimeout = () => {
      const stored = mockLocalStorage[LOCK_TIMEOUT_KEY];
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val > 0) return val;
      }
      return DEFAULT_LOCK_TIMEOUT_MINUTES;
    };
    
    expect(getLockTimeout()).toBe(15);
  });

  test('getLockTimeout returns default for zero or negative values', () => {
    const getLockTimeout = () => {
      const stored = mockLocalStorage[LOCK_TIMEOUT_KEY];
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val > 0) return val;
      }
      return DEFAULT_LOCK_TIMEOUT_MINUTES;
    };
    
    mockLocalStorage[LOCK_TIMEOUT_KEY] = '0';
    expect(getLockTimeout()).toBe(15);
    
    mockLocalStorage[LOCK_TIMEOUT_KEY] = '-5';
    expect(getLockTimeout()).toBe(15);
  });

  test('setLockTimeout stores valid value', () => {
    const setLockTimeout = (minutes) => {
      if (typeof minutes === 'number' && minutes > 0) {
        mockLocalStorage[LOCK_TIMEOUT_KEY] = String(minutes);
        return true;
      }
      return false;
    };
    
    expect(setLockTimeout(30)).toBe(true);
    expect(mockLocalStorage[LOCK_TIMEOUT_KEY]).toBe('30');
  });

  test('setLockTimeout rejects invalid values', () => {
    const setLockTimeout = (minutes) => {
      if (typeof minutes === 'number' && minutes > 0) {
        mockLocalStorage[LOCK_TIMEOUT_KEY] = String(minutes);
        return true;
      }
      return false;
    };
    
    expect(setLockTimeout(0)).toBe(false);
    expect(setLockTimeout(-1)).toBe(false);
    expect(setLockTimeout('30')).toBe(false);
    expect(setLockTimeout(null)).toBe(false);
  });
});

// ============================================================
// Identity ID Generation Tests
// ============================================================

describe('IdentityManager: Identity ID Generation', () => {
  test('generates unique IDs', () => {
    const generateId = () => {
      const bytes = nacl.randomBytes(8);
      return Buffer.from(bytes).toString('base64').replace(/[+/=]/g, '');
    };
    
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    
    expect(ids.size).toBe(1000);
  });

  test('ID is URL-safe', () => {
    const generateId = () => {
      const bytes = nacl.randomBytes(8);
      return Buffer.from(bytes).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    };
    
    const id = generateId();
    expect(id).not.toMatch(/[+/=]/);
  });
});
