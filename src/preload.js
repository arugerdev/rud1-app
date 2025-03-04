const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
    // Expose secure API methods here
    ipc: (message) => {
        console.log('Received message:', message);
        ipcRenderer.postMessage(message)
    },
});