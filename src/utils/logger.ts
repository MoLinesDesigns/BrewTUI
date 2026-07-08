import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'warn';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

// When the Ink TUI owns stdout (raw mode), writing to console corrupts the frame.
// We detect this and redirect logs to a file under ~/.brewtui-bar/logs/ instead.
const LOG_DIR = join(homedir(), '.brewtui-bar', 'logs');
const LOG_FILE = join(LOG_DIR, 'brewtui-bar.log');
let logDirReady = false;

function ensureLogDir(): boolean {
  if (logDirReady) return true;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    logDirReady = true;
    return true;
  } catch {
    return false;
  }
}

function isTuiActive(): boolean {
  // src/index.tsx sets BREW_TUI_TUI_MODE=1 before rendering Ink. Once set, any
  // console.* call would corrupt the rendered frame, so we route logs to a file.
  return process.env.BREW_TUI_TUI_MODE === '1';
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const line = `[${level.toUpperCase()}] ${msg}${ctx ? ' ' + JSON.stringify(ctx) : ''}`;

  if (isTuiActive() && ensureLogDir()) {
    try {
      appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
      return;
    } catch {
      // Fall through to console as last resort.
    }
  }

  switch (level) {
    case 'debug': console.debug(line); break;
    case 'info': console.info(line); break;
    case 'warn': console.warn(line); break;
    case 'error': console.error(line); break;
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
};
