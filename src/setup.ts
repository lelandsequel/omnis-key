#!/usr/bin/env node
/**
 * OMNIS KEY Setup Wizard
 * One-command install experience: npm install -g omnis-key && omnis-key setup
 */
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as os from 'os';
import chalk from 'chalk';
import { initConfig, getConfig, saveConfig, PATHS } from './config';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, defaultVal?: string): Promise<string> {
  return new Promise(resolve => {
    const hint = defaultVal ? chalk.gray(` [${defaultVal}]`) : '';
    rl.question(`${question}${hint}: `, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function askSecret(question: string): Promise<string> {
  return new Promise(resolve => {
    process.stdout.write(`${question}: `);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    stdin.on('data', function handler(ch: string) {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit();
      } else if (ch === '\u007f') {
        if (value.length > 0) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
      } else {
        value += ch;
        process.stdout.write('*');
      }
    });
  });
}

function print(msg: string) { console.log(msg); }
function section(title: string) {
  console.log('\n' + chalk.yellow('─'.repeat(50)));
  console.log(chalk.yellow('  ' + title));
  console.log(chalk.yellow('─'.repeat(50)));
}

function generateLaunchdPlist(daemonPath: string, nodePath: string): string {
  const stateDir = PATHS.STATE_DIR;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.omniskey.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${daemonPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${stateDir}/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>${stateDir}/daemon.log</string>
    <key>WorkingDirectory</key>
    <string>${path.dirname(daemonPath)}</string>
</dict>
</plist>`;
}

function generateSystemdService(daemonPath: string, nodePath: string): string {
  return `[Unit]
Description=OMNIS KEY — Local COSMIC Runtime
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${daemonPath}
Restart=always
RestartSec=5
StandardOutput=append:${PATHS.STATE_DIR}/daemon.log
StandardError=append:${PATHS.STATE_DIR}/daemon.log

[Install]
WantedBy=multi-user.target
`;
}

async function setup() {
  console.clear();
  console.log(chalk.yellow('\n  ⚡ OMNIS KEY — Setup Wizard'));
  console.log(chalk.gray('  Local COSMIC Runtime · One-command install\n'));
  console.log(chalk.gray('  Press Ctrl+C at any time to cancel.\n'));

  initConfig();
  const existing = getConfig() as any;

  // ── Core config ─────────────────────────────────────────────────────────────
  section('Core Configuration');

  const port = await ask('  Port', String(existing.port || 18800));

  // ── Telegram ─────────────────────────────────────────────────────────────────
  section('Telegram Channel (optional)');
  print(chalk.gray('  Creates a Telegram bot that routes queries through COSMIC.'));
  print(chalk.gray('  Get a token from @BotFather → /newbot\n'));

  const telegramToken = await ask('  Bot token (or Enter to skip)');

  // ── ElevenLabs (voice) ────────────────────────────────────────────────────────
  section('Voice / JARVIS Mode (optional)');
  print(chalk.gray('  Powers JARVIS mode — Android 18 voice responds to your queries.'));
  print(chalk.gray('  Get your key from elevenlabs.io → Profile → API Key\n'));

  const elevenLabsKey = await ask('  ElevenLabs API key (or Enter to skip)');

  // ── LLM keys ─────────────────────────────────────────────────────────────────
  section('LLM Keys (optional)');
  print(chalk.gray('  COSMIC works without an LLM. Add keys for richer natural language.'));
  print(chalk.gray('  Ollama (local) is auto-detected — no key needed.\n'));

  const anthropicKey = await ask('  Anthropic API key (or Enter to skip)');
  const openaiKey = await ask('  OpenAI API key (or Enter to skip)');

  // ── Auto-start ────────────────────────────────────────────────────────────────
  section('Auto-Start on Boot');

  const platform = os.platform();
  let autoStart = '';
  if (platform === 'darwin') {
    autoStart = await ask('  Install launchd service? (start on login)', 'yes');
  } else if (platform === 'linux') {
    autoStart = await ask('  Install systemd service?', 'yes');
  }

  rl.close();

  // ── Save config ───────────────────────────────────────────────────────────────
  section('Saving Configuration');

  const newConfig: any = { port: parseInt(port) || 18800 };
  if (telegramToken) newConfig.telegramBotToken = telegramToken;
  if (elevenLabsKey) newConfig.elevenLabsApiKey = elevenLabsKey;
  if (anthropicKey) newConfig.anthropicApiKey = anthropicKey;
  if (openaiKey) newConfig.openaiApiKey = openaiKey;

  saveConfig(newConfig);
  print(chalk.green(`  ✓ Config saved → ${PATHS.CONFIG_PATH}`));

  // ── Detect daemon path ────────────────────────────────────────────────────────
  const daemonPath = path.join(__dirname, 'daemon.js');
  const nodePath = process.execPath;

  // ── Auto-start installation ───────────────────────────────────────────────────
  if (autoStart.toLowerCase().startsWith('y')) {
    if (platform === 'darwin') {
      const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/ai.omniskey.daemon.plist');
      const plistContent = generateLaunchdPlist(daemonPath, nodePath);
      fs.writeFileSync(plistPath, plistContent);

      try {
        // Unload first (in case already loaded)
        child_process.execSync(`launchctl unload ${plistPath} 2>/dev/null`, { stdio: 'ignore' });
      } catch {}
      try {
        child_process.execSync(`launchctl load ${plistPath}`);
        print(chalk.green(`  ✓ launchd service installed → ${plistPath}`));
        print(chalk.green('  ✓ OMNIS KEY will start automatically on login'));
      } catch (e: any) {
        print(chalk.yellow(`  ⚠ launchd load failed: ${e.message}`));
        print(chalk.gray('  You can load it manually: launchctl load ' + plistPath));
      }
    } else if (platform === 'linux') {
      const serviceContent = generateSystemdService(daemonPath, nodePath);
      const servicePath = `/etc/systemd/system/omnis-key.service`;
      try {
        fs.writeFileSync(servicePath, serviceContent);
        child_process.execSync('systemctl daemon-reload');
        child_process.execSync('systemctl enable omnis-key');
        print(chalk.green(`  ✓ systemd service installed and enabled`));
      } catch {
        const userServiceDir = path.join(os.homedir(), '.config/systemd/user');
        fs.mkdirSync(userServiceDir, { recursive: true });
        fs.writeFileSync(path.join(userServiceDir, 'omnis-key.service'), serviceContent);
        print(chalk.yellow('  ⚠ Could not write to /etc/systemd — wrote user service instead'));
        print(chalk.gray('  Enable: systemctl --user enable omnis-key && systemctl --user start omnis-key'));
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n' + chalk.yellow('═'.repeat(50)));
  console.log(chalk.yellow.bold('\n  ⚡ OMNIS KEY is configured.\n'));

  console.log(chalk.green('  Start:     ') + chalk.white('omnis-key start'));
  console.log(chalk.green('  Dashboard: ') + chalk.white(`http://localhost:${port}`));
  console.log(chalk.green('  JARVIS:    ') + chalk.white(`http://localhost:${port}/jarvis`));
  console.log(chalk.green('  Query:     ') + chalk.white('omnis-key query "your question"'));
  console.log(chalk.green('  Help:      ') + chalk.white('omnis-key --help'));

  if (telegramToken) {
    console.log(chalk.green('\n  Telegram:  ') + chalk.gray('Bot connected — message your bot to start querying COSMIC'));
  }
  if (elevenLabsKey) {
    console.log(chalk.green('  Voice:     ') + chalk.gray('Android 18 voice ready — open JARVIS mode'));
  }
  if (!telegramToken && !elevenLabsKey) {
    console.log(chalk.gray('\n  Add channels later: omnis-key config set telegramBotToken <token>'));
    console.log(chalk.gray('  Add voice later:    omnis-key config set elevenLabsApiKey <key>'));
  }

  console.log('\n' + chalk.yellow('  COSMIC is the advantage.') + chalk.gray(' Everything else is infrastructure.\n'));
  console.log(chalk.yellow('═'.repeat(50)) + '\n');

  // Offer to start now
  const { createInterface } = await import('readline');
  const rl2 = createInterface({ input: process.stdin, output: process.stdout });
  rl2.question(chalk.gray('  Start OMNIS KEY now? [Y/n] '), (answer) => {
    rl2.close();
    if (!answer || answer.toLowerCase().startsWith('y')) {
      print(chalk.green('\n  Starting OMNIS KEY...\n'));
      const child = child_process.spawn(nodePath, [daemonPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      setTimeout(() => {
        print(chalk.green(`  ⚡ OMNIS KEY online → http://localhost:${port}`));
        print(chalk.gray(`  JARVIS mode → http://localhost:${port}/jarvis\n`));
        process.exit(0);
      }, 1500);
    } else {
      print(chalk.gray('\n  Run `omnis-key start` when ready.\n'));
      process.exit(0);
    }
  });
}

setup().catch(err => {
  console.error(chalk.red('\n  Setup failed: ' + err.message));
  process.exit(1);
});
