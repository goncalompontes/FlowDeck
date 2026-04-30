#!/usr/bin/env bash
set -euo pipefail

OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
MANIFEST_FILE="$OPENCODE_DIR/.flowdeck-manifest.json"
CACHE_GLOB="$HOME/.cache/opencode/packages/opencode-flowdeck@*"

info()    { echo "$(tput setaf 4 2>/dev/null || true)[INFO]$(tput sgr0 2>/dev/null || true) $*"; }
success() { echo "$(tput setaf 2 2>/dev/null || true)[OK]$(tput sgr0 2>/dev/null || true) $*"; }
warn()    { echo "$(tput setaf 3 2>/dev/null || true)[WARN]$(tput sgr0 2>/dev/null || true) $*"; }
error()   { echo "$(tput setaf 1 2>/dev/null || true)[ERROR]$(tput sgr0 2>/dev/null || true) $*" >&2; exit 1; }

if [ ! -f "$MANIFEST_FILE" ]; then
  warn "No manifest found at $MANIFEST_FILE"
  warn "FlowDeck may not be installed, or was installed without manifest support."
  warn "To manually uninstall, remove FlowDeck agents/skills/commands from:"
  warn "  $OPENCODE_DIR/agent/"
  warn "  $OPENCODE_DIR/skills/"
  warn "  $OPENCODE_DIR/command/"
  exit 1
fi

info "Reading manifest: $MANIFEST_FILE"

# Remove installed files and restore any backups
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$MANIFEST_FILE', 'utf8'));
let removed = 0, restored = 0, skipped = 0;

for (const entry of manifest.installed) {
  if (!entry || !entry.dest) continue;
  if (fs.existsSync(entry.dest)) {
    fs.unlinkSync(entry.dest);
    removed++;
    if (entry.backup && fs.existsSync(entry.backup)) {
      fs.renameSync(entry.backup, entry.dest);
      console.log('[INFO] Restored: ' + require('path').basename(entry.dest));
      restored++;
    } else {
      console.log('[INFO] Removed: ' + require('path').basename(entry.dest));
    }
  } else {
    skipped++;
  }
  // Clean up orphaned backup if dest was already gone
  if (entry.backup && fs.existsSync(entry.backup) && !fs.existsSync(entry.dest)) {
    fs.renameSync(entry.backup, entry.dest);
    restored++;
  }
}
console.log('[OK] Removed: ' + removed + ', Restored: ' + restored + ', Skipped: ' + skipped);
"

# Remove manifest file
rm -f "$MANIFEST_FILE"
info "Removed manifest"

# Remove plugin from opencode.json
node -e "
const fs = require('fs');
const configPath = require('path').join('$OPENCODE_DIR', 'opencode.json');
if (!fs.existsSync(configPath)) process.exit(0);
let config;
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) { process.exit(0); }
if (!Array.isArray(config.plugin)) process.exit(0);
const before = config.plugin.length;
config.plugin = config.plugin.filter(p => p !== 'opencode-flowdeck@latest' && p !== 'opencode-flowdeck');
if (config.plugin.length < before) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('[OK] Removed opencode-flowdeck from plugin list');
} else {
  console.log('[INFO] opencode-flowdeck was not in plugin list');
}
"

# Remove plugin cache directories (all versions)
for cache_dir in $CACHE_GLOB; do
  if [ -d "$cache_dir" ]; then
    rm -rf "$cache_dir"
    info "Removed cache: $(basename "$cache_dir")"
  fi
done 2>/dev/null || true

success "FlowDeck uninstalled successfully."
info "OpenCode configuration restored."
