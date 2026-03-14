/**
 * Ollama Integration — Local LLM for air-gap COSMIC enrichment
 * Optional: gracefully skips if Ollama is not running
 * Enriches COSMIC decisions with LLM-generated natural language
 */
import * as http from 'http';

export interface OllamaConfig {
  host: string;
  port: number;
  model: string;
  timeout: number;
}

const DEFAULT_CONFIG: OllamaConfig = {
  host: 'localhost',
  port: 11434,
  model: 'llama3.2',  // fast, local, good for structured tasks
  timeout: 15000,
};

async function ollamaAvailable(cfg: OllamaConfig): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`http://${cfg.host}:${cfg.port}/api/tags`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

async function ollamaGenerate(prompt: string, cfg: OllamaConfig): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: cfg.model, prompt, stream: false });
    const req = http.request({
      hostname: cfg.host,
      port: cfg.port,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response || '');
        } catch { reject(new Error('Invalid Ollama response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(cfg.timeout, () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(body);
    req.end();
  });
}

export async function enrichDecision(
  query: string,
  domain: string,
  confidence: number,
  causalChain: any[],
  cfg: Partial<OllamaConfig> = {}
): Promise<{ enriched: boolean; enhanced_decision?: string; model_used?: string }> {
  const config = { ...DEFAULT_CONFIG, ...cfg };

  const available = await ollamaAvailable(config);
  if (!available) {
    return { enriched: false };
  }

  const topCauses = causalChain.slice(0, 2).map(c => `- ${c.cause} → ${c.effect}`).join('\n');
  const signal = confidence > 0.75 ? 'BUY' : confidence > 0.55 ? 'HOLD' : 'WATCH';

  const prompt = `You are COSMIC, an advanced intelligence system. Provide a concise 2-3 sentence executive decision for this query.

Query: ${query}
Domain: ${domain}
Signal: ${signal} (confidence: ${(confidence * 100).toFixed(0)}%)
Key causal factors:
${topCauses}

Respond with ONLY the executive decision text. No preamble. Be specific, direct, and actionable.`;

  try {
    const response = await ollamaGenerate(prompt, config);
    return {
      enriched: true,
      enhanced_decision: response.trim(),
      model_used: config.model,
    };
  } catch {
    return { enriched: false };
  }
}

export async function checkOllamaStatus(cfg: Partial<OllamaConfig> = {}): Promise<{
  available: boolean;
  host: string;
  port: number;
  model: string;
}> {
  const config = { ...DEFAULT_CONFIG, ...cfg };
  const available = await ollamaAvailable(config);
  return { available, host: config.host, port: config.port, model: config.model };
}
