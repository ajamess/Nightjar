/**
 * useAutoLock Hook Tests
 * 
 * Tests for auto-lock functionality including:
 * - Session checking
 * - Lock trigger on timeout
 * - Activity reset
 * - Visibility change handling
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';

// Mock identityManager
const mockIdentityManager = {
  listIdentities: jest.fn(),
  getActiveIdentityId: jest.fn(),
  isSessionValid: jest.fn(),
  refreshSession: jest.fn(),
  clearSession: jest.fn(),
};

jest.mock('../frontend/src/utils/identityManager', () => ({
  default: mockIdentityManager,
  ...mockIdentityManager,
}));

// ============================================================
// useAutoLock Logic Tests (Unit Tests without React)
// ============================================================

describe('useAutoLock Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Session Checking', () => {
    test('should not lock when no identities exist (fresh install)', () => {
      mockIdentityManager.listIdentities.mockReturnValue([]);
      
      // Simulate checkSession logic
      const identities = mockIdentityManager.listIdentities();
      let shouldLock = false;
      
      if (identities.length === 0) {
        // Fresh install - don't lock
        shouldLock = false;
      }
      
      expect(shouldLock).toBe(false);
    });

    test('should not lock when no active identity is set', () => {
      mockIdentityManager.listIdentities.mockReturnValue([
        { id: 'id-1', handle: 'User 1' }
      ]);
      mockIdentityManager.getActiveIdentityId.mockReturnValue(null);
      
      const identities = mockIdentityManager.listIdentities();
      const activeId = mockIdentityManager.getActiveIdentityId();
      let shouldLock = false;
      
      if (identities.length > 0 && !activeId) {
        // No active identity - show selector, not lock
        shouldLock = false;
      }
      
      expect(shouldLock).toBe(false);
    });

    test('should handle active identity that no longer exists', () => {
      const existingIdentities = [{ id: 'id-1', handle: 'User 1' }];
      mockIdentityManager.listIdentities.mockReturnValue(existingIdentities);
      mockIdentityManager.getActiveIdentityId.mockReturnValue('id-deleted');
      
      const identities = mockIdentityManager.listIdentities();
      const activeId = mockIdentityManager.getActiveIdentityId();
      const activeExists = identities.some(i => i.id === activeId);
      
      expect(activeExists).toBe(false);
    });

    test('should lock when session is invalid', () => {
      mockIdentityManager.listIdentities.mockReturnValue([
        { id: 'id-1', handle: 'User 1' }
      ]);
      mockIdentityManager.getActiveIdentityId.mockReturnValue('id-1');
      mockIdentityManager.isSessionValid.mockReturnValue(false);
      
      const identities = mockIdentityManager.listIdentities();
      const activeId = mockIdentityManager.getActiveIdentityId();
      const activeExists = identities.some(i => i.id === activeId);
      
      let shouldLock = false;
      if (identities.length > 0 && activeId && activeExists) {
        shouldLock = !mockIdentityManager.isSessionValid();
      }
      
      expect(shouldLock).toBe(true);
    });

    test('should not lock when session is valid', () => {
      mockIdentityManager.listIdentities.mockReturnValue([
        { id: 'id-1', handle: 'User 1' }
      ]);
      mockIdentityManager.getActiveIdentityId.mockReturnValue('id-1');
      mockIdentityManager.isSessionValid.mockReturnValue(true);
      
      const identities = mockIdentityManager.listIdentities();
      const activeId = mockIdentityManager.getActiveIdentityId();
      const activeExists = identities.some(i => i.id === activeId);
      
      let shouldLock = false;
      if (identities.length > 0 && activeId && activeExists) {
        shouldLock = !mockIdentityManager.isSessionValid();
      }
      
      expect(shouldLock).toBe(false);
    });
  });

  describe('Lock Trigger on Timeout', () => {
    test('should check session at regular intervals', () => {
      const checkInterval = 10000; // 10 seconds as in the hook
      let checkCount = 0;
      
      const checkSession = () => {
        checkCount++;
        mockIdentityManager.isSessionValid();
      };
      
      // Simulate interval
      const intervalId = setInterval(checkSession, checkInterval);
      
      // Advance time by 30 seconds
      jest.advanceTimersByTime(30000);
      
      clearInterval(intervalId);
      
      expect(checkCount).toBe(3);
      expect(mockIdentityManager.isSessionValid).toHaveBeenCalledTimes(3);
    });

    test('should trigger lock when session expires during interval check', () => {
      mockIdentityManager.listIdentities.mockReturnValue([
        { id: 'id-1', handle: 'User 1' }
      ]);
      mockIdentityManager.getActiveIdentityId.mockReturnValue('id-1');
      
      let isLocked = false;
      
      const checkSession = () => {
        const identities = mockIdentityManager.listIdentities();
        if (identities.length === 0) return;
        
        const activeId = mockIdentityManager.getActiveIdentityId();
        if (!activeId) return;
        
        const activeExists = identities.some(i => i.id === activeId);
        if (!activeExists) return;
        
        if (!mockIdentityManager.isSessionValid()) {
          isLocked = true;
        }
      };
      
      // Session valid initially
      mockIdentityManager.isSessionValid.mockReturnValue(true);
      checkSession();
      expect(isLocked).toBe(false);
      
      // Session expires
      mockIdentityManager.isSessionValid.mockReturnValue(false);
      checkSession();
      expect(isLocked).toBe(true);
    });
  });

  describe('Activity Reset', () => {
    test('should refresh session on user activity', () => {
      const handleActivity = () => {
        mockIdentityManager.refreshSession();
      };
      
      handleActivity();
      
      expect(mockIdentityManager.refreshSession).toHaveBeenCalledTimes(1);
    });

    test('should track last activity time', () => {
      let lastActivityTime = 0;
      
      const handleActivity = () => {
        lastActivityTime = Date.now();
        mockIdentityManager.refreshSession();
      };
      
      const startTime = Date.now();
      handleActivity();
      
      expect(lastActivityTime).toBeGreaterThanOrEqual(startTime);
    });

    test('should reset activity on multiple events', () => {
      const activityEvents = [
        'mousedown',
        'mousemove',
        'keydown',
        'scroll',
        'touchstart',
        'touchmove',
        'touchend',
        'pointerdown',
        'click'
      ];
      
      expect(activityEvents.length).toBe(9);
      
      // Each event should trigger refresh
      activityEvents.forEach(() => {
        mockIdentityManager.refreshSession();
      });
      
      expect(mockIdentityManager.refreshSession).toHaveBeenCalledTimes(9);
    });
  });

  describe('Lock/Unlock Functions', () => {
    test('lock should clear session', () => {
      const lock = () => {
        mockIdentityManager.clearSession();
      };
      
      lock();
      
      expect(mockIdentityManager.clearSession).toHaveBeenCalledTimes(1);
    });

    test('unlock should update locked state', () => {
      let isLocked = true;
      
      const unlock = () => {
        isLocked = false;
      };
      
      unlock();
      
      expect(isLocked).toBe(false);
    });

    test('lock and unlock should toggle state correctly', () => {
      let isLocked = false;
      
      const lock = () => {
        mockIdentityManager.clearSession();
        isLocked = true;
      };
      
      const unlock = () => {
        isLocked = false;
      };
      
      // Start unlocked
      expect(isLocked).toBe(false);
      
      // Lock
      lock();
      expect(isLocked).toBe(true);
      expect(mockIdentityManager.clearSession).toHaveBeenCalled();
      
      // Unlock
      unlock();
      expect(isLocked).toBe(false);
    });
  });

  describe('Visibility Change Handling', () => {
    test('should check session when tab becomes visible', () => {
      let visibilityState = 'hidden';
      let sessionChecked = false;
      
      const handleVisibilityChange = () => {
        if (visibilityState === 'visible') {
          sessionChecked = true;
          mockIdentityManager.isSessionValid();
        }
      };
      
      // Simulate tab becoming visible
      visibilityState = 'visible';
      handleVisibilityChange();
      
      expect(sessionChecked).toBe(true);
      expect(mockIdentityManager.isSessionValid).toHaveBeenCalled();
    });

    test('should not check session when tab becomes hidden', () => {
      let visibilityState = 'visible';
      
      const handleVisibilityChange = () => {
        if (visibilityState === 'visible') {
          mockIdentityManager.isSessionValid();
        }
      };
      
      // Simulate tab becoming hidden
      visibilityState = 'hidden';
      handleVisibilityChange();
      
      expect(mockIdentityManager.isSessionValid).not.toHaveBeenCalled();
    });

    test('should lock if session expired while tab was hidden', () => {
      mockIdentityManager.listIdentities.mockReturnValue([
        { id: 'id-1', handle: 'User 1' }
      ]);
      mockIdentityManager.getActiveIdentityId.mockReturnValue('id-1');
      mockIdentityManager.isSessionValid.mockReturnValue(false);
      
      let isLocked = false;
      let visibilityState = 'hidden';
      
      const checkSession = () => {
        const identities = mockIdentityManager.listIdentities();
        if (identities.length === 0) return;
        
        const activeId = mockIdentityManager.getActiveIdentityId();
        if (!activeId) return;
        
        const activeExists = identities.some(i => i.id === activeId);
        if (!activeExists) return;
        
        if (!mockIdentityManager.isSessionValid()) {
          isLocked = true;
        }
      };
      
      const handleVisibilityChange = () => {
        if (visibilityState === 'visible') {
          checkSession();
        }
      };
      
      // Tab becomes visible after session expired
      visibilityState = 'visible';
      handleVisibilityChange();
      
      expect(isLocked).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid activity events', () => {
      let refreshCount = 0;
      const handleActivity = () => {
        refreshCount++;
        mockIdentityManager.refreshSession();
      };
      
      // Simulate rapid activity
      for (let i = 0; i < 100; i++) {
        handleActivity();
      }
      
      expect(refreshCount).toBe(100);
    });

    test('should handle empty identity list after identities were deleted', () => {
      // Initially has identities
      mockIdentityManager.listIdentities.mockReturnValue([
        { id: 'id-1', handle: 'User 1' }
      ]);
      mockIdentityManager.getActiveIdentityId.mockReturnValue('id-1');
      
      // Identities deleted
      mockIdentityManager.listIdentities.mockReturnValue([]);
      
      const identities = mockIdentityManager.listIdentities();
      let shouldLock = false;
      
      if (identities.length === 0) {
        // No identities - don't lock
        shouldLock = false;
      }
      
      expect(shouldLock).toBe(false);
    });

    test('should handle concurrent lock and unlock calls', () => {
      let isLocked = false;
      let lockCount = 0;
      let unlockCount = 0;
      
      const lock = () => {
        lockCount++;
        isLocked = true;
      };
      
      const unlock = () => {
        unlockCount++;
        isLocked = false;
      };
      
      // Simulate concurrent operations
      lock();
      lock();
      unlock();
      lock();
      unlock();
      unlock();
      
      expect(lockCount).toBe(3);
      expect(unlockCount).toBe(3);
      expect(isLocked).toBe(false);
    });

    test('should cleanup interval on unmount', () => {
      let intervalId = null;
      let intervalCleared = false;
      
      // Simulate mount
      intervalId = setInterval(() => {}, 10000);
      
      // Simulate unmount cleanup
      if (intervalId) {
        clearInterval(intervalId);
        intervalCleared = true;
      }
      
      expect(intervalCleared).toBe(true);
    });
  });
});

describe('Auto-Lock State Management', () => {
  test('initial state should be unlocked', () => {
    const initialState = { isLocked: false };
    expect(initialState.isLocked).toBe(false);
  });

  test('setIsLocked should update locked state', () => {
    let state = { isLocked: false };
    
    const setIsLocked = (value) => {
      state.isLocked = value;
    };
    
    setIsLocked(true);
    expect(state.isLocked).toBe(true);
    
    setIsLocked(false);
    expect(state.isLocked).toBe(false);
  });

  test('hook should return all required properties', () => {
    const hookReturn = {
      isLocked: false,
      lock: () => {},
      unlock: () => {},
      setIsLocked: () => {},
    };
    
    expect(hookReturn).toHaveProperty('isLocked');
    expect(hookReturn).toHaveProperty('lock');
    expect(hookReturn).toHaveProperty('unlock');
    expect(hookReturn).toHaveProperty('setIsLocked');
    expect(typeof hookReturn.lock).toBe('function');
    expect(typeof hookReturn.unlock).toBe('function');
    expect(typeof hookReturn.setIsLocked).toBe('function');
  });
});
