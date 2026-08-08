#!/usr/bin/env bash
# install.sh — install OpenCode Observer (agent + plugin) into ~/.config/opencode
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"

AGENT_DEST="$CONFIG_DIR/agents/observer.md"
PLUGIN_DEST="$CONFIG_DIR/plugin/observer.ts"

echo "Installing OpenCode Observer..."
echo "  config dir: $CONFIG_DIR"

if [[ ! -d "$CONFIG_DIR" ]]; then
  echo "error: $CONFIG_DIR does not exist. Is opencode installed and configured?"
  exit 1
fi

mkdir -p "$CONFIG_DIR/agents" "$CONFIG_DIR/plugin"

cp "$SCRIPT_DIR/agents/observer.md" "$AGENT_DEST"
echo "  ✔ agent  -> $AGENT_DEST"

cp "$SCRIPT_DIR/plugin/observer.ts" "$PLUGIN_DEST"
echo "  ✔ plugin -> $PLUGIN_DEST"

cat <<'EOF'

Done. Restart opencode for the changes to take effect.

Next steps:
  1. Edit $AGENT_DEST and set `model:` to a multimodal model available in your
     environment (e.g. opencode-go/gpt-5.6-luna, kimi-k2.6, minimax-m3...).
  2. Restart opencode, then paste an image into a text-only model session
     (e.g. deepseek-v4-flash) — it will delegate reading to the observer.
EOF
