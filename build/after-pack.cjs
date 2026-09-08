'use strict'
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

/**
 * Ad-hoc code-signs the macOS app after packaging.
 *
 * Without this the app is completely unlaunchable on Apple Silicon: arm64
 * binaries must carry a signature, and macOS reports an unsigned one as
 * "壊れているため開けません" ("is damaged and can't be opened") rather than
 * as a signing problem. electron-builder ships the app unsigned when no
 * Developer ID is configured, and repackaging also invalidates the
 * signature Electron's own binaries came with.
 *
 * Ad-hoc (`--sign -`) is not notarization: Gatekeeper still quarantines
 * downloaded builds, so a first launch needs either right-click > Open or
 *   xattr -dr com.apple.quarantine "/Applications/Claude Usage Tray.app"
 * Removing that step would require a paid Apple Developer ID plus
 * notarization.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--verbose', appPath], { stdio: 'inherit' })
}
