/**
 * OMNIS KEY LLM Router
 * Fallback chain: Ollama (local) → Anthropic Claude → OpenAI GPT
 * Used to enrich COSMIC decisions with natural language reasoning
 * and to power conversational JARVIS-mode responses
 */
import * as https from 'https';
import { checkOllamaStatus, enrichDecision } from './ollama';
import { getConfig } from '../config';

export interface LLMResponse {
  text: string;
  model: string;
  provider: 'ollama' | 'anthropic' | 'openai' | 'fallback';
  latencyMs: number;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-haiku-3-5',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
    system: 'You are OMNIS KEY, a COSMIC-powered intelligence system. Be concise, direct, and actionable. No fluff.',
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content?.[0]?.text || '');
        } catch { reject(new Error('Anthropic parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Anthropic timeout')); });
    req.write(body);
    req.end();
  });
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [
      { role: 'system', content: 'You are OMNIS KEY, a COSMIC-powered intelligence system. Be concise and actionable.' },
      { role: 'user', content: prompt },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content || '');
        } catch { reject(new Error('OpenAI parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('OpenAI timeout')); });
    req.write(body);
    req.end();
  });
}

export async function routeLLM(
  prompt: string,
  contextPrompt?: string
): Promise<LLMResponse> {
  const start = Date.now();
  const cfg = getConfig() as any;
  const fullPrompt = contextPrompt ? `${contextPrompt}\n\nUser: ${prompt}` : prompt;

  // 1. Try Ollama (local, air-gap)
  const ollamaStatus = await checkOllamaStatus();
  if (ollamaStatus.available) {
    try {
      const { enrichDecision: _e, ...rest } = await import('./ollama');
      const ollamaResult = await enrichDecision(prompt, 'general', 0.75, []);
      if (ollamaResult.enriched && ollamaResult.enhanced_decision) {
        return {
          text: ollamaResult.enhanced_decision,
          model: ollamaStatus.model,
          provider: 'ollama',
          latencyMs: Date.now() - start,
        };
      }
    } catch {}
  }

  // 2. Try Anthropic Claude
  if (cfg.anthropicApiKey) {
    try {
      const text = await callAnthropic(fullPrompt, cfg.anthropicApiKey);
      if (text) return { text, model: 'claude-haiku-3-5', provider: 'anthropic', latencyMs: Date.now() - start };
    } catch {}
  }

  // 3. Try OpenAI
  if (cfg.openaiApiKey) {
    try {
      const text = await callOpenAI(fullPrompt, cfg.openaiApiKey);
      if (text) return { text, model: 'gpt-4o-mini', provider: 'openai', latencyMs: Date.now() - start };
    } catch {}
  }

  // 4. Fallback — COSMIC decision only (no LLM enrichment)
  return {
    text: '',
    model: 'none',
    provider: 'fallback',
    latencyMs: Date.now() - start,
  };
}

export async function getLLMStatus(): Promise<{
  ollama: boolean;
  anthropic: boolean;
  openai: boolean;
  active: string;
}> {
  const cfg = getConfig() as any;
  const ollama = await checkOllamaStatus();
  const anthropic = !!cfg.anthropicApiKey;
  const openai = !!cfg.openaiApiKey;
  const active = ollama.available ? `ollama:${ollama.model}` : anthropic ? 'anthropic:claude-haiku' : openai ? 'openai:gpt-4o-mini' : 'none (COSMIC only)';
  return { ollama: ollama.available, anthropic, openai, active };
}
