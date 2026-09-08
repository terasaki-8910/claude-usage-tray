import { contextBridge, ipcRenderer } from 'electron'
import type { PopupState } from '../core/types'

const api = {
  onState: (callback: (state: PopupState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PopupState): void => callback(state)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  },
  requestRefresh: (): Promise<void> => ipcRenderer.invoke('refresh'),
  setPingEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-ping-enabled', enabled),
  quit: (): Promise<void> => ipcRenderer.invoke('quit')
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
