import { Menu, nativeImage, screen, Tray, type Rectangle } from 'electron'
import { platform } from 'node:os'
import { renderGlyphs, type RgbaColor } from '../core/bitmap-font'
import { formatPercentGlyphs } from '../core/icon-text'
import type { Bucket, Snapshot } from '../core/types'

// One accent color for the "normal" state, per ui.md — neutrals/greys for
// unknown, and two clearly distinct signal colors for warning/critical
// severities, mapped directly from the data's own `severity` field rather
// than a percent threshold we'd have to invent and keep in sync.
const COLORS: Record<string, RgbaColor> = {
  normal: [46, 160, 67, 255],
  warning: [212, 136, 6, 255],
  critical: [209, 43, 43, 255],
  unknown: [130, 130, 130, 255]
}

function colorForSeverity(severity: string | undefined): RgbaColor {
  return COLORS[severity ?? ''] ?? COLORS.unknown
}

function windowsRenderOptions(fg: RgbaColor): { scale: number; fg: RgbaColor; bg: RgbaColor } {
  // Electron's Windows tray is pinned to the default DPI (electron#33044,
  // still open) — it won't pick a scaled variant itself, so this reads the
  // real scale factor and renders at that pixel size directly.
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor
  const scale = Math.max(1, Math.round((16 * scaleFactor) / 7))
  return { scale, fg, bg: [0, 0, 0, 0] }
}

function formatResetsAt(b: Bucket | null): string {
  if (!b) return '不明'
  if (!b.resetsAt) return '不明'
  return b.resetsAt.toLocaleString()
}

export class AppTray {
  private readonly tray: Tray
  private lastGlyphs: string | null = null
  private lastColorKey: string | null = null

  constructor(onLeftClick: () => void, onQuit: () => void) {
    this.tray = new Tray(this.placeholderIcon())
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

  private placeholderIcon(): Electron.NativeImage {
    if (platform() === 'darwin') {
      return nativeImage.createEmpty()
    }
    const rendered = renderGlyphs('--', windowsRenderOptions(COLORS.unknown))
    return nativeImage.createFromBuffer(rendered.buffer, { width: rendered.width, height: rendered.height })
  }

  update(snap: Snapshot): void {
    const primary = snap.session
    const glyphs = formatPercentGlyphs(primary?.percent)
    const color = colorForSeverity(primary?.severity)
    const colorKey = color.join(',')

    if (platform() === 'darwin') {
      if (glyphs !== this.lastGlyphs) {
        this.tray.setTitle(glyphs === '--' ? '' : `${glyphs}%`, { fontType: 'monospacedDigit' })
        this.lastGlyphs = glyphs
      }
    } else if (glyphs !== this.lastGlyphs || colorKey !== this.lastColorKey) {
      const rendered = renderGlyphs(glyphs, windowsRenderOptions(color))
      this.tray.setImage(
        nativeImage.createFromBuffer(rendered.buffer, {
          width: rendered.width,
          height: rendered.height,
          scaleFactor: 1
        })
      )
      this.lastGlyphs = glyphs
      this.lastColorKey = colorKey
    }

    this.tray.setToolTip(this.buildTooltip(snap))
  }

  private buildTooltip(snap: Snapshot): string {
    const lines: string[] = ['CLAUDE使用量']
    for (const b of [snap.session, snap.weeklyAll, snap.weeklyFable]) {
      if (!b) continue
      lines.push(`${b.label} ${b.percent}% — ${formatResetsAt(b)} にリセット`)
    }
    if (snap.fetchedAtMs) {
      lines.push(`最終取得: ${new Date(snap.fetchedAtMs).toLocaleTimeString()}`)
    }
    if (snap.stale) {
      lines.push('(データが取得できません — Claude Codeを一度実行してください)')
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
