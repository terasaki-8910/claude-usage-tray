import { Menu, nativeImage, screen, Tray, type Rectangle } from 'electron'
import { platform } from 'node:os'
import { renderTrayIcon, type RgbaColor } from '../core/bitmap-font'
import { formatPercentGlyphs } from '../core/icon-text'
import type { Bucket, Snapshot } from '../core/types'

/** Claude's brand coral, drawn as a 2px bar along the bottom of the tray
 * icon. At the real 16x16 tray size there is no room for both a legible
 * two-digit number and a recognizable logo, so identity is carried by a
 * persistent color cue instead of a shape. */
const BRAND: RgbaColor = [217, 119, 87, 255]

// Severity comes straight from the data's own `severity` field rather
// than percent thresholds we'd have to invent and keep in sync.
const COLORS: Record<string, RgbaColor> = {
  normal: [64, 190, 105, 255],
  warning: [230, 160, 30, 255],
  critical: [235, 80, 70, 255],
  unknown: [150, 150, 150, 255]
}

/** Past this age the cached numbers are too old to present as current. */
const STALE_AFTER_MS = 30 * 60_000

function colorForSeverity(severity: string | undefined): RgbaColor {
  return COLORS[severity ?? ''] ?? COLORS.unknown
}

/** Tray icons are square and fixed-size on Windows (SM_CXSMICON = 16 at
 * 100% DPI). Render at exactly that many device pixels so Electron never
 * rescales — rescaling a non-square render is what previously turned
 * "03" into an unreadable blob. */
function trayIconSize(): number {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor || 1
  return Math.max(16, Math.round(16 * scaleFactor))
}

function formatResetsAt(b: Bucket | null): string {
  if (!b?.resetsAt) return '不明'
  return b.resetsAt.toLocaleString()
}

export class AppTray {
  private readonly tray: Tray
  private lastKey: string | null = null

  constructor(onLeftClick: () => void, onQuit: () => void) {
    this.tray = new Tray(this.renderIcon('--', COLORS.unknown))
    this.tray.on('click', onLeftClick)
    this.tray.on('right-click', () => {
      const menu = Menu.buildFromTemplate([
        { label: '今すぐ更新', click: onLeftClick },
        { type: 'separator' },
        { label: '終了', click: onQuit }
      ])
      this.tray.popUpContextMenu(menu)
    })
  }

  private renderIcon(glyphs: string, fg: RgbaColor): Electron.NativeImage {
    const size = trayIconSize()
    const rendered = renderTrayIcon(glyphs, { size, fg, accent: BRAND })
    return nativeImage.createFromBuffer(rendered.buffer, {
      width: rendered.width,
      height: rendered.height,
      scaleFactor: 1
    })
  }

  update(snap: Snapshot): void {
    const primary = snap.session
    const ageMs = snap.fetchedAtMs === null ? Number.POSITIVE_INFINITY : Date.now() - snap.fetchedAtMs
    const isStale = snap.stale || ageMs > STALE_AFTER_MS

    const glyphs = isStale ? '--' : formatPercentGlyphs(primary?.percent)
    const fg = isStale ? COLORS.unknown : colorForSeverity(primary?.severity)

    if (platform() === 'darwin') {
      const key = glyphs
      if (key !== this.lastKey) {
        this.tray.setTitle(glyphs === '--' ? '' : `${glyphs}%`, { fontType: 'monospacedDigit' })
        this.lastKey = key
      }
    } else {
      // Redraw only when the visible result actually changes — cheap
      // insurance against tray handle churn on a 5-minute timer.
      const key = `${glyphs}|${fg.join(',')}`
      if (key !== this.lastKey) {
        this.tray.setImage(this.renderIcon(glyphs, fg))
        this.lastKey = key
      }
    }

    this.tray.setToolTip(this.buildTooltip(snap, isStale))
  }

  private buildTooltip(snap: Snapshot, isStale: boolean): string {
    const lines: string[] = ['CLAUDE使用量']
    for (const b of [snap.session, snap.weeklyAll, snap.weeklyFable]) {
      if (!b) continue
      lines.push(`${b.label} ${b.percent}% — ${formatResetsAt(b)} にリセット`)
    }
    if (snap.fetchedAtMs) {
      lines.push(`最終取得: ${new Date(snap.fetchedAtMs).toLocaleTimeString()}`)
    }
    if (snap.stale) {
      lines.push('データが読めません — Claude Codeを一度実行してください')
    } else if (isStale) {
      lines.push('データが古い可能性があります(30分以上前)')
    }
    return lines.join('\n')
  }

  getBounds(): Rectangle {
    return this.tray.getBounds()
  }

  destroy(): void {
    this.tray.destroy()
  }
}
