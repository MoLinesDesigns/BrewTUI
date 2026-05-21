import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds for instant commands
const STREAM_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle timeout for streaming

// SEG-004: resolver `brew` a ruta absoluta una sola vez al cargar el modulo.
// Sin esto, `spawn('brew', ...)` hereda PATH del usuario y un PATH hijack
// (dotfile comprometido, malware) podria suplantar el binario. Probamos las
// dos rutas canonicas en macOS (Apple Silicon y Intel) y caemos al
// resolutor del shell solo si ninguna existe.
function resolveBrewPath(): string {
  if (existsSync('/opt/homebrew/bin/brew')) return '/opt/homebrew/bin/brew';
  if (existsSync('/usr/local/bin/brew')) return '/usr/local/bin/brew';
  return 'brew';
}

export const BREW_BIN = resolveBrewPath();

export async function execBrew(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(BREW_BIN, args, { env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' } });
    let stdout = '';
    let stderr = '';
    let killed = false;

    // EP-012: Timeout with AbortController pattern
    const timer = setTimeout(() => {
      killed = true;
      proc.kill();
      reject(new Error(`brew ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `brew ${args.join(' ')} exited with code ${code}`));
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      if (killed) return;
      reject(new Error(`Failed to run brew: ${err.message}`));
    });
  });
}

export async function* streamBrew(args: string[]): AsyncGenerator<string> {
  const proc = spawn(BREW_BIN, args, {
    env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  const lines: string[] = [];
  let done = false;
  let exitError: string | null = null;
  let lastOutputAt = Date.now();

  // PERF-002: replace the 100 ms sleep loop with a Promise that resolves on
  // every stdout/stderr chunk or exit. The previous implementation woke the
  // event loop ten times per second and added up to 100 ms latency per line.
  let waker: (() => void) | null = null;
  const wake = () => {
    if (waker) { const w = waker; waker = null; w(); }
  };
  const wait = () => new Promise<void>((resolve) => { waker = resolve; });

  const push = (chunk: Buffer) => {
    lastOutputAt = Date.now();
    buffer += chunk.toString();
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      if (line.trim()) lines.push(line);
    }
    wake();
  };

  proc.stdout.on('data', push);
  proc.stderr.on('data', push);

  proc.on('close', (code) => {
    if (buffer.trim()) lines.push(buffer.trim());
    done = true;
    if (code !== 0) {
      exitError = `brew ${args.join(' ')} exited with code ${code}`;
    }
    wake();
  });

  proc.on('error', (err) => {
    done = true;
    exitError = err.message;
    wake();
  });

  try {
    while (!done || lines.length > 0) {
      if (lines.length > 0) {
        yield lines.shift()!;
      } else if (!done) {
        // EP-012: kill process if idle for too long. The idle check still runs
        // periodically through a guard timer because the wake path only fires
        // on output — a hung child without any output would never wake us.
        const guard = setTimeout(wake, 1_000);
        await wait();
        clearTimeout(guard);
        if (Date.now() - lastOutputAt > STREAM_IDLE_TIMEOUT_MS) {
          proc.kill();
          throw new Error(`brew ${args.join(' ')} timed out: no output for ${STREAM_IDLE_TIMEOUT_MS / 1000}s`);
        }
      }
    }
  } finally {
    if (!done) {
      proc.kill();
    }
  }

  // Throw after all lines have been yielded so the consumer sees
  // brew's stderr output in the stream before the error surfaces.
  if (exitError) {
    throw new Error(exitError);
  }
}
