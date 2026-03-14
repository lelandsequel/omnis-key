# ⚡ OMNIS KEY

**Local COSMIC Runtime. OpenClaw-style daemon. World-model intelligence built in.**

OpenClaw gives you a chatbot with tools.  
OMNIS KEY gives you a world-model OS.

---

## Install

```bash
npm install -g omnis-key
omnis-key setup
omnis-key start
```

That's it. COSMIC is online.

---

## What It Does

OMNIS KEY is a local AI daemon that runs the COSMIC intelligence pipeline on every query — causal analysis, temporal arcs, adversarial stress testing, and cryptographic trust attestation. No cloud required.

```
Your query → COSMIC pipeline → Trust Stack + HEIMDALL attestation → response
```

**COSMIC engines:**
- **CHRONOS** — temporal backbone, time-anchors every query
- **METEOR** — signal correlation
- **NOVA** — causal inference (what caused this, and why)
- **ECLIPSE** — temporal probability arcs (30d / 90d / 1y / 3y)
- **PULSAR** — adversarial stress testing + mitigations
- **AURORA** — cryptographic audit trace (SHA-256 hash chain)
- **HEIMDALL** — trust scoring 0–100 with tier classification

---

## Supported Domains

COSMIC auto-detects from your query:

| Domain | Example Query |
|--------|---------------|
| Mineral & O&G | "Ward County TX mineral risk — should I acquire?" |
| Civic | "Houston municipal budget stress analysis" |
| Agriculture | "Ogallala aquifer depletion impact on Panhandle yields" |
| Defense | "DoD supply chain readiness for critical subsystems" |
| Gas/Compression | "Compressor health Unit 3 under high load" (POLARIS) |
| Water | "Groundwater conflict risk — Reeves County" |
| Logistics | "Supply chain route optimization for Gulf Coast terminals" |

---

## JARVIS Mode (Voice)

```bash
omnis-key config set elevenLabsApiKey sk_...
open http://localhost:18800/jarvis
```

Browser mic → Web Speech API → COSMIC → Android 18 voice responds.

> *"COSMIC analysis complete. MINERAL domain. Signal: HOLD. HEIMDALL clears this. Trust score 91 out of 100. Safe to act on."*

---

## Constellations

Domain intelligence packs that extend COSMIC:

```bash
omnis-key install polaris    # Gas & Compression (built-in, 5 sub-engines)
# Coming: omnis-key install solstice  # Refinery & Logistics
# Coming: omnis-key install gaia      # Food, Water & Conflict
# Coming: omnis-key install aegis     # Defense & Integrity
```

---

## CLI

```bash
omnis-key setup              # First-time setup wizard
omnis-key start              # Start daemon (port 18800)
omnis-key stop               # Stop daemon
omnis-key status             # Runtime status
omnis-key query "..."        # Run a COSMIC query
omnis-key chronos            # Today's session history
omnis-key chronos --window this-week --domain mineral
omnis-key audit export --format md
omnis-key install polaris
omnis-key config set telegramBotToken <token>
omnis-key config set elevenLabsApiKey <key>
omnis-key logs --follow
```

---

## API

| Route | Description |
|-------|-------------|
| `POST /query` | COSMIC TrustStack (JSON) |
| `GET /jarvis` | Voice UI |
| `POST /jarvis` | Voice query (speak=true → MP3) |
| `POST /tts` | Text → MP3 (Android 18 voice) |
| `GET /health` | Runtime health |
| `GET /chronos` | Temporal session query |
| `GET /audit/export` | Compliance report |
| `GET /constellations` | Installed domain packs |

---

## Configuration

Config lives at `~/.omnis-key/config.json`:

```json
{
  "port": 18800,
  "telegramBotToken": "...",
  "elevenLabsApiKey": "sk_...",
  "anthropicApiKey": "sk-ant-...",
  "openaiApiKey": "sk-..."
}
```

LLM routing: Ollama (local) → Anthropic Claude → OpenAI → COSMIC only  
Ollama auto-detected at `localhost:11434`. Air-gap mode when offline.

---

## Auto-start

`omnis-key setup` installs launchd (macOS) or systemd (Linux) automatically.

Manual:
```bash
# macOS
launchctl load ~/Library/LaunchAgents/ai.omniskey.daemon.plist

# Linux
systemctl --user enable omnis-key && systemctl --user start omnis-key
```

---

## vs OpenClaw

| Feature | OpenClaw | OMNIS KEY |
|---------|----------|-----------|
| Intelligence | Generic LLM | COSMIC world-model |
| Trust | None | HEIMDALL (0–100, SHA-256) |
| Domain expertise | None | Constellation packs |
| Temporal reasoning | None | CHRONOS backbone |
| Causal reasoning | None | NOVA engine |
| Voice | Via TTS tools | Built-in JARVIS mode |
| Advantage | Broad + flexible | Deep + attested |

---

## Built by JourdanLabs

OMNIS KEY is built on the COSMIC engine suite — the same intelligence layer powering MineralScope, VECTOR, and the JourdanLabs research pipeline.

**omniskey.ai** · **jourdanlabs.com**

*COSMIC is the advantage. Everything else is infrastructure.*
