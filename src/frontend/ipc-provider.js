// src/frontend/ipc-provider.js
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';

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
            const update = Y.encodeAwarenessUpdate(this.awareness, changedClients);
            window.electronAPI.sendAwarenessUpdate(update);
        };

        this._onBackendUpdate = (update) => {
            Y.applyUpdate(this.doc, update, this);
        };

        this._onBackendAwarenessUpdate = (update) => {
            Y.applyAwarenessUpdate(this.awareness, update, this);
        };

        this.connect();
    }

    connect() {
        // Guard against non-Electron environments
        if (!isElectronAvailable()) {
            return;
        }
        
        this.doc.on('update', this._onUpdate);
        this.awareness.on('update', this._onAwarenessUpdate);

        window.electronAPI.onYjsUpdate(this._onBackendUpdate);
        window.electronAPI.onAwarenessUpdate(this._onBackendAwarenessUpdate);
        this.connected = true;
    }

    disconnect() {
        if (!this.connected) return;
        
        this.doc.off('update', this._onUpdate);
        this.awareness.off('update', this._onAwarenessUpdate);
        this.connected = false;

        // We need a way to remove just our listeners from the electronAPI
        // For now, we assume the App component handles the full cleanup.
    }
}
