/**
 * CHRONOS — Temporal Intelligence Layer
 * Time-anchors every memory entry. Enables temporal queries across sessions.
 * "What happened 3 days ago?" "Show me mineral queries from last week."
 */

export interface TemporalWindow {
  label: string;
  startMs: number;
  endMs: number;
}

export interface TemporalIndex {
  session_id: string;
  query: string;
  domain: string;
  confidence: number;
  timestamp: number;
  temporal_tags: string[];    // e.g. ['morning', 'this-week', 'recent']
  relative_label: string;     // e.g. "2h ago", "yesterday", "last Monday"
}

export interface ChronosQuery {
  window?: 'last-hour' | 'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'all';
  domain?: string;
  minConfidence?: number;
  limit?: number;
}

export interface ChronosStats {
  total_sessions: number;
  domains: Record<string, number>;
  avg_confidence: number;
  most_active_window: string;
  last_query_at: string;
  first_query_at: string;
  peak_hour: number;   // 0-23
}

// ── Temporal tag generation ───────────────────────────────────────────────────

export function getTemporalTags(timestampMs: number): string[] {
  const now = Date.now();
  const diff = now - timestampMs;
  const tags: string[] = [];

  if (diff < 3600_000) tags.push('last-hour', 'recent', 'today');
  else if (diff < 86400_000) {
    tags.push('today');
    const hour = new Date(timestampMs).getHours();
    if (hour < 12) tags.push('this-morning');
    else if (hour < 17) tags.push('this-afternoon');
    else tags.push('this-evening');
  } else if (diff < 172800_000) tags.push('yesterday');
  else if (diff < 604800_000) {
    tags.push('this-week');
    const day = new Date(timestampMs).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    tags.push(`last-${day}`);
  } else if (diff < 2592000_000) tags.push('this-month', 'last-week');
  else tags.push('older');

  return tags;
}

export function getRelativeLabel(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffS = Math.floor(diffMs / 1000);
  const diffM = Math.floor(diffS / 60);
  const diffH = Math.floor(diffM / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffS < 60) return 'just now';
  if (diffM < 60) return `${diffM}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return 'yesterday';
  if (diffD < 7) return `${diffD} days ago`;
  if (diffD < 14) return 'last week';
  return new Date(timestampMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Window resolution ─────────────────────────────────────────────────────────

export function resolveWindow(window?: ChronosQuery['window']): TemporalWindow {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  switch (window) {
    case 'last-hour':
      return { label: 'Last Hour', startMs: now - 3600_000, endMs: now };
    case 'today':
      return { label: 'Today', startMs: startOfDay.getTime(), endMs: now };
    case 'yesterday': {
      const yStart = startOfDay.getTime() - 86400_000;
      return { label: 'Yesterday', startMs: yStart, endMs: startOfDay.getTime() };
    }
    case 'this-week':
      return { label: 'This Week', startMs: now - 604800_000, endMs: now };
    case 'last-week':
      return { label: 'Last Week', startMs: now - 1209600_000, endMs: now - 604800_000 };
    case 'this-month':
      return { label: 'This Month', startMs: now - 2592000_000, endMs: now };
    default:
      return { label: 'All Time', startMs: 0, endMs: now };
  }
}

// ── CHRONOS index builder ────────────────────────────────────────────────────

export function buildChronosIndex(sessions: any[]): TemporalIndex[] {
  return sessions.map(s => ({
    session_id: s.id,
    query: s.query,
    domain: s.domain || 'unknown',
    confidence: s.confidence || 0,
    timestamp: s.timestamp,
    temporal_tags: getTemporalTags(s.timestamp),
    relative_label: getRelativeLabel(s.timestamp),
  }));
}

// ── CHRONOS filter ────────────────────────────────────────────────────────────

export function chronosFilter(sessions: any[], query: ChronosQuery): any[] {
  const window = resolveWindow(query.window);

  return sessions
    .filter(s => {
      const ts = s.timestamp;
      if (ts < window.startMs || ts > window.endMs) return false;
      if (query.domain && s.domain !== query.domain) return false;
      if (query.minConfidence && (s.confidence || 0) < query.minConfidence) return false;
      return true;
    })
    .slice(0, query.limit || 50);
}

// ── CHRONOS stats ─────────────────────────────────────────────────────────────

export function computeChronosStats(sessions: any[]): ChronosStats {
  if (!sessions.length) {
    return {
      total_sessions: 0,
      domains: {},
      avg_confidence: 0,
      most_active_window: 'none',
      last_query_at: 'never',
      first_query_at: 'never',
      peak_hour: 0,
    };
  }

  const domains: Record<string, number> = {};
  const hourCounts: Record<number, number> = {};
  let totalConf = 0;

  for (const s of sessions) {
    domains[s.domain || 'unknown'] = (domains[s.domain || 'unknown'] || 0) + 1;
    totalConf += s.confidence || 0;
    const h = new Date(s.timestamp).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }

  const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const peakHour = parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '9');

  // Most active window
  const recentCount = sessions.filter(s => Date.now() - s.timestamp < 86400_000).length;
  const weekCount = sessions.filter(s => Date.now() - s.timestamp < 604800_000).length;
  const mostActive = recentCount > 5 ? 'today' : weekCount > 10 ? 'this-week' : 'all-time';

  return {
    total_sessions: sessions.length,
    domains,
    avg_confidence: Math.round((totalConf / sessions.length) * 100) / 100,
    most_active_window: mostActive,
    last_query_at: getRelativeLabel(sessions[0].timestamp),
    first_query_at: getRelativeLabel(sorted[0].timestamp),
    peak_hour: peakHour,
  };
}
