/**
 * tests/tracking-links.test.js
 *
 * Unit tests for trackingLinks.js utility.
 * Covers: parseTrackingNumber (UPS, FedEx, USPS, DHL), genericTrackingUrl.
 */

import { parseTrackingNumber, genericTrackingUrl } from '../frontend/src/utils/trackingLinks';

describe('trackingLinks', () => {
  // ─── UPS ─────────────────────────────────────────────────
  describe('UPS detection', () => {
    it('detects standard UPS tracking (1Z...)', () => {
      const result = parseTrackingNumber('1Z999AA10123456784');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('UPS');
      expect(result.url).toContain('ups.com/track');
    });

    it('detects UPS Mail Innovations (T...)', () => {
      const result = parseTrackingNumber('T1234567890');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('UPS');
    });

    it('is case-insensitive for UPS', () => {
      const result = parseTrackingNumber('1z999aa10123456784');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('UPS');
    });
  });

  // ─── FedEx ───────────────────────────────────────────────
  describe('FedEx detection', () => {
    it('detects FedEx Express 12-digit', () => {
      const result = parseTrackingNumber('123456789012');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('FedEx');
      expect(result.url).toContain('fedex.com');
    });

    it('detects FedEx Ground 15-digit', () => {
      const result = parseTrackingNumber('123456789012345');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('FedEx');
    });

    it('detects FedEx 20-digit', () => {
      const result = parseTrackingNumber('12345678901234567890');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('FedEx');
    });

    it('detects FedEx SmartPost 22-digit', () => {
      // 22-digit all-numeric that doesn't start with USPS prefixes (92/93/94/95)
      const result = parseTrackingNumber('6100000000000000000000');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('FedEx');
    });
  });

  // ─── USPS ────────────────────────────────────────────────
  describe('USPS detection', () => {
    it('detects USPS 22-digit tracking (94...)', () => {
      const result = parseTrackingNumber('9400111899223100000000');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('USPS');
      expect(result.url).toContain('usps.com');
    });

    it('detects USPS 22-digit tracking (92...)', () => {
      const result = parseTrackingNumber('9200000000000000000000');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('USPS');
    });

    it('detects USPS international (EMS)', () => {
      const result = parseTrackingNumber('EA123456789US');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('USPS');
    });

    it('detects USPS IMpb with ZIP (420...)', () => {
      const result = parseTrackingNumber('420123459400111899223100000000');
      // 420 + 5 digits + 22 digits = 30 chars
      // This matches the IMpb full barcode pattern
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('USPS');
    });
  });

  // ─── DHL ─────────────────────────────────────────────────
  describe('DHL detection', () => {
    it('detects DHL Express 10-digit', () => {
      const result = parseTrackingNumber('1234567890');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('DHL');
      expect(result.url).toContain('dhl.com');
    });

    it('detects DHL eCommerce (3 letters + 7 digits)', () => {
      const result = parseTrackingNumber('ABC1234567');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('DHL');
    });

    it('detects DHL eCommerce extended (JD...)', () => {
      const result = parseTrackingNumber('JD012345678901234567');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('DHL');
    });
  });

  // ─── Unrecognized ────────────────────────────────────────
  describe('unrecognized tracking numbers', () => {
    it('returns null for empty string', () => {
      expect(parseTrackingNumber('')).toBeNull();
    });

    it('returns null for null', () => {
      expect(parseTrackingNumber(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parseTrackingNumber(undefined)).toBeNull();
    });

    it('returns null for random text', () => {
      expect(parseTrackingNumber('hello world')).toBeNull();
    });

    it('returns null for short numbers', () => {
      expect(parseTrackingNumber('12345')).toBeNull();
    });
  });

  // ─── Input cleanup ───────────────────────────────────────
  describe('input cleanup', () => {
    it('trims whitespace', () => {
      const result = parseTrackingNumber('  1Z999AA10123456784  ');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('UPS');
    });

    it('strips dashes', () => {
      const result = parseTrackingNumber('1Z-999-AA1-0123-456784');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('UPS');
    });

    it('strips spaces', () => {
      const result = parseTrackingNumber('1Z 999 AA1 0123 456784');
      expect(result).not.toBeNull();
      expect(result.carrier).toBe('UPS');
    });
  });

  // ─── URL encoding ───────────────────────────────────────
  describe('URL generation', () => {
    it('UPS URL is properly encoded', () => {
      const result = parseTrackingNumber('1Z999AA10123456784');
      expect(result.url).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784');
    });

    it('includes icon in result', () => {
      const result = parseTrackingNumber('1Z999AA10123456784');
      expect(result.icon).toBeDefined();
      expect(typeof result.icon).toBe('string');
    });
  });

  // ─── genericTrackingUrl ─────────────────────────────────
  describe('genericTrackingUrl', () => {
    it('returns a Google search URL', () => {
      const url = genericTrackingUrl('UNKNOWN123');
      expect(url).toContain('google.com/search');
      expect(url).toContain('UNKNOWN123');
    });

    it('encodes special characters', () => {
      const url = genericTrackingUrl('TRACK 123&456');
      expect(url).toContain('TRACK');
      expect(url).not.toContain('&456');
      expect(url).toContain(encodeURIComponent('TRACK 123&456'));
    });
  });
});
