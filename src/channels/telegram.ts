import TelegramBot from 'node-telegram-bot-api';
import { cosmicRuntime } from '../cosmic/runtime';
import { memoryStore } from '../memory';
import { v4 as uuidv4 } from 'uuid';

let bot: TelegramBot | null = null;

function formatTrustStack(stack: any): string {
  const signal = stack.confidence > 0.75 ? '🟢 BUY' : stack.confidence > 0.55 ? '🟡 HOLD' : '🔴 WATCH';
  const topCause = stack.causal_chain?.[0];
  const topArc = stack.time_arcs?.[0];
  const topStress = stack.stress_tests?.find((s: any) => s.impact === 'critical' || s.impact === 'high');
  const heimdall = stack.heimdall?.attestation;
  const verdict = stack.heimdall?.verdict;

  let msg = `⚡ *OMNIS KEY — COSMIC INTELLIGENCE*\n\n`;
  msg += `*Domain:* ${stack.domain?.toUpperCase()}\n`;
  msg += `*Signal:* ${signal}\n`;
  msg += `*Confidence:* ${(stack.confidence * 100).toFixed(0)}%\n`;

  if (heimdall) {
    const tierEmoji = heimdall.trust_tier === 'SOVEREIGN' ? '👑' : heimdall.trust_tier === 'VERIFIED' ? '✅' : heimdall.trust_tier === 'PROVISIONAL' ? '🟡' : '⚠️';
    msg += `*HEIMDALL:* ${tierEmoji} ${heimdall.trust_tier} · Trust Score: ${heimdall.trust_score}/100\n`;
  }

  msg += `\n*Decision:*\n${stack.decision}\n`;

  if (verdict) msg += `\n_${verdict}_\n`;

  if (topCause) {
    msg += `\n*Top Causal Link (NOVA):*\n`;
    msg += `→ ${topCause.cause}\n`;
    msg += `  ↳ ${topCause.effect} _(${(topCause.weight * 100).toFixed(0)}% weight)_\n`;
  }

  if (topArc) {
    msg += `\n*30-Day Arc (ECLIPSE):*\n`;
    msg += `${(topArc.probability * 100).toFixed(0)}% — ${topArc.scenario.slice(0, 100)}\n`;
  }

  if (topStress) {
    msg += `\n*Top Risk (PULSAR):*\n`;
    msg += `⚠️ ${topStress.scenario.slice(0, 80)}\n`;
    msg += `_Mitigation: ${topStress.mitigation.slice(0, 80)}_\n`;
  }

  if (stack.ollama_enriched) msg += `\n_✨ Enhanced by local LLM (Ollama)_\n`;

  msg += `\n*Engines:* ${stack.engines_fired?.join(' · ')}\n`;
  msg += `*Trace:* \`${stack.audit_trace?.trace_id?.slice(0, 8)}\``;

  return msg;
}

export class TelegramAdapter {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  start(): void {
    try {
      bot = new TelegramBot(this.token, { polling: true });

      bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        if (!text || text.startsWith('/')) {
          if (text === '/start' || text === '/help') {
            bot!.sendMessage(chatId, 
              `⚡ *OMNIS KEY* — Local COSMIC Runtime\n\nSend any query and COSMIC will analyze it.\n\nExamples:\n• "Ward County TX mineral risk"\n• "Municipal budget analysis for Houston"\n• "Defense supply chain readiness"\n\n_Running locally. All data stays on your machine._`,
              { parse_mode: 'Markdown' }
            );
          }
          return;
        }

        // Typing indicator
        bot!.sendChatAction(chatId, 'typing');

        try {
          const stack = await cosmicRuntime.query(text);
          const sessionId = uuidv4();
          memoryStore.saveSession({
            id: sessionId,
            timestamp: Date.now(),
            query: text,
            response: stack.decision,
            trace_id: stack.audit_trace.trace_id,
            domain: stack.domain,
            confidence: stack.confidence,
          });

          const reply = formatTrustStack(stack);
          bot!.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
        } catch (err: any) {
          bot!.sendMessage(chatId, `⚠️ COSMIC pipeline error: ${err.message}`);
        }
      });

      console.log('[OMNIS KEY] Telegram adapter online');
    } catch (err: any) {
      console.error('[OMNIS KEY] Telegram adapter failed to start:', err.message);
    }
  }

  stop(): void {
    if (bot) {
      bot.stopPolling();
      bot = null;
      console.log('[OMNIS KEY] Telegram adapter stopped');
    }
  }
}
