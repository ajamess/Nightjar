/**
 * Tests for UPnP Port Mapping
 * Note: These tests mock the nat-api module since actual UPnP tests require router hardware
 */

// Mock nat-api module - must be before requiring the module under test
const mockMap = jest.fn();
const mockUnmap = jest.fn();
const mockExternalIp = jest.fn();

jest.mock('nat-api', () => {
  return jest.fn().mockImplementation(function() {
    return {
      map: mockMap,
      unmap: mockUnmap,
      externalIp: mockExternalIp
    };
  });
});

const { mapPort, unmapPort, getExternalIP } = require('../sidecar/upnp-mapper');
const NatAPI = require('nat-api');

describe('UPnP Port Mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('mapPort', () => {
    test('successfully maps port when UPnP is available', async () => {
      mockMap.mockImplementation((publicPort, privatePort, callback) => {
        callback(null);
      });
      
      const result = await mapPort(8080, 'Test Service');
      
      expect(result.success).toBe(true);
      expect(result.externalPort).toBe(8080);
      expect(result.error).toBeNull();
      expect(mockMap).toHaveBeenCalledWith(8080, 8080, expect.any(Function));
    });
    
    test('returns failure when UPnP is not available', async () => {
      mockMap.mockImplementation((publicPort, privatePort, callback) => {
        callback(new Error('UPnP not supported'));
      });
      
      const result = await mapPort(8080);
      
      expect(result.success).toBe(false);
      expect(result.externalPort).toBeNull();
      expect(result.error).toBe('UPnP not supported');
    });
    
    test('uses default description if not provided', async () => {
      mockMap.mockImplementation((publicPort, privatePort, callback) => {
        callback(null);
      });
      
      await mapPort(9000);
      
      expect(mockMap).toHaveBeenCalledWith(9000, 9000, expect.any(Function));
    });
  });
  
  describe('unmapPort', () => {
    test('successfully unmaps port', async () => {
      mockUnmap.mockImplementation((publicPort, privatePort, callback) => {
        callback(null);
      });
      
      const result = await unmapPort(8080);
      
      expect(result).toBe(true);
      expect(mockUnmap).toHaveBeenCalledWith(8080, 8080, expect.any(Function));
    });
    
    test('returns false on unmap failure', async () => {
      mockUnmap.mockImplementation((publicPort, privatePort, callback) => {
        callback(new Error('Failed to unmap'));
      });
      
      const result = await unmapPort(8080);
      
      expect(result).toBe(false);
    });
  });
  
  describe('getExternalIP', () => {
    test('returns external IP when UPnP is available', async () => {
      mockExternalIp.mockImplementation((callback) => {
        callback(null, '203.0.113.42');
      });
      
      const ip = await getExternalIP();
      
      expect(ip).toBe('203.0.113.42');
      expect(mockExternalIp).toHaveBeenCalled();
    });
    
    test('returns null when external IP cannot be determined', async () => {
      mockExternalIp.mockImplementation((callback) => {
        callback(new Error('No UPnP gateway'));
      });
      
      const ip = await getExternalIP();
      
      expect(ip).toBeNull();
    });
  });
  
  describe('Integration scenarios', () => {
    test('typical startup sequence - map both WS and WSS ports', async () => {
      mockMap.mockImplementation((publicPort, privatePort, callback) => {
        callback(null);
      });
      mockExternalIp.mockImplementation((callback) => {
        callback(null, '198.51.100.10');
      });
      
      const externalIP = await getExternalIP();
      const wsResult = await mapPort(8080, 'Nightjar WS');
      const wssResult = await mapPort(8443, 'Nightjar WSS');
      
      expect(externalIP).toBe('198.51.100.10');
      expect(wsResult.success).toBe(true);
      expect(wssResult.success).toBe(true);
    });
    
    test('graceful degradation when UPnP unavailable', async () => {
      mockExternalIp.mockImplementation((callback) => {
        callback(new Error('No UPnP'));
      });
      mockMap.mockImplementation((publicPort, privatePort, callback) => {
        callback(new Error('No UPnP'));
      });
      
      const externalIP = await getExternalIP();
      const wsResult = await mapPort(8080);
      
      expect(externalIP).toBeNull();
      expect(wsResult.success).toBe(false);
      // Application should continue without UPnP
    });
  });
});
