/**
 * OMNIS KEY Constellation Registry
 * Domain intelligence packs — installable modules
 * Each constellation extends COSMIC with domain-specific engines
 */
import * as fs from 'fs';
import * as path from 'path';
import { PATHS } from '../config';

export interface ConstellationManifest {
  name: string;          // e.g. "polaris"
  displayName: string;   // e.g. "POLARIS — Gas & Compression"
  version: string;
  domain: string;        // domain keyword this constellation handles
  engines: string[];     // sub-engine names it provides
  description: string;
  installPath: string;
}

export interface ConstellationPack {
  manifest: ConstellationManifest;
  query?: (text: string, context?: any) => Promise<any>;  // optional domain query override
  engines?: Record<string, (query: string) => any>;       // sub-engine implementations
}

const REGISTRY_PATH = path.join(PATHS.STATE_DIR, 'constellations.json');

// In-memory registry of loaded constellation packs
const loadedConstellations: Map<string, ConstellationPack> = new Map();

// Built-in constellation manifests (not yet installed)
export const AVAILABLE_CONSTELLATIONS: Omit<ConstellationManifest, 'installPath'>[] = [
  {
    name: 'polaris',
    displayName: 'POLARIS — Gas & Compression Intelligence',
    version: '1.0.0',
    domain: 'gas',
    engines: ['POLARIS.CORE', 'POLARIS.FLUX', 'POLARIS.RESONANCE', 'POLARIS.DRIVE', 'POLARIS.CRYO'],
    description: 'Compressor health, gas flow analysis, pipeline integrity, cryo operations',
  },
  {
    name: 'solstice',
    displayName: 'SOLSTICE — Refinery & Logistics Intelligence',
    version: '1.0.0',
    domain: 'refinery',
    engines: ['SOLSTICE.FLOW', 'SOLSTICE.MARGIN', 'SOLSTICE.SLATE', 'SOLSTICE.TURNAROUND', 'SOLSTICE.LOGISTICS'],
    description: 'Refinery operations, crack spreads, turnaround planning, product logistics',
  },
  {
    name: 'gaia',
    displayName: 'GAIA — Food, Water & Conflict Intelligence',
    version: '1.0.0',
    domain: 'food',
    engines: ['GAIA.HARVEST', 'GAIA.DENSITY', 'GAIA.RIVER', 'GAIA.FRONTIER', 'GAIA.PRISM'],
    description: 'Crop yields, water stress, conflict risk, food stability composite score',
  },
  {
    name: 'aegis',
    displayName: 'AEGIS — Defense & Integrity Intelligence',
    version: '1.0.0',
    domain: 'defense',
    engines: ['AEGIS.SHIELD', 'AEGIS.THREAT', 'AEGIS.SUPPLY', 'AEGIS.READINESS', 'AEGIS.SENTINEL'],
    description: 'Defense supply chains, threat assessment, readiness scoring, contractor integrity',
  },
];

function loadRegistry(): ConstellationManifest[] {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return [];
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  } catch { return []; }
}

function saveRegistry(manifests: ConstellationManifest[]): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(manifests, null, 2));
}

export function getInstalledConstellations(): ConstellationManifest[] {
  return loadRegistry();
}

export function registerConstellation(pack: ConstellationPack): void {
  loadedConstellations.set(pack.manifest.name, pack);
  // Persist to registry
  const registry = loadRegistry();
  const existing = registry.findIndex(m => m.name === pack.manifest.name);
  if (existing >= 0) registry[existing] = pack.manifest;
  else registry.push(pack.manifest);
  saveRegistry(registry);
  console.log(`[OMNIS KEY] Constellation loaded: ${pack.manifest.displayName}`);
}

export function getConstellation(name: string): ConstellationPack | undefined {
  return loadedConstellations.get(name);
}

export function getConstellationForDomain(domain: string): ConstellationPack | undefined {
  for (const [, pack] of loadedConstellations) {
    if (pack.manifest.domain === domain) return pack;
  }
  return undefined;
}

export function listConstellations(): {
  installed: ConstellationManifest[];
  available: typeof AVAILABLE_CONSTELLATIONS;
} {
  return {
    installed: loadRegistry(),
    available: AVAILABLE_CONSTELLATIONS,
  };
}

/**
 * Load built-in POLARIS constellation (full 5-engine pack)
 * Additional constellations (SOLSTICE, GAIA, AEGIS) ship as separate npm packages
 */
export function loadBuiltinStubs(): void {
  // Lazy-require to avoid circular deps
  const { runPolaris } = require('./polaris');

  const polarisPack: ConstellationPack = {
    manifest: {
      name: 'polaris',
      displayName: 'POLARIS — Gas & Compression Intelligence',
      version: '1.0.0',
      domain: 'gas',
      engines: ['POLARIS.CORE', 'POLARIS.FLUX', 'POLARIS.RESONANCE', 'POLARIS.DRIVE', 'POLARIS.CRYO'],
      description: 'Full gas & compression intelligence: compressor health, flow efficiency, pipeline integrity, drive train, cryo operations',
      installPath: 'builtin',
    },
    query: async (text: string) => runPolaris(text),
  };
  registerConstellation(polarisPack);
}
