import express, { Request, Response } from 'express';
import * as fs from 'fs';
import { getConfig, initConfig, PATHS } from './config';
import { cosmicRuntime } from './cosmic/runtime';
import { memoryStore } from './memory';
import { TelegramAdapter } from './channels/telegram';
import { checkOllamaStatus } from './cosmic/ollama';
import { listConstellations, loadBuiltinStubs } from './constellations/registry';
import { chronosFilter, buildChronosIndex, computeChronosStats, resolveWindow } from './cosmic/chronos';
import { generateComplianceReport, exportReportMarkdown, saveReport } from './audit/compliance';
import { textToSpeech, buildVerbalResponse } from './voice/tts';
import { sessionManager } from './sessions';
import { getLLMStatus } from './cosmic/llm';
import { v4 as uuidv4 } from 'uuid';

const startTime = Date.now();
initConfig();

// Load constellation stubs at boot
loadBuiltinStubs();

const app = express();
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const cfg = getConfig();
  const ollama = await checkOllamaStatus();
  const stats = memoryStore.getStats();
  const constellations = listConstellations();
  res.json({
    status: 'ok',
    version: cfg.version,
    port: cfg.port,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    uptimeHuman: formatUptime(Date.now() - startTime),
    sessions: stats.sessionCount,
    ollama: ollama.available ? `${ollama.model}@${ollama.host}:${ollama.port}` : 'offline',
    constellations: constellations.installed.length,
    telegram: !!(cfg as any).telegramBotToken,
  });
});

app.post('/query', async (req: Request, res: Response) => {
  const { query, domain } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query field required' });
  }
  try {
    const stack = await cosmicRuntime.query(query, domain);
    memoryStore.saveSession({
      id: uuidv4(),
      timestamp: Date.now(),
      query,
      response: stack.decision,
      trace_id: stack.audit_trace.trace_id,
      domain: stack.domain,
      confidence: stack.confidence,
    });
    res.json(stack);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/sessions', (_req: Request, res: Response) => {
  const sessions = memoryStore.getRecentSessions(20);
  res.json({ sessions });
});

app.get('/constellations', (_req: Request, res: Response) => {
  res.json(listConstellations());
});

app.get('/chronos', (req: Request, res: Response) => {
  const { window, domain, limit } = req.query as any;
  const sessions = memoryStore.getRecentSessions(500);
  const filtered = chronosFilter(sessions, {
    window: window || 'all',
    domain: domain || undefined,
    limit: parseInt(limit) || 50,
  });
  const entries = buildChronosIndex(filtered);
  const stats = computeChronosStats(sessions);
  const resolvedWindow = resolveWindow(window || 'all');
  res.json({ window: resolvedWindow, entries, stats });
});

app.get('/audit/export', (req: Request, res: Response) => {
  const { domain, limit, format } = req.query as any;
  const report = generateComplianceReport({ domain, limit: parseInt(limit) || 100 });
  if (format === 'md') {
    res.set('Content-Type', 'text/markdown');
    res.send(exportReportMarkdown(report));
  } else {
    res.json(report);
  }
});

// ── TTS endpoint ──────────────────────────────────────────────────────────────
app.post('/tts', async (req: Request, res: Response) => {
  const { text, trust_stack } = req.body;
  const cfg = getConfig() as any;

  if (!(cfg as any).elevenLabsApiKey) {
    return res.status(503).json({ error: 'ElevenLabs API key not configured. Run: omnis-key config set elevenLabsApiKey <key>' });
  }

  const speechText = trust_stack ? buildVerbalResponse(trust_stack) : text;
  if (!speechText) return res.status(400).json({ error: 'text or trust_stack required' });

  const audio = await textToSpeech(speechText, {});
  if (!audio) return res.status(500).json({ error: 'TTS generation failed' });

  res.set('Content-Type', 'audio/mpeg');
  res.set('Content-Length', String(audio.length));
  res.send(audio);
});

// ── JARVIS voice query — STT text in, audio out ───────────────────────────────
app.post('/jarvis', async (req: Request, res: Response) => {
  const { query, user_id, channel, speak } = req.body;
  const cfg = getConfig() as any;
  if (!query) return res.status(400).json({ error: 'query required' });

  // Get/create session
  const session = sessionManager.getOrCreate(user_id || 'anonymous', channel || 'voice');

  // Run COSMIC
  const stack = await cosmicRuntime.query(query);
  const sessionId = uuidv4();
  memoryStore.saveSession({
    id: sessionId,
    timestamp: Date.now(),
    query,
    response: stack.decision,
    trace_id: stack.audit_trace.trace_id,
    domain: stack.domain,
    confidence: stack.confidence,
  });

  // Add to session history
  sessionManager.addMessage(session, { role: 'user', content: query, timestamp: Date.now() });
  const verbalText = buildVerbalResponse(stack);
  sessionManager.addMessage(session, {
    role: 'assistant',
    content: verbalText,
    timestamp: Date.now(),
    domain: stack.domain,
    confidence: stack.confidence,
  });

  // If speak=true and ElevenLabs configured, return audio
  if (speak && (cfg as any).elevenLabsApiKey) {
    const audio = await textToSpeech(verbalText, {});
    if (audio) {
      res.set('Content-Type', 'audio/mpeg');
      res.set('X-Verbal-Text', encodeURIComponent(verbalText.slice(0, 200)));
      res.set('X-Confidence', String(stack.confidence));
      res.set('X-Domain', stack.domain);
      res.set('X-Trust-Score', String(stack.heimdall?.attestation?.trust_score || 0));
      res.send(audio);
      return;
    }
  }

  // Text fallback
  res.json({ trust_stack: stack, verbal_response: verbalText, session_id: session.session_id });
});

// ── Session management ────────────────────────────────────────────────────────
app.get('/sessions/list', (_req: Request, res: Response) => {
  res.json({ sessions: sessionManager.listActiveSessions().slice(0, 20) });
});

app.delete('/sessions/:userId', (req: Request, res: Response) => {
  sessionManager.clearSession(req.params.userId, (req.query.channel as string) || 'api');
  res.json({ ok: true });
});

// ── LLM status ────────────────────────────────────────────────────────────────
app.get('/llm/status', async (_req: Request, res: Response) => {
  res.json(await getLLMStatus());
});

// ── ElevenLabs Conversational AI — signed URL for WebSocket auth ──────────────
app.get('/convai/signed-url', async (_req: Request, res: Response) => {
  const cfg = getConfig() as any;
  const apiKey = cfg.elevenLabsApiKey;
  const agentId = cfg.elevenLabsAgentId || 'agent_2901kkq1hzf8e46vnncs9tjs94zv';

  if (!apiKey) return res.status(503).json({ error: 'ElevenLabs API key not configured' });

  try {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      { headers: { 'xi-api-key': apiKey } }
    );
    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ error: err });
    }
    const data = await resp.json() as { signed_url: string };
    res.json({ signed_url: data.signed_url, agent_id: agentId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── JARVIS voice UI ───────────────────────────────────────────────────────────
app.get('/jarvis', (_req: Request, res: Response) => {
  const cfg = getConfig() as any;
  const hasElevenLabs = !!cfg.elevenLabsApiKey;
  const agentId = cfg.elevenLabsAgentId || 'agent_2901kkq1hzf8e46vnncs9tjs94zv';
  res.send(buildJarvisPage(hasElevenLabs, agentId));
});

app.get('/status', async (_req: Request, res: Response) => {
  const cfg = getConfig();
  const ollama = await checkOllamaStatus();
  const stats = memoryStore.getStats();
  const constellations = listConstellations();
  res.json({
    runtime: 'OMNIS KEY',
    version: cfg.version,
    uptime_ms: Date.now() - startTime,
    port: cfg.port,
    sessions_total: stats.sessionCount,
    kv_entries: stats.kvCount,
    ollama: { available: ollama.available, model: ollama.model },
    constellations_installed: constellations.installed.length,
    constellations_available: constellations.available.length,
    telegram_connected: !!(cfg as any).telegramBotToken,
    air_gap_mode: !ollama.available,
  });
});

app.get('/', async (_req: Request, res: Response) => {
  const cfg = getConfig();
  const sessions = memoryStore.getRecentSessions(5);
  const stats = memoryStore.getStats();
  const uptime = formatUptime(Date.now() - startTime);
  const ollama = await checkOllamaStatus();
  const constellations = listConstellations();
  res.send(buildDashboard(cfg, sessions, stats, uptime, ollama, constellations));
});

// ── Start ─────────────────────────────────────────────────────────────────────

const cfg = getConfig();

fs.writeFileSync(PATHS.PID_PATH, String(process.pid));
console.log(`\n⚡ OMNIS KEY v${cfg.version}`);
console.log(`   Port:     ${cfg.port}`);
console.log(`   State:    ${PATHS.STATE_DIR}`);
console.log(`   PID:      ${process.pid}`);

let telegramAdapter: TelegramAdapter | null = null;
if ((cfg as any).telegramBotToken) {
  telegramAdapter = new TelegramAdapter((cfg as any).telegramBotToken);
  telegramAdapter.start();
} else {
  console.log('\n   Telegram: not configured');
  console.log('   → omnis-key config set telegramBotToken <token>');
}

app.listen(cfg.port, () => {
  console.log(`\n   Dashboard → http://localhost:${cfg.port}`);
  console.log(`   Query API → POST http://localhost:${cfg.port}/query`);
  console.log(`   Health    → GET  http://localhost:${cfg.port}/health\n`);
  console.log('   COSMIC runtime ONLINE ⚡\n');
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\n[OMNIS KEY] Shutting down...');
  if (telegramAdapter) telegramAdapter.stop();
  try { fs.unlinkSync(PATHS.PID_PATH); } catch {}
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function buildJarvisPage(hasElevenLabs: boolean, agentId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OMNIS KEY — JARVIS Mode</title>
<script src="https://cdn.jsdelivr.net/npm/@elevenlabs/client@latest/dist/index.umd.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;color:#e0e0e0;font-family:'Courier New',monospace;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.arc-container{position:relative;width:300px;height:300px;margin-bottom:28px;flex-shrink:0}
.arc-ring{position:absolute;border-radius:50%;border:2px solid transparent;transition:all 0.4s}
.ring-1{width:300px;height:300px;top:0;left:0;border-top-color:#FFD700;border-right-color:#FFD700;animation:spin1 4s linear infinite}
.ring-2{width:244px;height:244px;top:28px;left:28px;border-bottom-color:#00AAFF;border-left-color:#00AAFF;animation:spin2 3s linear infinite reverse}
.ring-3{width:188px;height:188px;top:56px;left:56px;border-top-color:#00FF88;animation:spin3 2s linear infinite}
.ring-1.speaking{border-top-color:#00FF88;border-right-color:#00FF88}
.ring-2.listening{border-bottom-color:#FF4444;border-left-color:#FF4444}
@keyframes spin1{to{transform:rotate(360deg)}}
@keyframes spin2{to{transform:rotate(360deg)}}
@keyframes spin3{to{transform:rotate(360deg)}}
.center-orb{position:absolute;width:120px;height:120px;top:90px;left:90px;border-radius:50%;background:radial-gradient(circle at 40% 40%,#1a1a2e,#000);border:2px solid #FFD700;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;transition:all 0.3s;user-select:none}
.center-orb:hover{box-shadow:0 0 24px rgba(255,215,0,0.25)}
.center-orb.idle{border-color:#FFD700}
.center-orb.connecting{border-color:#666;animation:pulse 1.5s ease-in-out infinite}
.center-orb.listening{border-color:#FF4444;box-shadow:0 0 40px rgba(255,68,68,0.5);animation:pulse 0.8s ease-in-out infinite}
.center-orb.speaking{border-color:#00FF88;box-shadow:0 0 40px rgba(0,255,136,0.45);animation:pulse 0.5s ease-in-out infinite}
.center-orb.disconnected{border-color:#333}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.orb-icon{font-size:1.8rem;margin-bottom:3px;pointer-events:none}
.orb-label{font-size:0.55rem;letter-spacing:0.2em;color:#888;text-transform:uppercase;pointer-events:none}
.title{font-size:1.6rem;font-weight:900;letter-spacing:0.15em;color:#FFD700;margin-bottom:3px;text-align:center}
.subtitle{color:#444;font-size:0.65rem;letter-spacing:0.2em;margin-bottom:24px;text-align:center}
.transcript{min-height:48px;max-width:580px;width:92%;text-align:center;color:#777;font-size:0.85rem;margin-bottom:10px;line-height:1.6;font-style:italic;transition:color 0.3s}
.transcript.user-speaking{color:#aaa}
.response{max-width:580px;width:92%;text-align:center;color:#FFD700;font-size:0.82rem;margin-bottom:18px;line-height:1.7;min-height:48px}
.meta-bar{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:16px;font-size:0.6rem;letter-spacing:0.1em;color:#333}
.meta-item{padding:3px 9px;border:1px solid #1a1a1a;transition:all 0.3s}
.meta-item.active{border-color:#FFD700;color:#FFD700}
.meta-item.green{border-color:#00FF88;color:#00FF88}
.barge-hint{color:#333;font-size:0.6rem;letter-spacing:0.1em;text-align:center;margin-bottom:4px}
.status-line{color:#444;font-size:0.6rem;letter-spacing:0.1em;text-align:center;margin-bottom:8px;min-height:16px}
.status-line.error{color:#FF4444}
.history{max-width:580px;width:92%;margin-top:16px;max-height:160px;overflow-y:auto}
.hist-item{padding:6px 10px;border-left:2px solid #1a1a1a;margin-bottom:4px;font-size:0.7rem;color:#555}
.hist-item.user{border-color:#333;color:#666}
.hist-item.ai{border-color:#FFD700;color:#888}
.nav{position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:16px;font-size:0.6rem;letter-spacing:0.15em}
.nav a{color:#2a2a2a;text-decoration:none;transition:color 0.2s}
.nav a:hover{color:#FFD700}
.conn-btn{margin-top:12px;background:none;border:1px solid #2a2a2a;color:#444;font-family:'Courier New',monospace;font-size:0.65rem;letter-spacing:0.15em;padding:6px 16px;cursor:pointer;transition:all 0.2s}
.conn-btn:hover{border-color:#FFD700;color:#FFD700}
</style>
</head>
<body>

<div class="nav">
  <a href="/">DASHBOARD</a>
  <a href="/jarvis">JARVIS</a>
  <a href="/constellations">CONSTELLATIONS</a>
</div>

<h1 class="title">⚡ OMNIS KEY</h1>
<p class="subtitle">COSMIC INTELLIGENCE · JARVIS MODE</p>

<div class="arc-container">
  <div class="arc-ring ring-1" id="ring1"></div>
  <div class="arc-ring ring-2" id="ring2"></div>
  <div class="arc-ring ring-3" id="ring3"></div>
  <div class="center-orb idle" id="orb" onclick="handleOrbClick()">
    <div class="orb-icon" id="orbIcon">🎙️</div>
    <div class="orb-label" id="orbLabel">TAP TO START</div>
  </div>
</div>

<div class="transcript" id="transcript">Press the orb to begin a conversation.</div>
<div class="response" id="response"></div>

<div class="meta-bar">
  <div class="meta-item" id="metaDomain">DOMAIN: —</div>
  <div class="meta-item" id="metaConf">CONFIDENCE: —</div>
  <div class="meta-item" id="metaHeimdall">HEIMDALL: —</div>
  <div class="meta-item green" id="metaMode">CONVAI: READY</div>
</div>

<div class="barge-hint" id="bargeHint">Interrupt at any time — just speak</div>
<div class="status-line" id="statusLine">${hasElevenLabs ? 'ElevenLabs Conversational AI · Android 18 voice' : 'ElevenLabs API key not configured'}</div>
<div class="history" id="history"></div>

<script>
const HAS_ELEVEN = ${hasElevenLabs};
const AGENT_ID = '${agentId}';
let conversation = null;
let isConnected = false;
let transcriptHistory = [];

const ElevenLabsClient = window.ElevenLabsClient;

function setOrb(mode, labelText) {
  const orb = document.getElementById('orb');
  const icon = document.getElementById('orbIcon');
  const label = document.getElementById('orbLabel');
  orb.className = 'center-orb ' + mode;
  const icons = { idle:'🎙️', connecting:'⟳', listening:'🔴', speaking:'🔊', disconnected:'💤' };
  const labels = { idle:'TAP TO START', connecting:'CONNECTING', listening:'LISTENING', speaking:'SPEAKING', disconnected:'DISCONNECTED' };
  icon.textContent = icons[mode] || '🎙️';
  label.textContent = labelText || labels[mode] || mode.toUpperCase();
  document.getElementById('ring1').className = 'arc-ring ring-1' + (mode === 'speaking' ? ' speaking' : '');
  document.getElementById('ring2').className = 'arc-ring ring-2' + (mode === 'listening' ? ' listening' : '');
}

function setStatus(msg, isError) {
  const el = document.getElementById('statusLine');
  el.textContent = msg;
  el.className = 'status-line' + (isError ? ' error' : '');
}

function updateMeta(domain, confidence, heimdall) {
  if (domain) { const el = document.getElementById('metaDomain'); el.textContent = 'DOMAIN: ' + String(domain).toUpperCase(); el.classList.add('active'); }
  if (confidence != null) { const el = document.getElementById('metaConf'); el.textContent = 'CONFIDENCE: ' + Math.round(parseFloat(confidence)*100) + '%'; el.classList.add('active'); }
  if (heimdall != null) { const el = document.getElementById('metaHeimdall'); el.textContent = 'HEIMDALL: ' + heimdall + '/100'; el.classList.add('active'); }
}

function addHistory(role, text) {
  transcriptHistory.push({ role, text });
  if (transcriptHistory.length > 12) transcriptHistory.shift();
  const hist = document.getElementById('history');
  hist.innerHTML = transcriptHistory.slice(-6).reverse().map(h =>
    '<div class="hist-item ' + h.role + '">' + (h.role === 'user' ? 'You' : 'COSMIC') + ': ' + h.text.slice(0, 120) + '</div>'
  ).join('');
}

async function startConversation() {
  if (!HAS_ELEVEN) {
    setStatus('ElevenLabs API key not configured. Run: omnis-key config set elevenLabsApiKey sk_...', true);
    return;
  }
  if (!ElevenLabsClient || !ElevenLabsClient.Conversation) {
    setStatus('ElevenLabs SDK not loaded. Check network.', true);
    return;
  }

  setOrb('connecting');
  setStatus('Requesting signed URL...');

  try {
    // Get signed URL from our daemon
    const urlResp = await fetch('/convai/signed-url');
    if (!urlResp.ok) {
      const err = await urlResp.json();
      throw new Error(err.error || 'Failed to get signed URL');
    }
    const { signed_url } = await urlResp.json();

    setStatus('Connecting to ElevenLabs...');

    conversation = await ElevenLabsClient.Conversation.startSession({
      signedUrl: signed_url,

      // Client tool: COSMIC query — runs locally against our daemon
      clientTools: {
        cosmic_query: async ({ query, domain }) => {
          setStatus('Running COSMIC pipeline: ' + query.slice(0, 50) + '...');
          try {
            const resp = await fetch('/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, domain })
            });
            const data = await resp.json();
            updateMeta(data.domain, data.confidence, data.heimdall?.attestation?.trust_score);
            return JSON.stringify({
              decision: data.decision,
              confidence: data.confidence,
              domain: data.domain,
              signal: data.signal,
              heimdall_score: data.heimdall?.attestation?.trust_score,
              heimdall_tier: data.heimdall?.attestation?.tier,
              causal_drivers: data.nova?.top_causes?.slice(0, 3) || [],
              stress_triggered: data.pulsar?.triggered_scenarios?.length || 0,
              approved: data.aurora?.approved
            });
          } catch (e) {
            return JSON.stringify({ error: 'COSMIC pipeline unavailable: ' + e.message });
          }
        }
      },

      onConnect: () => {
        isConnected = true;
        setStatus('Connected · Android 18 voice · Interrupt anytime');
        document.getElementById('metaMode').textContent = 'CONVAI: LIVE';
      },

      onDisconnect: () => {
        isConnected = false;
        conversation = null;
        setOrb('idle');
        setStatus('Session ended. Tap to start again.');
        document.getElementById('metaMode').textContent = 'CONVAI: READY';
      },

      onError: (msg) => {
        setStatus('Error: ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)), true);
        setOrb('idle');
      },

      onModeChange: ({ mode }) => {
        if (mode === 'speaking') {
          setOrb('speaking');
          setStatus('Android 18 speaking — interrupt anytime');
        } else if (mode === 'listening') {
          setOrb('listening');
          setStatus('Listening...');
          document.getElementById('transcript').className = 'transcript user-speaking';
        }
      },

      onMessage: ({ source, message }) => {
        if (source === 'user') {
          document.getElementById('transcript').textContent = '"' + message + '"';
          addHistory('user', message);
        } else if (source === 'ai') {
          document.getElementById('response').textContent = message;
          addHistory('ai', message);
          document.getElementById('transcript').className = 'transcript';
        }
      },
    });

  } catch (e) {
    setStatus('Connection failed: ' + e.message, true);
    setOrb('idle');
    conversation = null;
  }
}

async function stopConversation() {
  if (conversation) {
    try { await conversation.endSession(); } catch {}
    conversation = null;
  }
  isConnected = false;
  setOrb('idle');
  setStatus('Session ended. Tap to start again.');
}

async function handleOrbClick() {
  if (isConnected) {
    await stopConversation();
  } else {
    await startConversation();
  }
}

// Spacebar = start/stop
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.matches('input,textarea')) {
    e.preventDefault();
    handleOrbClick();
  }
});
<\/script>
</body>
</html>`;
}

function buildDashboard(cfg: any, sessions: any[], stats: any, uptime: string, ollama: any, constellations: any): string {
  const sessionRows = sessions.map(s => {
    const tier = s.confidence >= 0.75 ? '🟢' : s.confidence >= 0.55 ? '🟡' : '🔴';
    return `<tr>
      <td>${new Date(s.timestamp).toLocaleTimeString()}</td>
      <td><span class="tag">${s.domain?.toUpperCase() || '—'}</span></td>
      <td>${tier} ${(s.confidence * 100).toFixed(0)}%</td>
      <td class="query-cell">${(s.query || '').slice(0, 65)}</td>
    </tr>`;
  }).join('');

  const engineList = ['CHRONOS','METEOR','NOVA','ECLIPSE','PULSAR','AURORA','QUASAR','HEIMDALL','NEBULA','ASTRAL','COMET','CRUCIBLE'];
  const engineDots = engineList.map(e => `<span class="etag">${e}</span>`).join('');

  const constellationRows = constellations.installed.map((c: any) =>
    `<tr><td><span class="ctag">${c.name.toUpperCase()}</span></td><td>${c.displayName}</td><td>v${c.version}</td><td>${c.engines.length} engines</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty">No constellations installed</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OMNIS KEY — COSMIC Runtime</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#d0d0d0;font-family:'Courier New',monospace;min-height:100vh}
.header{border-bottom:1px solid #1a1a1a;padding:24px 32px;display:flex;align-items:baseline;gap:16px}
h1{color:#FFD700;font-size:2rem;letter-spacing:0.12em;font-weight:900}
.version{color:#444;font-size:0.8rem}
.status-badge{margin-left:auto;background:#001a00;border:1px solid #00FF88;color:#00FF88;padding:4px 12px;font-size:0.7rem;letter-spacing:0.15em}
.container{padding:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:32px}
.card{background:#0f0f0f;border:1px solid #1a1a1a;padding:18px}
.card-label{color:#444;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px}
.card-val{color:#FFD700;font-size:1.6rem;font-weight:900}
.card-sub{color:#333;font-size:0.7rem;margin-top:4px}
h2{color:#FFD700;font-size:0.75rem;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #1a1a1a}
.section{margin-bottom:32px}
table{width:100%;border-collapse:collapse;font-size:0.8rem}
th{color:#333;text-align:left;padding:8px 10px;border-bottom:1px solid #1a1a1a;font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase}
td{padding:8px 10px;border-bottom:1px solid #111;color:#aaa;vertical-align:middle}
tr:hover td{background:#111}
.query-cell{color:#888;max-width:400px}
.tag{background:#1a1000;color:#FFD700;padding:2px 6px;font-size:0.65rem;letter-spacing:0.1em}
.etag{background:#001a00;border:1px solid #003a00;color:#00AA44;padding:3px 8px;font-size:0.65rem;letter-spacing:0.08em;display:inline-block;margin:2px}
.ctag{background:#0a0a1a;color:#6699FF;padding:2px 6px;font-size:0.65rem}
.engines{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:32px}
.query-panel{background:#0f0f0f;border:1px solid #1a1a1a;padding:20px;margin-bottom:32px}
.query-row{display:flex;gap:8px;margin-bottom:8px}
input[type=text]{background:#000;border:1px solid #2a2a2a;color:#e0e0e0;font-family:inherit;font-size:0.85rem;padding:10px 14px;flex:1;outline:none}
input[type=text]:focus{border-color:#FFD700}
select{background:#000;border:1px solid #2a2a2a;color:#888;font-family:inherit;font-size:0.8rem;padding:10px 8px}
.btn{background:#FFD700;color:#000;border:none;padding:10px 18px;font-family:inherit;font-weight:900;cursor:pointer;font-size:0.8rem;letter-spacing:0.05em;white-space:nowrap}
.btn:hover{background:#FFC200}
pre{background:#000;border:1px solid #1a1a1a;padding:16px;font-size:0.72rem;color:#888;overflow:auto;max-height:500px;white-space:pre-wrap;line-height:1.5}
#result{display:none}
.heimdall-bar{height:4px;background:#1a1a1a;margin-top:4px}
.heimdall-fill{height:100%;background:linear-gradient(90deg,#FF4400,#FFD700,#00FF88)}
.empty{color:#333;font-style:italic}
.ollama-status{color:${ollama.available ? '#00FF88' : '#444'};}
</style>
</head>
<body>
<div class="header">
  <h1>⚡ OMNIS KEY</h1>
  <span class="version">LOCAL COSMIC RUNTIME · v${cfg.version}</span>
  <div style="margin-left:auto;display:flex;gap:12px;align-items:center">
    <a href="/jarvis" style="background:#1a1000;border:1px solid #FFD700;color:#FFD700;padding:6px 14px;font-size:0.7rem;letter-spacing:0.1em;text-decoration:none;">🎙️ JARVIS MODE</a>
    <span class="status-badge">● ONLINE</span>
  </div>
</div>

<div class="container">

<div class="grid">
  <div class="card">
    <div class="card-label">Status</div>
    <div class="card-val" style="color:#00FF88;font-size:1.1rem">ONLINE</div>
    <div class="card-sub">Port ${cfg.port} · ${uptime} uptime</div>
  </div>
  <div class="card">
    <div class="card-label">Sessions</div>
    <div class="card-val">${stats.sessionCount}</div>
    <div class="card-sub">Queries processed</div>
  </div>
  <div class="card">
    <div class="card-label">Local LLM</div>
    <div class="card-val ollama-status" style="font-size:0.9rem;padding-top:4px">${ollama.available ? '● ' + ollama.model : '○ offline'}</div>
    <div class="card-sub">${ollama.available ? 'Ollama enrichment ON' : 'Air-gap mode active'}</div>
  </div>
  <div class="card">
    <div class="card-label">Telegram</div>
    <div class="card-val" style="font-size:0.9rem;padding-top:4px">${cfg.telegramBotToken ? '🟢 online' : '⚪ not set'}</div>
    <div class="card-sub">${cfg.telegramBotToken ? 'Channel adapter running' : 'omnis-key config set token'}</div>
  </div>
  <div class="card">
    <div class="card-label">Constellations</div>
    <div class="card-val">${constellations.installed.length}</div>
    <div class="card-sub">of ${constellations.available.length} available</div>
  </div>
</div>

<div class="section">
  <h2>Query COSMIC</h2>
  <div class="query-panel">
    <div class="query-row">
      <input id="q" type="text" placeholder="e.g. Ward County TX mineral risk · Houston municipal budget · DoD supply chain readiness" />
      <select id="domain">
        <option value="auto">AUTO</option>
        <option value="mineral">MINERAL</option>
        <option value="civic">CIVIC</option>
        <option value="agriculture">AGRICULTURE</option>
        <option value="defense">DEFENSE</option>
        <option value="water">WATER</option>
        <option value="gas">GAS (POLARIS)</option>
        <option value="logistics">LOGISTICS</option>
      </select>
      <button class="btn" onclick="runQuery()">RUN COSMIC →</button>
    </div>
  </div>
  <div id="result">
    <h2>Trust Stack Output</h2>
    <pre id="output"></pre>
  </div>
</div>

<div class="section">
  <h2>Recent Queries</h2>
  <table>
    <thead><tr><th>Time</th><th>Domain</th><th>Confidence</th><th>Query</th></tr></thead>
    <tbody>${sessionRows || '<tr><td colspan="4" class="empty">No queries yet — run your first COSMIC query above</td></tr>'}</tbody>
  </table>
</div>

<div class="section">
  <h2>Active Engines</h2>
  <div class="engines">${engineDots}</div>
</div>

<div class="section">
  <h2>Constellations</h2>
  <table>
    <thead><tr><th>Name</th><th>Description</th><th>Version</th><th>Engines</th></tr></thead>
    <tbody>${constellationRows}</tbody>
  </table>
</div>

</div>

<script>
async function runQuery() {
  const q = document.getElementById('q').value.trim();
  const domain = document.getElementById('domain').value;
  if (!q) return;
  const out = document.getElementById('output');
  const resultDiv = document.getElementById('result');
  out.textContent = '⚡ Running COSMIC pipeline...';
  resultDiv.style.display = 'block';
  try {
    const r = await fetch('/query', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({query: q, domain})
    });
    const data = await r.json();
    // Pretty format key fields
    const formatted = {
      decision: data.decision,
      confidence: data.confidence,
      domain: data.domain,
      heimdall: {
        trust_score: data.heimdall?.attestation?.trust_score,
        trust_tier: data.heimdall?.attestation?.trust_tier,
        verdict: data.heimdall?.verdict,
      },
      causal_chain: data.causal_chain,
      time_arcs: data.time_arcs?.map(a => ({horizon: a.horizon, probability: a.probability, scenario: a.scenario})),
      top_stress: data.stress_tests?.[0],
      engines_fired: data.engines_fired,
      audit_trace: {trace_id: data.audit_trace?.trace_id, hash: data.audit_trace?.hash_chain?.slice(0,16)},
      ollama_enriched: data.ollama_enriched,
    };
    out.textContent = JSON.stringify(formatted, null, 2);
  } catch(e) {
    out.textContent = 'Error: ' + e.message;
  }
}
document.getElementById('q').addEventListener('keydown', e => { if (e.key === 'Enter') runQuery(); });
</script>
</body>
</html>`;
}
