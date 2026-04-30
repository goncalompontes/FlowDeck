#!/usr/bin/env node
// FlowDeck installer CLI
// Usage: npx opencode-flowdeck [--global] [--local] [--help]

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
FlowDeck — OpenCode plugin for structured planning and execution

Usage:
  npx opencode-flowdeck           Install FlowDeck globally
  npx opencode-flowdeck --local   Install to current project (.opencode/)
  npx opencode-flowdeck --uninstall  Remove FlowDeck

Options:
  --global      Install to ~/.config/opencode/ (default)
  --local       Install to ./.opencode/ (current project)
  --uninstall   Remove FlowDeck files
  --help        Show this help
`);
  process.exit(0);
}

const isLocal = args.includes('--local');
const isUninstall = args.includes('--uninstall');
const configDir = isLocal
  ? path.join(process.cwd(), '.opencode')
  : process.env.OPENCODE_CONFIG_DIR ||
    (process.env.XDG_CONFIG_HOME
      ? path.join(process.env.XDG_CONFIG_HOME, 'opencode')
      : path.join(os.homedir(), '.config', 'opencode'));

const pkgRoot = path.join(__dirname, '..');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (isUninstall) {
  console.log('Removing FlowDeck files...');
  const agentDir = path.join(configDir, 'agent');
  const agentsSrc = path.join(pkgRoot, 'agents');
  if (fs.existsSync(agentDir) && fs.existsSync(agentsSrc)) {
    for (const f of fs.readdirSync(agentsSrc)) {
      const target = path.join(agentDir, f);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  }
  const configFile = path.join(configDir, 'opencode.json');
  if (fs.existsSync(configFile)) {
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (Array.isArray(cfg.plugin)) {
      cfg.plugin = cfg.plugin.filter(p => p !== 'opencode-flowdeck' && !(Array.isArray(p) && p[0] === 'opencode-flowdeck'));
      fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
    }
  }
  console.log('FlowDeck uninstalled.');
  process.exit(0);
}

console.log(`Installing FlowDeck to: ${configDir}`);

// Install agents
const agentSrc = path.join(pkgRoot, 'agents');
const agentDest = path.join(configDir, 'agent');
fs.mkdirSync(agentDest, { recursive: true });
let agentCount = 0;
if (fs.existsSync(agentSrc)) {
  for (const f of fs.readdirSync(agentSrc)) {
    if (!f.endsWith('.md')) continue;
    fs.copyFileSync(path.join(agentSrc, f), path.join(agentDest, f));
    agentCount++;
  }
}
console.log(`  ✓ Installed ${agentCount} agents`);

// Install skills
const skillsSrc = path.join(pkgRoot, 'skills');
const skillsDest = path.join(configDir, 'skills');
fs.mkdirSync(skillsDest, { recursive: true });
let skillCount = 0;
if (fs.existsSync(skillsSrc)) {
  for (const d of fs.readdirSync(skillsSrc)) {
    const src = path.join(skillsSrc, d);
    const dest = path.join(skillsDest, d);
    if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest);
      skillCount++;
    }
  }
}
console.log(`  ✓ Installed ${skillCount} skills`);

// Install commands
const cmdSrc = path.join(pkgRoot, 'commands');
const cmdDest = path.join(configDir, 'command');
fs.mkdirSync(cmdDest, { recursive: true });
let cmdCount = 0;
if (fs.existsSync(cmdSrc)) {
  for (const f of fs.readdirSync(cmdSrc)) {
    if (!f.endsWith('.md')) continue;
    fs.copyFileSync(path.join(cmdSrc, f), path.join(cmdDest, f));
    cmdCount++;
  }
}
console.log(`  ✓ Installed ${cmdCount} commands`);

// Register plugin in opencode.json
const configFile = path.join(configDir, 'opencode.json');
let cfg = {};
if (fs.existsSync(configFile)) {
  try { cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch(e) {}
}
if (!Array.isArray(cfg.plugin)) cfg.plugin = [];
const alreadyRegistered = cfg.plugin.some(p => p === 'opencode-flowdeck' || (Array.isArray(p) && p[0] === 'opencode-flowdeck'));
if (!alreadyRegistered) {
  cfg.plugin.push('opencode-flowdeck');
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
  console.log('  ✓ Registered plugin in opencode.json');
} else {
  console.log('  ✓ Plugin already registered');
}

console.log('\nFlowDeck installed successfully!');
console.log(`Config: ${configDir}`);
