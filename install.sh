#!/usr/bin/env bash
set -euo pipefail

OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_FILE="$OPENCODE_DIR/.flowdeck-manifest.json"

info()    { echo "$(tput setaf 4 2>/dev/null || true)[INFO]$(tput sgr0 2>/dev/null || true) $*"; }
success() { echo "$(tput setaf 2 2>/dev/null || true)[OK]$(tput sgr0 2>/dev/null || true) $*"; }
warn()    { echo "$(tput setaf 3 2>/dev/null || true)[WARN]$(tput sgr0 2>/dev/null || true) $*"; }
error()   { echo "$(tput setaf 1 2>/dev/null || true)[ERROR]$(tput sgr0 2>/dev/null || true) $*" >&2; exit 1; }

mkdir -p "$OPENCODE_DIR/agent" "$OPENCODE_DIR/skills" "$OPENCODE_DIR/command"

# Initialize manifest
node -e "
const fs = require('fs');
const m = { version: 1, installed: [], timestamp: new Date().toISOString() };
fs.writeFileSync('${MANIFEST_FILE}.tmp', JSON.stringify(m, null, 2));
"

# Install a file, backing up any pre-existing non-FlowDeck file
install_file() {
  local src="$1" dest="$2" backup=""
  if [ -f "$dest" ] && ! grep -q "FlowDeck\|origin: FlowDeck" "$dest" 2>/dev/null; then
    backup="${dest}.flowdeck-bak"
    cp "$dest" "$backup"
    warn "Backed up existing: $(basename "$dest")"
  fi
  cp "$src" "$dest"
  node -e "
const fs = require('fs');
const f = '${MANIFEST_FILE}.tmp';
const m = JSON.parse(fs.readFileSync(f, 'utf8'));
m.installed.push({ dest: '$dest', backup: '$backup' || null });
fs.writeFileSync(f, JSON.stringify(m, null, 2));
" 2>/dev/null || true
}

# Install agents
for f in "$SCRIPT_DIR/agents/"*.md; do
  [ -f "$f" ] || continue
  install_file "$f" "$OPENCODE_DIR/agent/$(basename "$f")"
  info "Installed agent: $(basename "$f")"
done

# Install skills
for d in "$SCRIPT_DIR/skills/"/*/; do
  [ -d "$d" ] || continue
  [ -f "$d/SKILL.md" ] || { warn "Skipping empty skill dir: $(basename "$d")"; continue; }
  name=$(basename "$d")
  mkdir -p "$OPENCODE_DIR/skills/$name"
  install_file "$d/SKILL.md" "$OPENCODE_DIR/skills/$name/SKILL.md"
  info "Installed skill: $name"
done

# Install commands
for f in "$SCRIPT_DIR/commands/"*.md; do
  [ -f "$f" ] || continue
  install_file "$f" "$OPENCODE_DIR/command/$(basename "$f")"
  info "Installed command: $(basename "$f")"
done

# Finalize manifest
mv "${MANIFEST_FILE}.tmp" "$MANIFEST_FILE"

# Update opencode.json
node -e "
const fs = require('fs');
const configPath = require('path').join('$OPENCODE_DIR', 'opencode.json');
let config = {};
if (fs.existsSync(configPath)) {
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) {}
}
if (!Array.isArray(config.plugin)) config.plugin = [];
const entry = 'opencode-flowdeck@latest';
if (!config.plugin.some(p => p === entry || p === 'opencode-flowdeck')) {
  config.plugin.push(entry);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('[OK] Added opencode-flowdeck@latest to plugin list');
} else {
  console.log('[OK] opencode-flowdeck already in plugin list');
}
"

success "FlowDeck installation complete!"
info "Manifest saved:    $MANIFEST_FILE"
info "Plugin registered: $OPENCODE_DIR/opencode.json"
info ""
info "To uninstall: bash $SCRIPT_DIR/uninstall.sh"
