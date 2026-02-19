import { useState, useEffect, useCallback } from 'react';

// Hook for tracking author attribution in collaborative editing
export function useAuthorAttribution(provider, userHandle, userColor) {
    const [authors, setAuthors] = useState([]);
    const [showTooltips, setShowTooltips] = useState(true);
    const [showColorCoding, setShowColorCoding] = useState(false);

    // Update awareness with current user info
    useEffect(() => {
        if (provider && userHandle) {
            provider.awareness.setLocalStateField('user', {
                name: userHandle,
                color: userColor,
                lastActive: Date.now()
            });
        }
    }, [provider, userHandle, userColor]);

    // Track all collaborators from awareness
    useEffect(() => {
        if (!provider) return;

        const updateAuthors = () => {
            const states = provider.awareness.getStates();
            const authorList = [];
            
            states.forEach((state, clientId) => {
                if (state.user) {
                    authorList.push({
                        clientId,
                        name: state.user.name || 'Anonymous',
                        color: state.user.color || '#888888',
                        lastActive: state.user.lastActive || Date.now(),
                        isLocal: clientId === provider.awareness.clientID
                    });
                }
            });

            // Sort: local user first, then by name
            authorList.sort((a, b) => {
                if (a.isLocal) return -1;
                if (b.isLocal) return 1;
                return a.name.localeCompare(b.name);
            });

            setAuthors(authorList);
        };

        provider.awareness.on('change', updateAuthors);
        updateAuthors(); // Initial load

        return () => {
            provider.awareness.off('change', updateAuthors);
        };
    }, [provider]);

    // Generate CSS for author color coding
    const getAuthorStyles = useCallback(() => {
        if (!showColorCoding) return '';
        
        // Sanitize color values to prevent CSS injection from malicious peers
        const sanitizeColor = (color) => {
            if (typeof color !== 'string') return '#888888';
            // Only allow valid CSS color formats: hex, rgb(), hsl(), named colors
            if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
            if (/^(rgb|hsl)a?\(\s*[\d.,\s%]+\)$/.test(color)) return color;
            if (/^[a-zA-Z]{1,20}$/.test(color)) return color;
            return '#888888'; // Fallback for suspicious values
        };
        
        return authors.map(author => {
            const safeColor = sanitizeColor(author.color);
            return `
            .author-${Number(author.clientId) || 0} {
                background-color: ${safeColor}20;
                border-left: 2px solid ${safeColor};
            }
        `;
        }).join('\n');
    }, [authors, showColorCoding]);

    // Get author info by client ID
    const getAuthorByClientId = useCallback((clientId) => {
        return authors.find(a => a.clientId === clientId) || null;
    }, [authors]);

    // Toggle display modes
    const toggleTooltips = useCallback(() => {
        setShowTooltips(prev => !prev);
    }, []);

    const toggleColorCoding = useCallback(() => {
        setShowColorCoding(prev => !prev);
    }, []);

    return {
        authors,
        showTooltips,
        showColorCoding,
        toggleTooltips,
        toggleColorCoding,
        getAuthorStyles,
        getAuthorByClientId
    };
}
