// frontend/src/contexts/PresenceContext.jsx
// React context for presence/awareness management

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Awareness } from 'y-protocols/awareness';
import { useIdentity } from './IdentityContext';
import { generateIdentityColor } from '../utils/colorUtils';

// Presence update throttle in milliseconds (matches sidecar AWARENESS_THROTTLE_MS)
const PRESENCE_THROTTLE_MS = 100;

const PresenceContext = createContext(null);

export function usePresence() {
    const context = useContext(PresenceContext);
    if (!context) {
        throw new Error('usePresence must be used within PresenceProvider');
    }
    return context;
}

// Simple throttle function
function throttle(func, limit) {
    let lastCall = 0;
    let lastArgs = null;
    let timer = null;
    
    function throttled(...args) {
        const now = Date.now();
        const remaining = limit - (now - lastCall);
        
        if (remaining <= 0) {
            // Enough time has passed — execute immediately
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            lastCall = now;
            lastArgs = null;
            func.apply(this, args);
        } else {
            // Within throttle window — queue the latest args
            lastArgs = args;
            if (!timer) {
                timer = setTimeout(() => {
                    timer = null;
                    lastCall = Date.now();
                    if (lastArgs) {
                        func.apply(this, lastArgs);
                        lastArgs = null;
                    }
                }, remaining);
            }
        }
    }
    
    throttled.cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        lastArgs = null;
    };
    
    return throttled;
}

export function PresenceProvider({ children, awareness }) {
    const { publicIdentity } = useIdentity();
    const [peers, setPeers] = useState(new Map());
    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef(null);
    // Track mounted state to prevent setState after unmount
    const isMountedRef = useRef(true);
    
    // Update local awareness state when identity changes
    // Use deterministic color based on publicKey for consistent identity colors
    useEffect(() => {
        if (!awareness || !publicIdentity) return;
        
        // Generate deterministic color from publicKey
        const identityColor = publicIdentity.color || generateIdentityColor(publicIdentity.publicKeyBase62);
        
        const localState = {
            user: {
                id: publicIdentity.publicKeyBase62,
                name: publicIdentity.handle,
                color: identityColor,
                icon: publicIdentity.icon,
                deviceId: publicIdentity.deviceId,
                deviceName: publicIdentity.deviceName,
                publicKey: publicIdentity.publicKeyBase62, // Include publicKey for DM routing
                lastActive: Date.now()
            },
            cursor: null,
            selection: null,
            isTyping: false,
            lastSeen: Date.now()
        };
        
        awareness.setLocalStateField('user', localState.user);
        awareness.setLocalStateField('lastSeen', localState.lastSeen);
        awareness.setLocalStateField('isTyping', false);
    }, [awareness, publicIdentity]);
    
    // Listen for awareness changes
    useEffect(() => {
        if (!awareness) return;
        
        const handleChange = () => {
            const states = awareness.getStates();
            const newPeers = new Map();
            
            states.forEach((state, clientId) => {
                if (clientId === awareness.clientID) return; // Skip self
                
                if (state.user) {
                    newPeers.set(clientId, {
                        clientId,
                        user: state.user,
                        cursor: state.cursor,
                        selection: state.selection,
                        isTyping: state.isTyping || false,
                        lastSeen: state.lastSeen || Date.now(),
                        openDocumentId: state.openDocumentId || null
                    });
                }
            });
            
            setPeers(prev => {
                if (prev.size !== newPeers.size) return newPeers;
                for (const [key, val] of newPeers) {
                    const old = prev.get(key);
                    if (!old) return newPeers;
                    // Compare all render-relevant fields (skip lastSeen to avoid heartbeat churn)
                    if (old.isTyping !== val.isTyping ||
                        old.openDocumentId !== val.openDocumentId ||
                        old.user?.id !== val.user?.id ||
                        old.user?.name !== val.user?.name ||
                        old.user?.color !== val.user?.color ||
                        old.user?.icon !== val.user?.icon ||
                        JSON.stringify(old.cursor) !== JSON.stringify(val.cursor) ||
                        JSON.stringify(old.selection) !== JSON.stringify(val.selection)) {
                        return newPeers;
                    }
                }
                return prev; // No change — keep old reference
            });
        };
        
        awareness.on('change', handleChange);
        handleChange(); // Initial load
        
        return () => {
            awareness.off('change', handleChange);
            // Clear only the fields this context owns instead of wiping all shared awareness
            try {
                awareness.setLocalStateField('user', null);
                awareness.setLocalStateField('cursor', null);
                awareness.setLocalStateField('selection', null);
                awareness.setLocalStateField('isTyping', null);
                awareness.setLocalStateField('lastSeen', null);
                awareness.setLocalStateField('openDocumentId', null);
            } catch (e) {
                // Ignore errors if awareness is already destroyed
            }
        };
    }, [awareness]);
    
    // Update cursor position with optional documentId for per-document filtering
    // Throttled to 100ms to match sidecar and prevent excessive network traffic
    const updateCursorRaw = useCallback((position, documentId = null) => {
        if (!awareness || !isMountedRef.current) return;
        awareness.setLocalStateField('cursor', position);
        if (documentId) {
            awareness.setLocalStateField('openDocumentId', documentId);
        }
    }, [awareness]);
    
    // Memoize throttled version, cancelling the previous timer on recreation
    const throttledCursorRef = useRef(null);
    const updateCursor = useMemo(() => {
        if (throttledCursorRef.current) throttledCursorRef.current.cancel();
        const fn = throttle(updateCursorRaw, PRESENCE_THROTTLE_MS);
        throttledCursorRef.current = fn;
        return fn;
    }, [updateCursorRaw]);
    
    // Update selection with optional documentId for per-document filtering
    // Throttled to 100ms to match sidecar and prevent excessive network traffic
    const updateSelectionRaw = useCallback((selection, documentId = null) => {
        if (!awareness || !isMountedRef.current) return;
        awareness.setLocalStateField('selection', selection);
        if (documentId) {
            awareness.setLocalStateField('openDocumentId', documentId);
        }
    }, [awareness]);
    
    // Memoize throttled version, cancelling the previous timer on recreation
    const throttledSelectionRef = useRef(null);
    const updateSelection = useMemo(() => {
        if (throttledSelectionRef.current) throttledSelectionRef.current.cancel();
        const fn = throttle(updateSelectionRaw, PRESENCE_THROTTLE_MS);
        throttledSelectionRef.current = fn;
        return fn;
    }, [updateSelectionRaw]);
    
    // Update which document is currently open (for presence indicators)
    const updateOpenDocument = useCallback((documentId) => {
        if (!awareness) return;
        awareness.setLocalStateField('openDocumentId', documentId);
    }, [awareness]);
    
    // Set typing indicator
    const setTypingIndicator = useCallback((typing) => {
        if (!awareness) return;
        
        setIsTyping(typing);
        awareness.setLocalStateField('isTyping', typing);
        
        // Auto-clear typing after 3 seconds
        if (typing) {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            typingTimeoutRef.current = setTimeout(() => {
                // Check if component is still mounted before setState
                if (!isMountedRef.current) return;
                setIsTyping(false);
                if (awareness) {
                    awareness.setLocalStateField('isTyping', false);
                }
            }, 3000);
        }
    }, [awareness]);
    
    // Cleanup typing timeout and throttle timers on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (throttledCursorRef.current) throttledCursorRef.current.cancel();
            if (throttledSelectionRef.current) throttledSelectionRef.current.cancel();
        };
    }, []);
    
    // Update last seen timestamp
    const updateLastSeen = useCallback(() => {
        if (!awareness) return;
        awareness.setLocalStateField('lastSeen', Date.now());
    }, [awareness]);
    
    // Get online peers count
    const onlinePeersCount = peers.size;
    
    // Get typing peers - memoize to prevent unnecessary re-renders
    const typingPeers = useMemo(() => 
        Array.from(peers.values()).filter(p => p.isTyping), 
        [peers]
    );
    
    // Get peers on a specific document
    const getPeersOnDocument = useCallback((documentId) => {
        if (!documentId) return [];
        return Array.from(peers.values()).filter(p => 
            p.openDocumentId === documentId
        );
    }, [peers]);
    
    // Memoize context value to prevent unnecessary re-renders of consumers
    const value = useMemo(() => ({
        peers,
        onlinePeersCount,
        typingPeers,
        isTyping,
        updateCursor,
        updateSelection,
        updateOpenDocument,
        setTypingIndicator,
        updateLastSeen,
        getPeersOnDocument
    }), [peers, onlinePeersCount, typingPeers, isTyping, updateCursor, updateSelection, 
         updateOpenDocument, setTypingIndicator, updateLastSeen, getPeersOnDocument]);
    
    return (
        <PresenceContext.Provider value={value}>
            {children}
        </PresenceContext.Provider>
    );
}
