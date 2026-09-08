import { contextBridge, ipcRenderer } from 'electron'
import type { PopupState } from '../core/types'

const api = {
  onState: (callback: (state: PopupState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PopupState): void => callback(state)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  },
  /** Pull the current state. The renderer calls this on mount rather than
   * waiting only for a push — `ready-to-show` can fire before the module
   * script has registered its listener, which left the popup stuck on
   * "読み込み中…". */
  getState: (): Promise<PopupState> => ipcRenderer.invoke('get-state'),
  requestRefresh: (): Promise<PopupState> => ipcRenderer.invoke('refresh'),
  setPingEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-ping-enabled', enabled),
  setOpenAtLogin: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-open-at-login', enabled),
  /** Sends one ping immediately, regardless of the auto-ping switch —
   * used to verify the mechanism actually works without arming it. */
  runPingNow: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('run-ping-now'),
  quit: (): Promise<void> => ipcRenderer.invoke('quit'),
  /** Report the rendered content height so the main process can size the
   * window to fit. Content height varies (a stale banner and a last-ping
   * line come and go), so a fixed height clips the footer. */
  reportHeight: (height: number): void => ipcRenderer.send('report-height', height)
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
