// src/frontend/ipc-provider.js
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';

/**
 * Check if running in Electron environment with electronAPI available
 */
function isElectronAvailable() {
    return typeof window !== 'undefined' && 
           window.electronAPI && 
           typeof window.electronAPI.sendYjsUpdate === 'function';
}

/**
 * A "provider" that connects the Yjs document and awareness
 * to the Electron main process via IPC channels.
 * It mimics the interface of a network provider like y-websocket.
 * 
 * Note: This provider is only functional in Electron environments.
 * On Web/Capacitor, it will be a no-op to prevent crashes.
 */
export class IpcProvider {
    constructor(doc) {
        this.doc = doc;
        this.awareness = new Awareness(this.doc);
        this.connected = false;
        
        // Check if we're in Electron environment
        if (!isElectronAvailable()) {
            console.warn('[IpcProvider] Not in Electron environment, provider will be inactive');
            return;
        }

        this._onUpdate = (update, origin) => {
            if (origin !== this && isElectronAvailable()) {
                window.electronAPI.sendYjsUpdate(update);
            }
        };

        this._onAwarenessUpdate = ({ added, updated, removed }) => {
            if (!isElectronAvailable()) return;
            const changedClients = added.concat(updated).concat(removed);
            const update = encodeAwarenessUpdate(this.awareness, changedClients);
            window.electronAPI.sendAwarenessUpdate(update);
        };

        this._onBackendUpdate = (update) => {
            // Guard: only apply if still connected to prevent stale updates
            if (!this.connected) return;
            Y.applyUpdate(this.doc, update, this);
        };

        this._onBackendAwarenessUpdate = (update) => {
            if (!this.connected) return;
            applyAwarenessUpdate(this.awareness, update, this);
        };

        // Track IPC removal functions for proper cleanup
        this._removeYjsListener = null;
        this._removeAwarenessListener = null;

        this.connect();
    }

    connect() {
        // Guard against non-Electron environments
        if (!isElectronAvailable()) {
            return;
        }
        
        this.doc.on('update', this._onUpdate);
        this.awareness.on('update', this._onAwarenessUpdate);

        // Store removal functions if the API supports them
        const yjsRemover = window.electronAPI.onYjsUpdate(this._onBackendUpdate);
        const awarenessRemover = window.electronAPI.onAwarenessUpdate(this._onBackendAwarenessUpdate);
        this._removeYjsListener = typeof yjsRemover === 'function' ? yjsRemover : null;
        this._removeAwarenessListener = typeof awarenessRemover === 'function' ? awarenessRemover : null;
        this.connected = true;
    }

    disconnect() {
        if (!this.connected) return;
        
        this.doc.off('update', this._onUpdate);
        this.awareness.off('update', this._onAwarenessUpdate);
        this.connected = false;

        // Remove IPC listeners to prevent stale callbacks applying updates to old ydocs
        if (this._removeYjsListener) {
            this._removeYjsListener();
            this._removeYjsListener = null;
        }
        if (this._removeAwarenessListener) {
            this._removeAwarenessListener();
            this._removeAwarenessListener = null;
        }
    }
}
