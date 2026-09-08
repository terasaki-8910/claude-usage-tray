/**
 * Formats a usage percentage as a string of at most 2 glyphs, for the
 * Windows tray icon (see bitmap-font.ts) and the macOS `setTitle` text.
 * Never returns more than 2 characters — that is the hard legibility
 * budget at 16px tray-icon scale.
 */
export function formatPercentGlyphs(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || Number.isNaN(percent) || percent < 0) {
    return '--'
  }
  const rounded = Math.round(percent)
  if (rounded >= 100) return '99'
  return String(rounded).padStart(2, '0')
}
