/**
 * Color utility functions for UI theming
 */

/**
 * Ensures color has good contrast with white text by adding a dark overlay
 * @param {string} color - The base color (hex, rgb, etc.)
 * @param {number} overlayOpacity - Opacity of the dark overlay (0-1), default 0.3
 * @returns {string} - CSS background style with layered colors
 */
export function ensureContrastWithWhite(color, overlayOpacity = 0.3) {
    if (!color) return 'transparent';
    
    // Return a CSS background with the color and a dark overlay
    return `linear-gradient(rgba(0, 0, 0, ${overlayOpacity}), rgba(0, 0, 0, ${overlayOpacity})), ${color}`;
}

/**
 * Creates a left-to-right gradient between two colors with dark overlay for contrast
 * @param {string} leftColor - Color on the left side
 * @param {string} rightColor - Color on the right side
 * @param {number} overlayOpacity - Opacity of the dark overlay (0-1), default 0.3
 * @returns {string} - CSS background gradient
 */
export function createColorGradient(leftColor, rightColor, overlayOpacity = 0.3) {
    if (!leftColor && !rightColor) return 'transparent';
    if (!leftColor) return ensureContrastWithWhite(rightColor, overlayOpacity);
    if (!rightColor) return ensureContrastWithWhite(leftColor, overlayOpacity);
    
    // Create gradient with overlay for contrast
    return `
        linear-gradient(rgba(0, 0, 0, ${overlayOpacity}), rgba(0, 0, 0, ${overlayOpacity})),
        linear-gradient(to right, ${leftColor}, ${rightColor})
    `;
}

/**
 * Gets appropriate text color (always white for our use case)
 * @returns {string} - Color value for text
 */
export function getTextColorForBackground() {
    return '#ffffff';
}
