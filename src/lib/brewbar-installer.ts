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
const BREWBAR_APP_PATH = '/Applications/BrewBar.app';
const DOWNLOAD_URL = 'https://github.com/MoLinesDesigns/Brew-TUI/releases/latest/download/BrewBar.app.zip';
const MAX_SIZE = 200 * 1024 * 1024; // 200 MB

export async function isBrewBarInstalled(): Promise<boolean> {
  try {
    await access(BREWBAR_APP_PATH);
    return true;
  } catch {
    return false;
  }
}

/// Returns true if the BrewBar process is currently running.
/// Used by the installer to decide whether to quit + relaunch after an update.
export async function isBrewBarRunning(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const { stdout } = await execFileAsync('pgrep', ['-x', 'BrewBar']);
    // pgrep prints one PID per line when it finds matches; stdout vacío == no proceso.
    return stdout.trim().length > 0;
  } catch {
    // pgrep exits 1 when no match; that means "not running", not a failure.
    return false;
  }
}

/// Asks BrewBar to quit gracefully (LSUIElement → no dialogs), then falls back
/// to pkill if it hasn't exited within 3 s. Required before reemplazar el bundle:
/// `ditto -xk` sobre una app en ejecución deja un BrewBar viejo con un Info.plist
/// nuevo, lo cual confunde el monitor de last-action y los watchers FSEvents.
async function quitBrewBar(): Promise<void> {
  if (process.platform !== 'darwin') return;
  try {
    await execFileAsync('osascript', ['-e', 'tell application "BrewBar" to quit']);
  } catch {
    /* osascript falla si la app no está registrada; pasamos a pkill */
  }
  for (let i = 0; i < 15; i++) {
    if (!(await isBrewBarRunning())) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  try {
    await execFileAsync('pkill', ['-x', 'BrewBar']);
  } catch {
    /* nada que matar */
  }
}

export async function installBrewBar(isPro: boolean, force = false): Promise<void> {
  // macOS only
  if (process.platform !== 'darwin') {
    throw new Error(t('cli_brewbarMacOnly'));
  }

  // Pro check
  if (!isPro) {
    throw new Error(t('cli_brewbarProRequired'));
  }

  // Already installed check
  if (!force && await isBrewBarInstalled()) {
    throw new Error(t('cli_brewbarAlreadyInstalled'));
  }

  // EP-013: Use unique temp path
  const TMP_ZIP = join(tmpdir(), 'BrewBar-' + randomUUID() + '.zip');

  // Download zip (120s timeout for large binary)
  const res = await fetchWithTimeout(DOWNLOAD_URL, {}, 120_000);
  if (!res.ok || !res.body) {
    throw new Error(t('cli_brewbarDownloadFailed', { error: `HTTP ${res.status}` }));
  }

  // Reject downloads larger than 200 MB (from Content-Length header)
  const contentLength = Number(res.headers.get('content-length') ?? '0');
  if (contentLength > MAX_SIZE) {
    throw new Error(t('cli_brewbarDownloadFailed', { error: 'Download exceeds 200 MB size limit' }));
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
      throw new Error(t('cli_brewbarDownloadFailed', { error: 'SHA-256 mismatch: binary may have been tampered with' }));
    }
  } else {
    // NUEVO-003: Treat missing checksum as fatal — don't install unverified binaries
    await rm(TMP_ZIP, { force: true }).catch(() => {});
    throw new Error(t('cli_brewbarDownloadFailed', { error: 'SHA-256 checksum unavailable — cannot verify download integrity' }));
  }

  // Si BrewBar está corriendo, cerrarla antes de tocar el bundle. Sin esto
  // `ditto -xk` sobreescribe los recursos de un proceso vivo y la app queda
  // en estado degradado hasta el próximo lanzamiento.
  const wasRunning = await isBrewBarRunning();
  if (wasRunning) {
    await quitBrewBar();
  }

  // Remove old app if force reinstall
  if (force && await isBrewBarInstalled()) {
    await rm(BREWBAR_APP_PATH, { recursive: true, force: true });
  }

  // Unzip to /Applications
  try {
    await execFileAsync('ditto', ['-xk', TMP_ZIP, '/Applications/']);
  } catch (err) {
    throw new Error(t('cli_brewbarDownloadFailed', { error: err instanceof Error ? err.message : String(err) }), { cause: err });
  } finally {
    // Clean up tmp zip
    await rm(TMP_ZIP, { force: true }).catch(() => {});
  }

  // Si BrewBar estaba corriendo antes de la actualización, relanzarla para
  // que el usuario vuelva a ver el ícono en la menubar sin pasos manuales.
  if (wasRunning) {
    await launchBrewBar();
  }
}

/// Launches BrewBar detached from the parent process so it survives terminal close.
/// `open -g -a` runs the app in the background without bringing it to foreground.
export async function launchBrewBar(): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (!await isBrewBarInstalled()) return;
  try {
    await execFileAsync('open', ['-g', '-a', BREWBAR_APP_PATH]);
  } catch {
    // Non-fatal: BrewBar may already be running, or LaunchServices may need a moment.
  }
}

export async function uninstallBrewBar(): Promise<void> {
  if (!await isBrewBarInstalled()) {
    throw new Error(t('cli_brewbarNotInstalled'));
  }

  await rm(BREWBAR_APP_PATH, { recursive: true, force: true });
}
