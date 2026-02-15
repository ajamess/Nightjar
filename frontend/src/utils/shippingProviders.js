// frontend/src/utils/shippingProviders.js
// Shipping provider configuration for the inventory system.
// Each provider has a URL to open and an address formatter for clipboard.
// Admins can enable/disable providers in InventorySettings.

/**
 * Registry of supported shipping providers.
 * Each entry defines:
 *  - id:          Unique key, stored in settings.enabledShippingProviders
 *  - name:        Display name
 *  - icon:        Emoji icon
 *  - url:         URL to open for label creation
 *  - description: Short admin-facing description
 *  - formatAddress: (address) => string  — formats the address for that provider's paste field
 */
export const SHIPPING_PROVIDERS = [
  {
    id: 'pirateship',
    name: 'PirateShip',
    icon: '🏴‍☠️',
    url: 'https://app.pirateship.com/ship',
    description: 'Discounted USPS & UPS labels',
    formatAddress: (addr) => formatForPirateShip(addr),
  },
  {
    id: 'shippo',
    name: 'Shippo',
    icon: '📦',
    url: 'https://apps.goshippo.com/shipments',
    description: 'Multi-carrier shipping platform',
    formatAddress: (addr) => formatStandard(addr),
  },
  {
    id: 'easypost',
    name: 'EasyPost',
    icon: '⚡',
    url: 'https://www.easypost.com/ship',
    description: 'Developer-friendly shipping API',
    formatAddress: (addr) => formatStandard(addr),
  },
  {
    id: 'stamps',
    name: 'Stamps.com',
    icon: '📬',
    url: 'https://print.stamps.com/SignIn/',
    description: 'USPS postage & labels from your PC',
    formatAddress: (addr) => formatStandard(addr),
  },
];

/**
 * Format an address for PirateShip's "paste an address" field.
 * PirateShip expects: Name\nStreet\nCity, ST ZIP\nCountry
 */
function formatForPirateShip(addr) {
  return [
    addr.fullName || addr.name,
    addr.street1 || addr.line1,
    addr.street2 || addr.line2,
    `${addr.city}, ${addr.state} ${addr.zipCode || addr.zip}`,
    addr.country || 'US',
  ].filter(Boolean).join('\n');
}

/**
 * Standard multi-line address format suitable for most shipping providers.
 */
function formatStandard(addr) {
  return [
    addr.fullName || addr.name,
    addr.street1 || addr.line1,
    addr.street2 || addr.line2,
    `${addr.city}, ${addr.state} ${addr.zipCode || addr.zip}`,
    addr.country || 'US',
    addr.phone ? `Phone: ${addr.phone}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Format address as a single "copy-friendly" block (used by the plain Copy Address button).
 * Includes phone on its own line if present.
 */
export function formatAddressForCopy(addr) {
  return formatStandard(addr);
}

/**
 * Get the subset of providers that are enabled in system settings.
 * If no setting exists, all providers are enabled by default.
 *
 * @param {Object} settings - The currentSystem.settings object
 * @returns {Array} Enabled provider objects
 */
export function getEnabledProviders(settings) {
  const enabledIds = settings?.enabledShippingProviders;
  // If not configured yet (undefined), enable all by default
  if (!enabledIds) return SHIPPING_PROVIDERS;
  // If explicitly set to empty array, no providers shown
  if (!Array.isArray(enabledIds) || enabledIds.length === 0) return [];
  return SHIPPING_PROVIDERS.filter(p => enabledIds.includes(p.id));
}

/**
 * Returns all provider IDs (for settings UI default state).
 */
export function getAllProviderIds() {
  return SHIPPING_PROVIDERS.map(p => p.id);
}
