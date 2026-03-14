/**
 * OMNIS KEY Session Manager
 * Persistent conversation context per channel user
 * Powers the Tony Stark / JARVIS multi-turn experience
 */
import * as fs from 'fs';
import * as path from 'path';
import { PATHS } from './config';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  domain?: string;
  confidence?: number;
}

export interface Session {
  session_id: string;
  user_id: string;          // channel-specific user ID
  channel: string;          // telegram / voice / api
  created_at: number;
  last_active: number;
  messages: Message[];
  context: {
    last_domain?: string;
    last_confidence?: number;
    active_constellation?: string;
    user_name?: string;
  };
}

const SESSIONS_DIR = path.join(PATHS.STATE_DIR, 'user_sessions');
const MAX_HISTORY = 20;      // messages to keep per session
const SESSION_TTL = 86400_000 * 7;  // 7 days

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function loadSession(sessionId: string): Session | null {
  ensureDir();
  const p = sessionPath(sessionId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

function saveSession(session: Session): void {
  ensureDir();
  fs.writeFileSync(sessionPath(session.session_id), JSON.stringify(session, null, 2));
}

function makeSessionId(userId: string, channel: string): string {
  return `${channel}-${userId}`.replace(/[^a-zA-Z0-9-]/g, '_');
}

export class SessionManager {
  getOrCreate(userId: string, channel: string, userName?: string): Session {
    const sessionId = makeSessionId(userId, channel);
    const existing = loadSession(sessionId);

    if (existing) {
      existing.last_active = Date.now();
      if (userName) existing.context.user_name = userName;
      return existing;
    }

    const session: Session = {
      session_id: sessionId,
      user_id: userId,
      channel,
      created_at: Date.now(),
      last_active: Date.now(),
      messages: [],
      context: {
        user_name: userName,
      },
    };
    saveSession(session);
    return session;
  }

  addMessage(session: Session, message: Message): void {
    session.messages.push(message);
    // Trim history
    if (session.messages.length > MAX_HISTORY) {
      // Keep system messages + last N
      const system = session.messages.filter(m => m.role === 'system');
      const recent = session.messages.filter(m => m.role !== 'system').slice(-MAX_HISTORY);
      session.messages = [...system, ...recent];
    }
    session.last_active = Date.now();
    // Update context
    if (message.domain) session.context.last_domain = message.domain;
    if (message.confidence) session.context.last_confidence = message.confidence;
    saveSession(session);
  }

  getHistory(session: Session, limit = 10): Message[] {
    return session.messages.slice(-limit);
  }

  buildContextPrompt(session: Session): string {
    const history = this.getHistory(session, 6);
    if (!history.length) return '';

    return history.map(m => {
      const role = m.role === 'user' ? 'User' : 'OMNIS KEY';
      return `${role}: ${m.content.slice(0, 200)}`;
    }).join('\n');
  }

  clearSession(userId: string, channel: string): void {
    const sessionId = makeSessionId(userId, channel);
    const p = sessionPath(sessionId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  listActiveSessions(): Session[] {
    ensureDir();
    const cutoff = Date.now() - SESSION_TTL;
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8')); }
        catch { return null; }
      })
      .filter((s): s is Session => s !== null && s.last_active > cutoff)
      .sort((a, b) => b.last_active - a.last_active);
  }
}

export const sessionManager = new SessionManager();
