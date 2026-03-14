/**
 * OMNIS KEY Voice Layer — ElevenLabs TTS
 * Android 18 voice: AU0Zt356Bbv9PdCZYIF7
 * Tony Stark / JARVIS mode
 */
import * as https from 'https';
import { getConfig } from '../config';

export interface TTSOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  modelId?: string;
}

const DEFAULT_VOICE_ID = 'AU0Zt356Bbv9PdCZYIF7';   // Android 18 — Meredith McCoy clone
const DEFAULT_MODEL    = 'eleven_v3';

export function buildVerbalResponse(trustStack: any): string {
  const domain = trustStack.domain?.toUpperCase() || 'UNKNOWN';
  const confidence = Math.round((trustStack.confidence || 0) * 100);
  const signal = trustStack.confidence > 0.75 ? 'BUY' : trustStack.confidence > 0.55 ? 'HOLD' : 'WATCH';
  const tier = trustStack.heimdall?.attestation?.trust_tier || 'VERIFIED';
  const score = trustStack.heimdall?.attestation?.trust_score || 0;
  const topCause = trustStack.causal_chain?.[0];
  const polaris = trustStack.constellation_signal;

  let speech = '';

  // JARVIS-style opener
  speech += `COSMIC analysis complete. `;

  // Domain + signal
  speech += `${domain} domain. Signal: ${signal}. Confidence: ${confidence} percent. `;

  // HEIMDALL verdict
  if (tier === 'SOVEREIGN') {
    speech += `HEIMDALL clears this. Trust score ${score} out of 100. Safe to act on. `;
  } else if (tier === 'VERIFIED') {
    speech += `HEIMDALL verified. Trust score ${score}. Proceed with standard caution. `;
  } else {
    speech += `HEIMDALL flags this as ${tier.toLowerCase()}. Trust score ${score}. Additional data recommended. `;
  }

  // POLARIS output if available
  if (polaris?.composite_score && polaris?.signal) {
    speech += `POLARIS composite: ${polaris.composite_score} out of 100. System status: ${polaris.signal}. `;
    if (polaris.core?.health_tier === 'RED' || polaris.core?.health_tier === 'CRITICAL') {
      speech += `Compressor health ${polaris.core.health_tier}. Immediate attention required. `;
    }
  }

  // Top causal link
  if (topCause) {
    speech += `Primary causal driver: ${topCause.cause}. Effect: ${topCause.effect}. `;
  }

  // Decision snippet
  const decisionSnippet = trustStack.decision?.split('.')[0] || '';
  if (decisionSnippet && decisionSnippet.length < 120) {
    speech += decisionSnippet + '.';
  }

  return speech.trim();
}

export async function textToSpeech(
  text: string,
  opts: TTSOptions = {}
): Promise<Buffer | null> {
  const cfg = getConfig() as any;
  const apiKey = opts.voiceId ? cfg.elevenLabsApiKey : (cfg.elevenLabsApiKey || '');

  if (!apiKey) return null;

  const voiceId = opts.voiceId || DEFAULT_VOICE_ID;
  const modelId = opts.modelId || DEFAULT_MODEL;

  const body = JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: {
      stability: opts.stability ?? 0.0,
      similarity_boost: opts.similarityBoost ?? 0.75,
      style: opts.style ?? 0.5,
      use_speaker_boost: true,
    },
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}
