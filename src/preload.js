// src/preload.js
// NOTE: In sandboxed preload scripts, Node.js built-in modules (path, fs) are NOT available.
// Only 'electron' modules (contextBridge, ipcRenderer) can be required.
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Script starting...');

// Get version from main process via IPC (synchronous for simplicity at startup)
// The main process sets this via app.getVersion()
let appVersion = '1.0.0';
try {
    appVersion = ipcRenderer.sendSync('get-app-version') || '1.0.0';
} catch (e) {
    console.warn('[Preload] Could not get app version:', e.message);
}

// Get sidecar ports from main process (can be customized via env vars for testing)
let sidecarPorts = { yjs: 8080, meta: 8081 };
try {
    sidecarPorts = ipcRenderer.sendSync('get-sidecar-ports') || sidecarPorts;
} catch (e) {
    console.warn('[Preload] Could not get sidecar ports:', e.message);
}

console.log('[Preload] App version:', appVersion);
console.log('[Preload] Sidecar ports:', sidecarPorts);
console.log('[Preload] Exposing electronAPI to window...');

// We are exposing a controlled API to the frontend (renderer process)
// instead of giving it full access to Node.js APIs.
contextBridge.exposeInMainWorld('electronAPI', {
    // --- App Info ---
    appVersion: appVersion,
    
    // --- Sidecar Ports (customizable for testing) ---
    sidecarPorts: sidecarPorts,
    
    // --- Frontend to Backend ---
    setKey: (key) => ipcRenderer.send('set-key', key),
    sendYjsUpdate: (update) => ipcRenderer.send('yjs-update', update),

    // --- Backend to Frontend ---
    onConnectionInfo: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('connection-info', handler);
        return () => ipcRenderer.removeListener('connection-info', handler);
    },
    onBackendError: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('backend-error', handler);
        return () => ipcRenderer.removeListener('backend-error', handler);
    },
    onYjsUpdate: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('yjs-update', handler);
        return () => ipcRenderer.removeListener('yjs-update', handler);
    },

    // --- Identity Management ---
    identity: {
        load: () => ipcRenderer.invoke('identity:load'),
        store: (identity) => ipcRenderer.invoke('identity:store', identity),
        update: (updates) => ipcRenderer.invoke('identity:update', updates),
        delete: () => ipcRenderer.invoke('identity:delete'),
        export: (password) => ipcRenderer.invoke('identity:export', password),
        import: (data, password) => ipcRenderer.invoke('identity:import', data, password),
        hasIdentity: () => ipcRenderer.invoke('identity:has'),
        validate: (mnemonic) => ipcRenderer.invoke('identity:validate', mnemonic)
    },

    // --- Hyperswarm P2P ---
    hyperswarm: {
        initialize: (identity) => ipcRenderer.invoke('hyperswarm:initialize', identity),
        joinTopic: (topicHex) => ipcRenderer.invoke('hyperswarm:join', topicHex),
        leaveTopic: (topicHex) => ipcRenderer.invoke('hyperswarm:leave', topicHex),
        broadcastSync: (topicHex, data) => ipcRenderer.send('hyperswarm:sync', { topic: topicHex, data }),
        broadcastAwareness: (topicHex, state) => ipcRenderer.send('hyperswarm:awareness', { topic: topicHex, state }),
        getPeers: (topicHex) => ipcRenderer.invoke('hyperswarm:peers', topicHex),
        getConnectionCount: () => ipcRenderer.invoke('hyperswarm:connectionCount'),
        destroy: () => ipcRenderer.invoke('hyperswarm:destroy'),
        onPeerJoined: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('hyperswarm:peer-joined', handler);
            return () => ipcRenderer.removeListener('hyperswarm:peer-joined', handler);
        },
        onPeerLeft: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('hyperswarm:peer-left', handler);
            return () => ipcRenderer.removeListener('hyperswarm:peer-left', handler);
        },
        onPeerIdentity: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('hyperswarm:peer-identity', handler);
            return () => ipcRenderer.removeListener('hyperswarm:peer-identity', handler);
        },
        onSyncMessage: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('hyperswarm:sync-message', handler);
            return () => ipcRenderer.removeListener('hyperswarm:sync-message', handler);
        },
        onAwarenessUpdate: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('hyperswarm:awareness-update', handler);
            return () => ipcRenderer.removeListener('hyperswarm:awareness-update', handler);
        }
    },

    // --- Tor Management ---
    tor: {
        start: (mode) => ipcRenderer.invoke('tor:start', mode),
        stop: () => ipcRenderer.invoke('tor:stop'),
        getStatus: () => ipcRenderer.invoke('tor:status'),
        newIdentity: () => ipcRenderer.invoke('tor:newIdentity'),
        getSocksProxy: () => ipcRenderer.invoke('tor:socksProxy'),
        getOnionAddress: () => ipcRenderer.invoke('tor:onionAddress'),
        onBootstrap: (callback) => {
            const handler = (_e, progress) => callback(progress);
            ipcRenderer.on('tor:bootstrap', handler);
            return () => ipcRenderer.removeListener('tor:bootstrap', handler);
        },
        onReady: (callback) => {
            const handler = () => callback();
            ipcRenderer.on('tor:ready', handler);
            return () => ipcRenderer.removeListener('tor:ready', handler);
        },
        onError: (callback) => {
            const handler = (_e, err) => callback(err);
            ipcRenderer.on('tor:error', handler);
            return () => ipcRenderer.removeListener('tor:error', handler);
        }
    },

    // --- Inventory Address Storage ---
    // Encrypted blob storage for inventory addresses (admin + requestor local storage)
    // Blobs are pre-encrypted by the frontend — the main process treats them as opaque data
    inventory: {
        // Admin address store (linked to requests)
        storeAddress: (inventorySystemId, requestId, encryptedAddressBlob) =>
            ipcRenderer.invoke('inventory:store-address', inventorySystemId, requestId, encryptedAddressBlob),
        getAddress: (inventorySystemId, requestId) =>
            ipcRenderer.invoke('inventory:get-address', inventorySystemId, requestId),
        deleteAddress: (inventorySystemId, requestId) =>
            ipcRenderer.invoke('inventory:delete-address', inventorySystemId, requestId),
        listAddresses: (inventorySystemId) =>
            ipcRenderer.invoke('inventory:list-addresses', inventorySystemId),
        // Saved addresses (requestor-local)
        storeSavedAddress: (addressId, encryptedBlob) =>
            ipcRenderer.invoke('inventory:store-saved-address', addressId, encryptedBlob),
        getSavedAddresses: () =>
            ipcRenderer.invoke('inventory:get-saved-addresses'),
        deleteSavedAddress: (addressId) =>
            ipcRenderer.invoke('inventory:delete-saved-address', addressId),
    },

    // --- Protocol Link Handling ---
    onProtocolLink: (callback) => {
        const handler = (_e, url) => callback(url);
        ipcRenderer.on('protocol-link', handler);
        return () => ipcRenderer.removeListener('protocol-link', handler);
    },

    // --- External URLs ---
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // --- Diagnostics ---
    getDiagnosticData: () => ipcRenderer.invoke('get-diagnostic-data'),

    // --- File System Operations ---
    fileSystem: {
        selectFolder: (options) => ipcRenderer.invoke('dialog:selectFolder', options),
        saveDownload: (filePath, data) => ipcRenderer.invoke('file:saveDownload', { filePath, data }),
        openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
        showInFolder: (filePath) => ipcRenderer.invoke('file:showInFolder', filePath),
    },

    // Function to remove listeners for a specific channel, or all known channels if none specified
    removeAllListeners: (channel) => {
        const allChannels = [
            'connection-info',
            'backend-error',
            'yjs-update',
            'hyperswarm:peer-joined',
            'hyperswarm:peer-left',
            'hyperswarm:peer-identity',
            'hyperswarm:sync-message',
            'hyperswarm:awareness-update',
            'tor:bootstrap',
            'tor:ready',
            'tor:error',
            'protocol-link',
        ];
        if (channel) {
            // Only allow removing listeners on known application channels
            if (!allChannels.includes(channel)) {
                console.warn(`[Preload] removeAllListeners blocked for unknown channel: ${channel}`);
                return;
            }
            ipcRenderer.removeAllListeners(channel);
        } else {
            allChannels.forEach(ch => ipcRenderer.removeAllListeners(ch));
        }
    }
});

console.log('[Preload] electronAPI exposed successfully!');
