#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as child_process from 'child_process';
import chalk from 'chalk';
import { getConfig, setConfigKey, initConfig, PATHS } from './config';

const program = new Command();

program
  .name('omnis-key')
  .description('OMNIS KEY — Local COSMIC Runtime')
  .version('1.0.0');

// ── setup ─────────────────────────────────────────────────────────────────────
program
  .command('setup')
  .description('Interactive setup wizard (run this first)')
  .action(() => {
    const setupPath = require('path').join(__dirname, 'setup.js');
    require('child_process').spawn(process.execPath, [setupPath], { stdio: 'inherit' }).on('exit', (code: number) => process.exit(code || 0));
  });

// ── start ─────────────────────────────────────────────────────────────────────
program
  .command('start')
  .description('Start the OMNIS KEY daemon')
  .option('-p, --port <port>', 'Port to listen on')
  .action((opts) => {
    initConfig();
    if (opts.port) setConfigKey('port', opts.port);

    // Check if already running
    if (isRunning()) {
      const pid = fs.readFileSync(PATHS.PID_PATH, 'utf-8').trim();
      console.log(chalk.yellow(`⚡ OMNIS KEY is already running (PID ${pid})`));
      return;
    }

    const daemonPath = path.join(__dirname, 'daemon.js');
    const logStream = fs.openSync(PATHS.LOG_PATH, 'a');

    const child = child_process.spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: ['ignore', logStream, logStream],
    });
    child.unref();

    // Wait for PID file
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      if (fs.existsSync(PATHS.PID_PATH) || tries > 30) {
        clearInterval(interval);
        const cfg = getConfig();
        console.log(chalk.green(`⚡ OMNIS KEY started`));
        console.log(chalk.gray(`   Dashboard → http://localhost:${cfg.port}`));
        console.log(chalk.gray(`   Logs      → ${PATHS.LOG_PATH}`));
      }
    }, 200);
  });

// ── stop ──────────────────────────────────────────────────────────────────────
program
  .command('stop')
  .description('Stop the OMNIS KEY daemon')
  .action(() => {
    if (!isRunning()) {
      console.log(chalk.yellow('OMNIS KEY is not running'));
      return;
    }
    try {
      const pid = parseInt(fs.readFileSync(PATHS.PID_PATH, 'utf-8').trim());
      process.kill(pid, 'SIGTERM');
      // Clean up PID file if daemon doesn't do it
      setTimeout(() => {
        try { fs.unlinkSync(PATHS.PID_PATH); } catch {}
      }, 500);
      console.log(chalk.green(`⚡ OMNIS KEY stopped (PID ${pid})`));
    } catch (err: any) {
      console.error(chalk.red(`Failed to stop: ${err.message}`));
      try { fs.unlinkSync(PATHS.PID_PATH); } catch {}
    }
  });

// ── status ────────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show OMNIS KEY runtime status')
  .action(async () => {
    const cfg = getConfig();
    if (!isRunning()) {
      console.log(chalk.red('● OMNIS KEY') + chalk.gray(' — STOPPED'));
      return;
    }
    const pid = fs.readFileSync(PATHS.PID_PATH, 'utf-8').trim();
    try {
      const health = await httpGet(`http://localhost:${cfg.port}/health`);
      const data = JSON.parse(health);
      console.log(chalk.green('● OMNIS KEY') + chalk.gray(' — ONLINE'));
      console.log(chalk.gray(`  PID:      ${pid}`));
      console.log(chalk.gray(`  Port:     ${data.port}`));
      console.log(chalk.gray(`  Uptime:   ${data.uptimeHuman}`));
      console.log(chalk.gray(`  Version:  v${data.version}`));
      console.log(chalk.gray(`  Dashboard → http://localhost:${data.port}`));
    } catch {
      console.log(chalk.yellow('● OMNIS KEY') + chalk.gray(` — PID ${pid} (health check failed)`));
    }
  });

// ── config ────────────────────────────────────────────────────────────────────
program
  .command('config')
  .description('Manage OMNIS KEY config')
  .addCommand(
    new Command('set')
      .argument('<key>', 'Config key')
      .argument('<value>', 'Config value')
      .description('Set a config value')
      .action((key: string, value: string) => {
        initConfig();
        setConfigKey(key, value);
        console.log(chalk.green(`✓ Set ${key} = ${value}`));
        console.log(chalk.gray(`  Config: ${PATHS.CONFIG_PATH}`));
      })
  )
  .addCommand(
    new Command('get')
      .description('Print current config')
      .action(() => {
        const cfg = getConfig();
        console.log(JSON.stringify(cfg, null, 2));
      })
  );

// ── logs ──────────────────────────────────────────────────────────────────────
program
  .command('logs')
  .description('Show daemon logs')
  .option('-f, --follow', 'Follow log output (tail -f)')
  .option('-n, --lines <n>', 'Number of lines', '50')
  .action((opts) => {
    if (!fs.existsSync(PATHS.LOG_PATH)) {
      console.log(chalk.yellow('No log file found. Has the daemon been started?'));
      return;
    }
    if (opts.follow) {
      const tail = child_process.spawn('tail', ['-f', PATHS.LOG_PATH], { stdio: 'inherit' });
      tail.on('error', () => console.error('tail not available'));
    } else {
      const tail = child_process.spawnSync('tail', ['-n', opts.lines, PATHS.LOG_PATH], { encoding: 'utf-8' });
      console.log(tail.stdout || '(empty log)');
    }
  });

// ── query ─────────────────────────────────────────────────────────────────────
program
  .command('query <text>')
  .description('Run a COSMIC query')
  .option('-d, --domain <domain>', 'Domain hint (mineral/civic/agriculture/defense/auto)', 'auto')
  .action(async (text: string, opts) => {
    const cfg = getConfig();
    if (!isRunning()) {
      console.log(chalk.yellow('OMNIS KEY is not running. Start it with: omnis-key start'));
      return;
    }
    try {
      const body = JSON.stringify({ query: text, domain: opts.domain });
      const result = await httpPost(`http://localhost:${cfg.port}/query`, body);
      const data = JSON.parse(result);

      const signal = data.confidence > 0.75 ? chalk.green('BUY') : data.confidence > 0.55 ? chalk.yellow('HOLD') : chalk.red('WATCH');
      console.log(chalk.yellow('\n⚡ OMNIS KEY — TRUST STACK\n'));
      console.log(chalk.gray('Domain:     ') + data.domain?.toUpperCase());
      console.log(chalk.gray('Signal:     ') + signal);
      console.log(chalk.gray('Confidence: ') + `${(data.confidence * 100).toFixed(0)}%`);
      console.log(chalk.gray('\nDecision:\n') + data.decision);

      if (data.causal_chain?.length) {
        console.log(chalk.yellow('\nCAUSAL CHAIN (NOVA):'));
        data.causal_chain.forEach((c: any) => {
          console.log(chalk.gray(`  → ${c.cause}`));
          console.log(chalk.gray(`    ↳ ${c.effect} (${(c.weight * 100).toFixed(0)}%)`));
        });
      }

      if (data.time_arcs?.length) {
        console.log(chalk.yellow('\nTEMPORAL ARCS (ECLIPSE):'));
        data.time_arcs.forEach((a: any) => {
          console.log(chalk.gray(`  ${a.horizon}: ${(a.probability * 100).toFixed(0)}% — ${a.scenario.slice(0, 80)}`));
        });
      }

      console.log(chalk.gray('\nEngines: ') + data.engines_fired?.join(' · '));
      console.log(chalk.gray('Trace:   ') + data.audit_trace?.trace_id?.slice(0, 8));
      console.log();
    } catch (err: any) {
      console.error(chalk.red('Query failed: ' + err.message));
    }
  });

// ── install ───────────────────────────────────────────────────────────────────
program
  .command('install <constellation>')
  .description('Install a constellation pack (polaris|solstice|gaia|aegis)')
  .action(async (name: string) => {
    const available = ['polaris', 'solstice', 'gaia', 'aegis'];
    const builtin = ['polaris'];

    if (!available.includes(name.toLowerCase())) {
      console.log(chalk.red(`Unknown constellation: ${name}`));
      console.log(chalk.gray(`Available: ${available.join(', ')}`));
      return;
    }

    if (builtin.includes(name.toLowerCase())) {
      console.log(chalk.green(`✓ ${name.toUpperCase()} is built-in and already loaded`));
      console.log(chalk.gray('  POLARIS.CORE · POLARIS.FLUX · POLARIS.RESONANCE · POLARIS.DRIVE · POLARIS.CRYO'));
      console.log(chalk.gray('  Query with domain "gas" to activate'));
      return;
    }

    // Future: npm install omnis-key-<name>
    console.log(chalk.yellow(`◦ ${name.toUpperCase()} constellation`));
    console.log(chalk.gray(`  Coming soon: npm install -g omnis-key-${name}`));
    console.log(chalk.gray('  Join the waitlist at omniskey.ai'));
  });

// ── audit ─────────────────────────────────────────────────────────────────────
program
  .command('audit')
  .description('Compliance audit tools')
  .addCommand(
    new Command('export')
      .description('Export a compliance report')
      .option('-d, --domain <domain>', 'Filter by domain')
      .option('-n, --limit <n>', 'Number of sessions to include', '100')
      .option('-f, --format <fmt>', 'Output format (json|md)', 'md')
      .action(async (opts) => {
        const { generateComplianceReport, saveReport } = await import('./audit/compliance');
        const report = generateComplianceReport({ domain: opts.domain, limit: parseInt(opts.limit) });
        const filepath = saveReport(report, opts.format as any);
        console.log(chalk.green(`✓ Compliance report exported`));
        console.log(chalk.gray(`  Report ID: ${report.report_id}`));
        console.log(chalk.gray(`  Sessions:  ${report.sessions_audited}`));
        console.log(chalk.gray(`  File:      ${filepath}`));
        if (opts.format === 'md') {
          const { exportReportMarkdown } = await import('./audit/compliance');
          console.log('\n' + exportReportMarkdown(report));
        }
      })
  );

// ── chronos ───────────────────────────────────────────────────────────────────
program
  .command('chronos')
  .description('Temporal query over session history')
  .option('-w, --window <window>', 'Time window (last-hour|today|yesterday|this-week|this-month|all)', 'today')
  .option('-d, --domain <domain>', 'Filter by domain')
  .option('-n, --limit <n>', 'Max results', '10')
  .action(async (opts) => {
    const cfg = getConfig();
    if (!isRunning()) {
      // Read from file directly
      const { chronosFilter, buildChronosIndex } = await import('./cosmic/chronos');
      const sessionsPath = require('path').join(PATHS.STATE_DIR, 'sessions.json');
      let sessions: any[] = [];
      try { sessions = JSON.parse(require('fs').readFileSync(sessionsPath, 'utf-8')); } catch {}
      const filtered = chronosFilter(sessions, { window: opts.window, domain: opts.domain, limit: parseInt(opts.limit) });
      const indexed = buildChronosIndex(filtered);

      console.log(chalk.yellow(`\n⏱  CHRONOS — ${opts.window.toUpperCase()}\n`));
      if (!indexed.length) {
        console.log(chalk.gray('  No sessions in this window'));
      } else {
        indexed.forEach(s => {
          console.log(chalk.gray(`  ${s.relative_label.padEnd(12)} `), chalk.yellow(s.domain?.toUpperCase().padEnd(12)), chalk.white(s.query?.slice(0, 60)));
        });
      }
      console.log();
      return;
    }

    try {
      const result = await httpGet(`http://localhost:${cfg.port}/chronos?window=${opts.window}&domain=${opts.domain || ''}&limit=${opts.limit}`);
      const data = JSON.parse(result);
      console.log(chalk.yellow(`\n⏱  CHRONOS — ${data.window?.label || opts.window}\n`));
      if (!data.entries?.length) {
        console.log(chalk.gray('  No sessions in this window'));
      } else {
        data.entries.forEach((s: any) => {
          console.log(chalk.gray(`  ${s.relative_label.padEnd(12)} `), chalk.yellow(s.domain?.toUpperCase().padEnd(12)), chalk.white(s.query?.slice(0, 60)));
        });
      }
      if (data.stats) {
        const st = data.stats;
        console.log(chalk.gray(`\n  Total: ${st.total_sessions} · Avg confidence: ${(st.avg_confidence * 100).toFixed(0)}% · Peak hour: ${st.peak_hour}:00`));
      }
      console.log();
    } catch (err: any) {
      console.error(chalk.red('Chronos query failed: ' + err.message));
    }
  });

program.parse(process.argv);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRunning(): boolean {
  if (!fs.existsSync(PATHS.PID_PATH)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PATHS.PID_PATH, 'utf-8').trim());
    process.kill(pid, 0); // throws if not running
    return true;
  } catch {
    try { fs.unlinkSync(PATHS.PID_PATH); } catch {}
    return false;
  }
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    }).on('error', reject).setTimeout(3000, function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function httpPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}
