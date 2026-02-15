/**
 * tests/shipping-providers.test.js
 *
 * Unit tests for shippingProviders.js utility.
 * Covers: SHIPPING_PROVIDERS registry, formatAddressForCopy, getEnabledProviders, getAllProviderIds.
 */

import {
  SHIPPING_PROVIDERS,
  formatAddressForCopy,
  getEnabledProviders,
  getAllProviderIds,
} from '../frontend/src/utils/shippingProviders';

describe('shippingProviders', () => {
  // ─── Registry ────────────────────────────────────────────
  describe('SHIPPING_PROVIDERS registry', () => {
    it('exports a non-empty array of providers', () => {
      expect(Array.isArray(SHIPPING_PROVIDERS)).toBe(true);
      expect(SHIPPING_PROVIDERS.length).toBeGreaterThanOrEqual(4);
    });

    it('each provider has required fields', () => {
      SHIPPING_PROVIDERS.forEach(p => {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('icon');
        expect(p).toHaveProperty('url');
        expect(p).toHaveProperty('description');
        expect(typeof p.formatAddress).toBe('function');
      });
    });

    it('provider IDs are unique', () => {
      const ids = SHIPPING_PROVIDERS.map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('provider URLs start with https://', () => {
      SHIPPING_PROVIDERS.forEach(p => {
        expect(p.url).toMatch(/^https:\/\//);
      });
    });

    it('includes PirateShip', () => {
      const ps = SHIPPING_PROVIDERS.find(p => p.id === 'pirateship');
      expect(ps).toBeTruthy();
      expect(ps.name).toBe('PirateShip');
    });

    it('includes Shippo', () => {
      const s = SHIPPING_PROVIDERS.find(p => p.id === 'shippo');
      expect(s).toBeTruthy();
      expect(s.name).toBe('Shippo');
    });

    it('includes EasyPost', () => {
      const ep = SHIPPING_PROVIDERS.find(p => p.id === 'easypost');
      expect(ep).toBeTruthy();
      expect(ep.name).toBe('EasyPost');
    });

    it('includes Stamps.com', () => {
      const st = SHIPPING_PROVIDERS.find(p => p.id === 'stamps');
      expect(st).toBeTruthy();
      expect(st.name).toBe('Stamps.com');
    });
  });

  // ─── formatAddress functions ─────────────────────────────
  describe('formatAddress per provider', () => {
    const testAddr = {
      name: 'Jane Doe',
      line1: '123 Main St',
      line2: 'Apt 4',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
      phone: '555-1234',
      country: 'US',
    };

    it('PirateShip formatAddress includes name, street, city/state/zip', () => {
      const ps = SHIPPING_PROVIDERS.find(p => p.id === 'pirateship');
      const result = ps.formatAddress(testAddr);
      expect(result).toContain('Jane Doe');
      expect(result).toContain('123 Main St');
      expect(result).toContain('Portland');
      expect(result).toContain('OR');
      expect(result).toContain('97201');
    });

    it('PirateShip formatAddress includes line2 when present', () => {
      const ps = SHIPPING_PROVIDERS.find(p => p.id === 'pirateship');
      const result = ps.formatAddress(testAddr);
      expect(result).toContain('Apt 4');
    });

    it('PirateShip formatAddress omits line2 when empty', () => {
      const ps = SHIPPING_PROVIDERS.find(p => p.id === 'pirateship');
      const result = ps.formatAddress({ ...testAddr, line2: '' });
      expect(result).not.toContain('\n\n'); // no blank line
    });

    it('Shippo formatAddress includes phone', () => {
      const shippo = SHIPPING_PROVIDERS.find(p => p.id === 'shippo');
      const result = shippo.formatAddress(testAddr);
      expect(result).toContain('555-1234');
    });

    it('EasyPost formatAddress includes all address fields', () => {
      const ep = SHIPPING_PROVIDERS.find(p => p.id === 'easypost');
      const result = ep.formatAddress(testAddr);
      expect(result).toContain('Jane Doe');
      expect(result).toContain('123 Main St');
      expect(result).toContain('Portland, OR 97201');
    });

    it('Stamps formatAddress works with fullName alias', () => {
      const stamps = SHIPPING_PROVIDERS.find(p => p.id === 'stamps');
      const result = stamps.formatAddress({ ...testAddr, fullName: 'John Smith', name: undefined });
      expect(result).toContain('John Smith');
    });

    it('formatAddress handles alternative field names (street1/zipCode)', () => {
      const altAddr = {
        fullName: 'Alt Person',
        street1: '456 Oak Ave',
        street2: '',
        city: 'Seattle',
        state: 'WA',
        zipCode: '98101',
        country: 'US',
      };
      SHIPPING_PROVIDERS.forEach(p => {
        const result = p.formatAddress(altAddr);
        expect(result).toContain('Alt Person');
        expect(result).toContain('456 Oak Ave');
        expect(result).toContain('98101');
      });
    });
  });

  // ─── formatAddressForCopy ────────────────────────────────
  describe('formatAddressForCopy', () => {
    it('returns a multi-line string with all address parts', () => {
      const addr = {
        name: 'Alice',
        line1: '789 Elm St',
        city: 'Denver',
        state: 'CO',
        zip: '80201',
      };
      const result = formatAddressForCopy(addr);
      expect(result).toContain('Alice');
      expect(result).toContain('789 Elm St');
      expect(result).toContain('Denver, CO 80201');
    });

    it('includes phone when provided', () => {
      const addr = {
        name: 'Bob',
        line1: '1 St',
        city: 'NY',
        state: 'NY',
        zip: '10001',
        phone: '212-555-0000',
      };
      const result = formatAddressForCopy(addr);
      expect(result).toContain('Phone: 212-555-0000');
    });

    it('omits phone line when not provided', () => {
      const addr = {
        name: 'Carol',
        line1: '2 Ave',
        city: 'LA',
        state: 'CA',
        zip: '90001',
      };
      const result = formatAddressForCopy(addr);
      expect(result).not.toContain('Phone');
    });

    it('defaults country to US', () => {
      const addr = { name: 'D', line1: '3 Blvd', city: 'X', state: 'TX', zip: '00000' };
      const result = formatAddressForCopy(addr);
      expect(result).toContain('US');
    });
  });

  // ─── getEnabledProviders ─────────────────────────────────
  describe('getEnabledProviders', () => {
    it('returns all providers when settings is undefined', () => {
      const result = getEnabledProviders(undefined);
      expect(result).toEqual(SHIPPING_PROVIDERS);
    });

    it('returns all providers when settings is null', () => {
      const result = getEnabledProviders(null);
      expect(result).toEqual(SHIPPING_PROVIDERS);
    });

    it('returns all providers when enabledShippingProviders is undefined', () => {
      const result = getEnabledProviders({});
      expect(result).toEqual(SHIPPING_PROVIDERS);
    });

    it('returns empty array when enabledShippingProviders is empty', () => {
      const result = getEnabledProviders({ enabledShippingProviders: [] });
      expect(result).toEqual([]);
    });

    it('filters to only enabled providers', () => {
      const result = getEnabledProviders({ enabledShippingProviders: ['pirateship', 'shippo'] });
      expect(result.length).toBe(2);
      expect(result.map(p => p.id)).toEqual(['pirateship', 'shippo']);
    });

    it('ignores unknown provider IDs', () => {
      const result = getEnabledProviders({ enabledShippingProviders: ['pirateship', 'nonexistent'] });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('pirateship');
    });

    it('returns providers in registry order', () => {
      const result = getEnabledProviders({ enabledShippingProviders: ['stamps', 'pirateship'] });
      expect(result[0].id).toBe('pirateship'); // pirateship comes first in registry
      expect(result[1].id).toBe('stamps');
    });
  });

  // ─── getAllProviderIds ───────────────────────────────────
  describe('getAllProviderIds', () => {
    it('returns an array of all provider IDs', () => {
      const ids = getAllProviderIds();
      expect(ids).toContain('pirateship');
      expect(ids).toContain('shippo');
      expect(ids).toContain('easypost');
      expect(ids).toContain('stamps');
    });

    it('returns the same count as SHIPPING_PROVIDERS', () => {
      expect(getAllProviderIds().length).toBe(SHIPPING_PROVIDERS.length);
    });

    it('returns strings only', () => {
      getAllProviderIds().forEach(id => {
        expect(typeof id).toBe('string');
      });
    });
  });
});
