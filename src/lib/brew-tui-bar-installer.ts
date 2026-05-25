import { rm, access, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { t } from '../i18n/index.js';
import { fetchWithTimeout } from './fetch-timeout.js';

const execFileAsync = promisify(execFile);
const BREWTUIBAR_APP_PATH = '/Applications/Brew-TUI-Bar.app';
const BREWTUIBAR_BUNDLE_ID = 'com.molinesdesigns.brewtuibar';
const BREWTUIBAR_PROCESS_NAME = 'Brew-TUI-Bar';
const LEGACY_APP_PATH = '/Applications/BrewBar.app';
const LEGACY_BUNDLE_ID = 'com.molinesdesigns.brewbar';
const LEGACY_PROCESS_NAME = 'BrewBar';
const DOWNLOAD_URL = 'https://github.com/MoLinesDesigns/Brew-TUI/releases/latest/download/Brew-TUI-Bar.app.zip';
const MAX_SIZE = 200 * 1024 * 1024; // 200 MB

export async function isBrewTUIBarInstalled(): Promise<boolean> {
  try {
    await access(BREWTUIBAR_APP_PATH);
    return true;
  } catch {
    return false;
  }
}

/// Reads CFBundleIdentifier of an installed .app bundle. Used to detect when
/// another app has claimed a path we care about (e.g. a third-party clone at
/// /Applications/Brew-TUI-Bar.app, or a foreign app sitting at the legacy
/// /Applications/BrewBar.app path).
async function bundleIdAt(appPath: string): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await execFileAsync('defaults', [
      'read',
      `${appPath}/Contents/Info.plist`,
      'CFBundleIdentifier',
    ]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function installedBundleId(): Promise<string | null> {
  return bundleIdAt(BREWTUIBAR_APP_PATH);
}

/// Cleans up the legacy BrewBar.app bundle if present and owned by us. The
/// cask transitional path handles this for `brew upgrade` users; this covers
/// `brew-tui install-brew-tui-bar` and the npm cold-start auto-install. We
/// only touch the bundle when its CFBundleIdentifier matches the legacy ID,
/// so a foreign app at the same path is left alone.
async function removeLegacyBundleIfOurs(): Promise<void> {
  if (process.platform !== 'darwin') return;
  try {
    await access(LEGACY_APP_PATH);
  } catch {
    return;
  }

  const legacyId = await bundleIdAt(LEGACY_APP_PATH);
  if (legacyId !== LEGACY_BUNDLE_ID) return; // not ours, leave it

  // Quit the legacy process if it's running, then remove the bundle.
  try {
    const { stdout } = await execFileAsync('pgrep', ['-x', LEGACY_PROCESS_NAME]);
    if (stdout.trim().length > 0) {
      try {
        await execFileAsync('osascript', ['-e', `tell application "${LEGACY_PROCESS_NAME}" to quit`]);
      } catch { /* fall through to pkill */ }
      for (let i = 0; i < 15; i++) {
        try {
          const { stdout: s } = await execFileAsync('pgrep', ['-x', LEGACY_PROCESS_NAME]);
          if (s.trim().length === 0) break;
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      try {
        await execFileAsync('pkill', ['-x', LEGACY_PROCESS_NAME]);
      } catch { /* nothing to kill */ }
    }
  } catch {
    /* pgrep exits 1 when no match — legacy app not running */
  }

  await rm(LEGACY_APP_PATH, { recursive: true, force: true });
}

/// Returns true if the Brew-TUI-Bar process is currently running.
/// Used by the installer to decide whether to quit + relaunch after an update.
export async function isBrewTUIBarRunning(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const { stdout } = await execFileAsync('pgrep', ['-x', BREWTUIBAR_PROCESS_NAME]);
    return stdout.trim().length > 0;
  } catch {
    // pgrep exits 1 when no match; that means "not running", not a failure.
    return false;
  }
}

/// Asks Brew-TUI-Bar to quit gracefully (LSUIElement → no dialogs), then falls back
/// to pkill if it hasn't exited within 3 s. Required before reemplazar el bundle:
/// `ditto -xk` sobre una app en ejecución deja un bundle viejo con un Info.plist
/// nuevo, lo cual confunde el monitor de last-action y los watchers FSEvents.
async function quitBrewTUIBar(): Promise<void> {
  if (process.platform !== 'darwin') return;
  try {
    await execFileAsync('osascript', ['-e', `tell application "${BREWTUIBAR_PROCESS_NAME}" to quit`]);
  } catch {
    /* osascript falla si la app no está registrada; pasamos a pkill */
  }
  for (let i = 0; i < 15; i++) {
    if (!(await isBrewTUIBarRunning())) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  try {
    await execFileAsync('pkill', ['-x', BREWTUIBAR_PROCESS_NAME]);
  } catch {
    /* nada que matar */
  }
}

/// Install Brew-TUI-Bar. As of 2.1.0 we no longer gate on Pro: Free users get
/// the bundle too and see the in-app upgrade prompt when they click the menu
/// bar icon. The `_isPro` parameter is kept for backwards compatibility with
/// existing call sites but is ignored.
export async function installBrewTUIBar(_isPro: boolean, force = false): Promise<void> {
  // macOS only
  if (process.platform !== 'darwin') {
    throw new Error(t('cli_brewtuibarMacOnly'));
  }

  // If an app already exists at our install path, verify it's ours before
  // we touch it. Defends against name collisions with third-party clones.
  if (await isBrewTUIBarInstalled()) {
    const id = await installedBundleId();
    if (id && id !== BREWTUIBAR_BUNDLE_ID) {
      throw new Error(t('cli_brewtuibarForeignBundle', { id }));
    }
    if (!force) {
      throw new Error(t('cli_brewtuibarAlreadyInstalled'));
    }
  }

  // EP-013: Use unique temp path
  const TMP_ZIP = join(tmpdir(), 'Brew-TUI-Bar-' + randomUUID() + '.zip');

  // Download zip (120s timeout for large binary)
  const res = await fetchWithTimeout(DOWNLOAD_URL, {}, 120_000);
  if (!res.ok || !res.body) {
    throw new Error(t('cli_brewtuibarDownloadFailed', { error: `HTTP ${res.status}` }));
  }

  // Reject downloads larger than 200 MB (from Content-Length header)
  const contentLength = Number(res.headers.get('content-length') ?? '0');
  if (contentLength > MAX_SIZE) {
    throw new Error(t('cli_brewtuibarDownloadFailed', { error: 'Download exceeds 200 MB size limit' }));
  }

  // EP-005: Track downloaded bytes during the stream
  let downloadedBytes = 0;

  // Write to tmp file with byte counting
  const fileStream = createWriteStream(TMP_ZIP);
  const transformedBody = new ReadableStream({
    async start(controller) {
      const bodyReader = (res.body as ReadableStream<Uint8Array>).getReader();
      try {
        while (true) {
          const { done, value } = await bodyReader.read();
          if (done) break;
          downloadedBytes += value.length;
          if (downloadedBytes > MAX_SIZE) {
            controller.error(new Error('Download exceeds 200 MB limit'));
            return;
          }
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
  await pipeline(transformedBody as unknown as NodeJS.ReadableStream, fileStream);

  // SEG-001: SHA-256 integrity check with proper error handling
  let expectedHash: string | null = null;
  try {
    const checksumRes = await fetchWithTimeout(`${DOWNLOAD_URL}.sha256`, {}, 15_000);
    if (checksumRes.ok) {
      const text = await checksumRes.text();
      // EP-009: Validate split result is defined
      const hash = text.trim().split(/\s+/)[0];
      // EP-010: Validate hash format
      if (hash && /^[0-9a-f]{64}$/i.test(hash)) {
        expectedHash = hash.toLowerCase();
      }
    }
  } catch {
    /* checksum file not available */
  }

  if (expectedHash) {
    const fileBuffer = await readFile(TMP_ZIP);
    const actual = createHash('sha256').update(fileBuffer).digest('hex');
    if (actual !== expectedHash) {
      await rm(TMP_ZIP, { force: true }).catch(() => {});
      throw new Error(t('cli_brewtuibarDownloadFailed', { error: 'SHA-256 mismatch: binary may have been tampered with' }));
    }
  } else {
    // NUEVO-003: Treat missing checksum as fatal — don't install unverified binaries
    await rm(TMP_ZIP, { force: true }).catch(() => {});
    throw new Error(t('cli_brewtuibarDownloadFailed', { error: 'SHA-256 checksum unavailable — cannot verify download integrity' }));
  }

  // Si Brew-TUI-Bar está corriendo, cerrarla antes de tocar el bundle. Sin esto
  // `ditto -xk` sobreescribe los recursos de un proceso vivo y la app queda
  // en estado degradado hasta el próximo lanzamiento.
  const wasRunning = await isBrewTUIBarRunning();
  if (wasRunning) {
    await quitBrewTUIBar();
  }

  // Clean up the legacy BrewBar.app bundle if it's ours. The cask transitional
  // path handles this on the brew upgrade side; this covers npm and cold-start.
  await removeLegacyBundleIfOurs();

  // Remove old app if force reinstall
  if (force && await isBrewTUIBarInstalled()) {
    await rm(BREWTUIBAR_APP_PATH, { recursive: true, force: true });
  }

  // Unzip to /Applications
  try {
    await execFileAsync('ditto', ['-xk', TMP_ZIP, '/Applications/']);
  } catch (err) {
    throw new Error(t('cli_brewtuibarDownloadFailed', { error: err instanceof Error ? err.message : String(err) }), { cause: err });
  } finally {
    // Clean up tmp zip
    await rm(TMP_ZIP, { force: true }).catch(() => {});
  }

  // Si estaba corriendo antes de la actualización, relanzarla para que el
  // usuario vuelva a ver el ícono en la menubar sin pasos manuales.
  if (wasRunning) {
    await launchBrewTUIBar();
  }
}

/// Launches Brew-TUI-Bar detached from the parent process so it survives terminal close.
/// `open -g -a` runs the app in the background without bringing it to foreground.
export async function launchBrewTUIBar(): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (!await isBrewTUIBarInstalled()) return;
  try {
    await execFileAsync('open', ['-g', '-a', BREWTUIBAR_APP_PATH]);
  } catch {
    // Non-fatal: may already be running, or LaunchServices may need a moment.
  }
}

/// One-shot "install if missing, update if outdated, launch" flow shared by
/// the CLI cold-start (`ensureBrewTUIBarRunning`) and the npm postinstall.
/// All errors are swallowed and logged as warnings — callers should never
/// have their install/launch fail just because the menu bar app is unhappy.
export async function syncAndLaunchBrewTUIBar(): Promise<void> {
  if (process.platform !== 'darwin') return;

  const { checkBrewTUIBarVersion } = await import('./version-check.js');

  try {
    if (!(await isBrewTUIBarInstalled())) {
      console.log(t('cli_brewtuibarInstalling'));
      await installBrewTUIBar(false, false);
      console.log(t('cli_brewtuibarInstalled'));
    } else {
      // Reinstall in place when the installed bundle is older than the CLI.
      // Same contract enforced by `checkBrewTUIBarVersion`, so the menubar
      // app and CLI always agree on the license/IPC schema.
      const status = await checkBrewTUIBarVersion();
      if (status.kind === 'outdated') {
        console.log(t('cli_brewtuibarUpdating', { installed: status.installed, expected: status.expected }));
        await installBrewTUIBar(false, true);
        console.log(t('cli_brewtuibarInstalled'));
      }
    }
    await launchBrewTUIBar();
  } catch (err) {
    console.warn(t('cli_brewtuibarAutoFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

export async function uninstallBrewTUIBar(): Promise<void> {
  if (!await isBrewTUIBarInstalled()) {
    throw new Error(t('cli_brewtuibarNotInstalled'));
  }
  // Refuse to delete a foreign app that happens to live at the same path.
  const id = await installedBundleId();
  if (id && id !== BREWTUIBAR_BUNDLE_ID) {
    throw new Error(t('cli_brewtuibarForeignBundle', { id }));
  }

  await rm(BREWTUIBAR_APP_PATH, { recursive: true, force: true });
}
