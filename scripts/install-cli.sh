#!/usr/bin/env bash
set -e

# Oikos CLI installer — non-interactive, agent-friendly
#
# Usage:
#   # Install CLI only (connect to running wallet):
#   curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash
#
#   # Full setup (new wallet + skills + everything):
#   curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash -s -- --setup
#
#   # Full setup with custom name:
#   curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash -s -- --setup --name "Ludwig"
#
# Flags:
#   --setup          Full onboarding: generate seed, copy skills, configure wallet
#   --name <name>    Agent name (default: Oikos-Agent)
#   --mock           Use mock wallet (no real blockchain, safe for testing)
#   --port <port>    Dashboard port (default: 3420)

OIKOS_DIR="${OIKOS_DIR:-$HOME/.oikos}"
BIN_DIR="$OIKOS_DIR/bin"
REPO_DIR="$OIKOS_DIR/repo"
REPO_URL="https://github.com/adrianosousa/oikos.git"

# Defaults
DO_SETUP="false"
AGENT_NAME="Oikos-Agent"
USE_MOCK="false"
DASHBOARD_PORT="3420"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --setup)       DO_SETUP="true"; shift ;;
    --name)        AGENT_NAME="$2"; shift 2 ;;
    --mock)        USE_MOCK="true"; shift ;;
    --port)        DASHBOARD_PORT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${GREEN}info${NC}: $1"; }
warn() { echo -e "${YELLOW}warn${NC}: $1"; }

main() {
  echo ""
  echo -e "${CYAN}Installing Oikos Protocol...${NC}"
  echo ""

  # ── Check Node.js >= 22 ──
  if ! command -v node >/dev/null 2>&1; then
    echo "error: Node.js not found. Install Node.js >= 22: https://nodejs.org"
    exit 1
  fi
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 22 ]; then
    echo "error: Node.js >= 22 required (found $(node -v))"
    exit 1
  fi
  info "Node.js $(node -v)"

  # ── Create directories ──
  mkdir -p "$OIKOS_DIR"
  mkdir -p "$BIN_DIR"

  # ── Clone or update repo ──
  if [ -d "$REPO_DIR/.git" ]; then
    info "Updating existing installation..."
    cd "$REPO_DIR" && git pull --quiet 2>/dev/null || true
  else
    info "Cloning Oikos Protocol..."
    git clone --quiet --depth 1 "$REPO_URL" "$REPO_DIR"
  fi

  # ── Install dependencies and build ──
  cd "$REPO_DIR"
  info "Installing dependencies..."
  npm install --silent 2>&1 | tail -1
  info "Building..."
  npm run build 2>&1 | tail -1

  # ── Create wrapper script ──
  cat > "$BIN_DIR/oikos" << 'WRAPPER'
#!/usr/bin/env bash
OIKOS_DIR="${OIKOS_DIR:-$HOME/.oikos}"
exec node "$OIKOS_DIR/repo/bin/oikos.mjs" "$@"
WRAPPER
  chmod +x "$BIN_DIR/oikos"

  # ── Shell PATH setup ──
  cat > "$OIKOS_DIR/env" << 'ENVEOF'
# oikos shell setup
export PATH="$HOME/.oikos/bin:$PATH"
ENVEOF

  local source_line='. "$HOME/.oikos/env"'
  for cfg in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    if [ -f "$cfg" ] && ! grep -qF ".oikos/env" "$cfg" 2>/dev/null; then
      echo "" >> "$cfg"
      echo "# Added by Oikos installer" >> "$cfg"
      echo "$source_line" >> "$cfg"
      info "Added oikos to PATH in $cfg"
    fi
  done

  info "Oikos CLI installed to $BIN_DIR/oikos"

  # ── Full setup mode ──
  if [ "$DO_SETUP" = "true" ]; then
    echo ""
    info "Running full setup..."

    # Copy policy file
    if [ ! -f "$REPO_DIR/policies.json" ]; then
      cp "$REPO_DIR/policies.example.json" "$REPO_DIR/policies.json"
      info "Created policies.json from example"
    fi

    # Generate seed + .env (unless .env already has a real seed)
    if [ "$USE_MOCK" = "true" ]; then
      info "Mock mode — skipping seed generation"
      cat > "$REPO_DIR/.env" << MOCKENV
OIKOS_MODE="mock"
MOCK_WALLET="true"
MOCK_SWARM="false"
SWARM_ENABLED="true"
AGENT_NAME="${AGENT_NAME}"
AGENT_CAPABILITIES="payment,swap,bridge,yield,analysis,price-feed"
DASHBOARD_PORT="${DASHBOARD_PORT}"
DASHBOARD_HOST="0.0.0.0"
WALLET_RUNTIME="node"
WALLET_ISOLATE_PATH="./wallet-isolate/dist/src/main.js"
POLICY_FILE="policies.json"
AUDIT_LOG_PATH="audit.jsonl"
MOCKENV
    else
      BACKUP_FILE="$REPO_DIR/.oikos-seed-backup.txt"
      info "Generating wallet seed..."
      SEED_RESULT=$(node "$REPO_DIR/scripts/seed-setup.mjs" \
        --backup "$BACKUP_FILE" \
        --env "$REPO_DIR/.env" \
        --name "$AGENT_NAME" 2>&1 | tail -1)
      info "Seed generated. Backup at: $BACKUP_FILE"

      # Update .env with agent name and host config
      if grep -q "AGENT_NAME" "$REPO_DIR/.env"; then
        sed -i.bak "s/AGENT_NAME=.*/AGENT_NAME=\"${AGENT_NAME}\"/" "$REPO_DIR/.env" 2>/dev/null || true
      fi
      if grep -q "DASHBOARD_PORT" "$REPO_DIR/.env"; then
        sed -i.bak "s/DASHBOARD_PORT=.*/DASHBOARD_PORT=\"${DASHBOARD_PORT}\"/" "$REPO_DIR/.env" 2>/dev/null || true
      fi
      rm -f "$REPO_DIR/.env.bak"
    fi

    # ── Copy skills to OpenClaw workspace ──
    # OpenClaw discovers skills from: <workspace>/skills/ (highest priority)
    # Also copies to ~/.openclaw/skills/ (shared across all agents)
    OPENCLAW_WS="${HOME}/.openclaw/workspace/skills"
    OPENCLAW_SHARED="${HOME}/.openclaw/skills"
    for SKILLS_TARGET in "$OPENCLAW_WS" "$OPENCLAW_SHARED"; do
      mkdir -p "$SKILLS_TARGET"
      if [ -d "$REPO_DIR/skills/wdk-wallet" ]; then
        cp -R "$REPO_DIR/skills/wdk-wallet" "$SKILLS_TARGET/" 2>/dev/null && \
          info "Installed wdk-wallet skill to $SKILLS_TARGET/"
      fi
      if [ -d "$REPO_DIR/skills/policy-engine" ]; then
        cp -R "$REPO_DIR/skills/policy-engine" "$SKILLS_TARGET/" 2>/dev/null && \
          info "Installed policy-engine skill to $SKILLS_TARGET/"
      fi
    done

    # Also copy root SKILL.md as the "oikos" skill
    OIKOS_SKILL_DIR="$OPENCLAW_WS/oikos"
    mkdir -p "$OIKOS_SKILL_DIR"
    cp "$REPO_DIR/SKILL.md" "$OIKOS_SKILL_DIR/SKILL.md" 2>/dev/null && \
      info "Installed oikos skill to $OIKOS_SKILL_DIR/"

    echo ""
    info "Setup complete!"
  fi

  # ── Final status ──
  echo ""
  info "Version: $(cd "$REPO_DIR" && node -e "console.log(require('./package.json').version)" 2>/dev/null || echo '0.2.0')"

  if curl -s http://127.0.0.1:${DASHBOARD_PORT}/api/health >/dev/null 2>&1; then
    info "Wallet already running at http://127.0.0.1:${DASHBOARD_PORT}"
  elif [ "$DO_SETUP" = "true" ]; then
    echo ""
    info "To start the wallet:"
    if [ "$USE_MOCK" = "true" ]; then
      echo "  cd $REPO_DIR && ./scripts/start-live.sh --name \"$AGENT_NAME\" --port $DASHBOARD_PORT --host 0.0.0.0"
    else
      echo "  cd $REPO_DIR && ./scripts/start-live.sh --name \"$AGENT_NAME\" --real-wallet --port $DASHBOARD_PORT --host 0.0.0.0"
    fi
    if [ -f "$REPO_DIR/.oikos-seed-backup.txt" ]; then
      echo ""
      warn "SEED BACKUP at: $REPO_DIR/.oikos-seed-backup.txt"
      warn "Tell your human owner to read and save it NOW."
      warn "It auto-deletes in 10 minutes."
    fi
  else
    info "No wallet running. Start one:"
    echo "  cd $REPO_DIR && npm start"
  fi
  echo ""
}

main
