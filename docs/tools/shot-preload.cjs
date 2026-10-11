// Stand-in for src/preload/index.ts while rendering README images: the
// same `window.api` surface, answered by render.cjs instead of the real
// main process (no tray, no claude, no ping).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  onState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  },
  getState: () => ipcRenderer.invoke('shot:get-state'),
  requestRefresh: () => ipcRenderer.invoke('shot:refresh'),
  setPingEnabled: async () => {},
  setOpenAtLogin: async () => {},
  runPingNow: async () => ({ ok: true, message: '' }),
  quit: async () => {},
  reportHeight: (height) => ipcRenderer.send('shot:height', height)
})
