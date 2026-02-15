/**
 * trackingLinks.js
 * 
 * Utility to auto-detect carrier from tracking numbers and generate tracking URLs.
 * Supports USPS, UPS, FedEx, and DHL.
 *
 * See docs/INVENTORY_SYSTEM_SPEC.md §6.5.4 (Tracking Integration)
 */

/**
 * Carrier detection patterns and URL templates.
 * Order matters — more specific patterns first.
 */
const CARRIERS = [
  {
    name: 'UPS',
    icon: '📦',
    patterns: [
      /^1Z[A-Z0-9]{16}$/i,                    // Standard UPS
      /^T\d{10}$/i,                              // UPS Mail Innovations
    ],
    url: (num) => `https://www.ups.com/track?tracknum=${encodeURIComponent(num)}`,
  },
  {
    name: 'USPS',
    icon: '📬',
    patterns: [
      /^(94|93|92|95)\d{20}$/,                   // USPS 22-digit tracking
      /^(94|93|92|95)\d{18}$/,                   // USPS 20-digit
      /^(70|14|23|03)\d{18}$/,                   // USPS other formats
      /^[A-Z]{2}\d{9}US$/i,                      // USPS international (EMS etc.)
      /^420\d{27}$/,                              // USPS IMpb with ZIP
      /^420\d{5}(91|92|93|94|95)\d{20}$/,        // USPS IMpb full barcode
    ],
    url: (num) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`,
  },
  {
    name: 'FedEx',
    icon: '📦',
    patterns: [
      /^\d{12}$/,                                // FedEx Express 12-digit
      /^\d{15}$/,                                // FedEx Ground 15-digit
      /^\d{20}$/,                                // FedEx 20-digit
      /^\d{22}$/,                                // FedEx SmartPost
    ],
    url: (num) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(num)}`,
  },
  {
    name: 'DHL',
    icon: '📦',
    patterns: [
      /^\d{10}$/,                                // DHL Express 10-digit
      /^[A-Z]{3}\d{7}$/i,                        // DHL eCommerce (3 letters + 7 digits)
      /^JD\d{18}$/i,                             // DHL eCommerce extended
    ],
    url: (num) => `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(num)}`,
  },
];

/**
 * Parse a tracking number and return carrier info + tracking URL.
 * 
 * @param {string} trackingNumber - Raw tracking number string
 * @returns {{ carrier: string, icon: string, url: string } | null} Carrier info or null if unrecognized
 */
export function parseTrackingNumber(trackingNumber) {
  if (!trackingNumber || typeof trackingNumber !== 'string') return null;

  const cleaned = trackingNumber.trim().replace(/[\s-]/g, '');
  if (!cleaned) return null;

  for (const carrier of CARRIERS) {
    for (const pattern of carrier.patterns) {
      if (pattern.test(cleaned)) {
        return {
          carrier: carrier.name,
          icon: carrier.icon,
          url: carrier.url(cleaned),
        };
      }
    }
  }

  return null;
}

/**
 * Build a generic tracking search URL when carrier can't be detected.
 * Searches Google for the tracking number.
 * 
 * @param {string} trackingNumber
 * @returns {string}
 */
export function genericTrackingUrl(trackingNumber) {
  return `https://www.google.com/search?q=track+${encodeURIComponent(trackingNumber)}`;
}

export default parseTrackingNumber;
