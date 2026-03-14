import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface OmnisConfig {
  port: number;
  telegramBotToken?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxMemoryEntries: number;
  version: string;
}

const STATE_DIR = path.join(os.homedir(), '.omnis-key');
const CONFIG_PATH = path.join(STATE_DIR, 'config.json');
const LOG_PATH = path.join(STATE_DIR, 'daemon.log');
const PID_PATH = path.join(STATE_DIR, 'daemon.pid');
const DB_PATH = path.join(STATE_DIR, 'memory.db');

export const PATHS = { STATE_DIR, CONFIG_PATH, LOG_PATH, PID_PATH, DB_PATH };

const DEFAULTS: OmnisConfig = {
  port: 18800,
  logLevel: 'info',
  maxMemoryEntries: 1000,
  version: '1.0.0',
};

export function initConfig(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
  }
}

export function getConfig(): OmnisConfig {
  initConfig();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(patch: Partial<OmnisConfig>): void {
  initConfig();
  const current = getConfig();
  const updated = { ...current, ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
}

export function setConfigKey(key: string, value: string): void {
  const current = getConfig() as any;
  // Type coerce numbers
  const numVal = Number(value);
  current[key] = isNaN(numVal) || value === '' ? value : numVal;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
}
