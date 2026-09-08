import { BrowserWindow, type Rectangle } from 'electron'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { PopupState } from '../core/types'

const dirName = fileURLToPath(new URL('.', import.meta.url))

const POPUP_WIDTH = 320
/** Starting height only — the renderer measures its real content and the
 * window is resized to fit (see `resizeToContent`). Content height varies
 * with the stale banner and last-ping line, so a fixed height clips the
 * footer. */
const POPUP_INITIAL_HEIGHT = 260
const POPUP_MAX_HEIGHT = 600

/**
 * Owns the popup's lifecycle. Memory-frugality requirement: the window is
 * `destroy()`ed (never `.hide()`ed) on blur/close and lazily recreated on
 * the next open, so idle memory stays at "tray icon only, no renderer
 * process" instead of a hidden BrowserWindow sitting resident all day.
 */
export class PopupWindowManager {
  private window: BrowserWindow | null = null
  private anchor: Rectangle | null = null

  constructor(private readonly getState: () => PopupState) {}

  /** Windows opens the popup upward from the tray; macOS drops it down
   * from the menu bar. Recomputed on resize so the window stays pinned to
   * the tray edge as its height changes. */
  private yFor(height: number): number {
    const a = this.anchor
    if (!a) return 0
    return process.platform === 'darwin' ? a.y + a.height + 4 : a.y - height - 4
  }

  /** Resizes the popup to the height the renderer measured, so the footer
   * is never clipped by a guessed fixed height. */
  resizeToContent(webContentsId: number, contentHeight: number): void {
    const win = this.window
    if (!win || win.isDestroyed() || win.webContents.id !== webContentsId) return
    const height = Math.min(POPUP_MAX_HEIGHT, Math.max(120, Math.ceil(contentHeight)))
    if (win.getBounds().height === height) return
    win.setBounds({ x: win.getBounds().x, y: this.yFor(height), width: POPUP_WIDTH, height })
  }

  isOpen(): boolean {
    return this.window !== null
  }

  /** Pushes the latest state to the popup if one is currently open — used
   * after a background refresh or ping settles, so a popup left open
   * doesn't show stale data for up to 5 minutes. No-ops if closed. */
  pushState(): void {
    if (!this.window || this.window.isDestroyed()) return
    this.window.webContents.send('state', this.getState())
  }

  /** Opens the popup anchored to the tray icon's bounds, or closes it if
   * already open (so clicking the tray icon again toggles it shut). */
  toggle(anchorBounds: Rectangle): void {
    if (this.window) {
      this.window.destroy()
      return
    }
    this.open(anchorBounds)
  }

  private open(anchorBounds: Rectangle): void {
    this.anchor = anchorBounds
    const x = Math.round(anchorBounds.x + anchorBounds.width / 2 - POPUP_WIDTH / 2)
    const y = this.yFor(POPUP_INITIAL_HEIGHT)

    const win = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_INITIAL_HEIGHT,
      x,
      y,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(dirName, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true
      }
    })

    win.on('closed', () => {
      if (this.window === win) this.window = null
    })

    // Light-dismiss: Escape closes the popup, same as clicking outside it.
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        win.destroy()
      }
    })

    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl) {
      void win.loadURL(rendererUrl)
    } else {
      void win.loadFile(join(dirName, '../renderer/index.html'))
    }

    win.once('ready-to-show', () => {
      win.show()
      win.webContents.send('state', this.getState())
      // Attach blur-to-close only after showing — attaching immediately on
      // creation risks a spurious early blur destroying the window before
      // the user ever sees it.
      win.on('blur', () => win.destroy())
    })

    this.window = win
  }

  destroy(): void {
    this.window?.destroy()
    this.window = null
  }
}
