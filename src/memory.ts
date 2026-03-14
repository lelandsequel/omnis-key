import * as fs from 'fs';
import * as path from 'path';
import { PATHS, initConfig, getConfig } from './config';

export interface SessionRecord {
  id: string;
  timestamp: number;
  query: string;
  response: string;
  trace_id: string;
  domain: string;
  confidence: number;
}

interface Store {
  sessions: SessionRecord[];
  kv: Record<string, { value: string; updated_at: number }>;
}

const SESSIONS_PATH = path.join(PATHS.STATE_DIR, 'sessions.json');
const KV_PATH = path.join(PATHS.STATE_DIR, 'kv.json');

function loadSessions(): SessionRecord[] {
  initConfig();
  try {
    if (!fs.existsSync(SESSIONS_PATH)) return [];
    return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf-8'));
  } catch { return []; }
}

function saveSessions(sessions: SessionRecord[]): void {
  initConfig();
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2));
}

function loadKV(): Record<string, { value: string; updated_at: number }> {
  initConfig();
  try {
    if (!fs.existsSync(KV_PATH)) return {};
    return JSON.parse(fs.readFileSync(KV_PATH, 'utf-8'));
  } catch { return {}; }
}

function saveKV(kv: Record<string, { value: string; updated_at: number }>): void {
  initConfig();
  fs.writeFileSync(KV_PATH, JSON.stringify(kv, null, 2));
}

export class MemoryStore {
  saveSession(record: SessionRecord): void {
    const cfg = getConfig();
    let sessions = loadSessions();
    sessions.unshift(record);
    // Trim to max
    if (sessions.length > cfg.maxMemoryEntries) {
      sessions = sessions.slice(0, cfg.maxMemoryEntries);
    }
    saveSessions(sessions);
  }

  getRecentSessions(n: number = 10): SessionRecord[] {
    return loadSessions().slice(0, n);
  }

  set(key: string, value: string): void {
    const kv = loadKV();
    kv[key] = { value, updated_at: Date.now() };
    saveKV(kv);
  }

  get(key: string): string | null {
    const kv = loadKV();
    return kv[key]?.value ?? null;
  }

  getStats(): { sessionCount: number; kvCount: number } {
    const sessions = loadSessions();
    const kv = loadKV();
    return {
      sessionCount: sessions.length,
      kvCount: Object.keys(kv).length,
    };
  }
}

export const memoryStore = new MemoryStore();
