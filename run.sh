#!/usr/bin/env bash
set -e

# ── Claude Code Manager ──────────────────────────────────────────────
# One-command setup & run script.
# Usage:
#   ./run.sh          — install deps (if needed) + start dev server
#   ./run.sh --prod   — install deps (if needed) + build + start prod server
# ----------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $1"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $1"; }
err()   { echo -e "${RED}[error]${NC} $1"; }

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# ── Check Node.js ────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  err "Node.js is not installed."
  echo ""
  echo "Install it from https://nodejs.org (v18+ recommended)"
  echo "  or via a version manager:"
  echo "    brew install node          # macOS"
  echo "    nvm install --lts          # nvm"
  echo "    fnm install --lts          # fnm"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js v18+ is required (found v$(node -v | tr -d 'v'))."
  exit 1
fi
ok "Node.js $(node -v)"

# ── Check npm ────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  err "npm is not installed."
  exit 1
fi

NPM_MAJOR=$(npm -v | cut -d. -f1)
if [ "$NPM_MAJOR" -lt 7 ]; then
  err "npm 7+ is required for workspaces (found $(npm -v))."
  exit 1
fi
ok "npm $(npm -v)"

# ── Check Claude Code sessions ───────────────────────────────────────
if [ ! -d "$HOME/.claude" ]; then
  warn "No ~/.claude directory found. The app reads Claude Code sessions from there."
  warn "It will still start, but there won't be any sessions to browse."
fi

# ── Install dependencies ─────────────────────────────────────────────
if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
  info "Installing dependencies..."
  npm install
  ok "Dependencies installed."
else
  ok "Dependencies already installed."
fi

# ── Start ─────────────────────────────────────────────────────────────
if [ "$1" = "--prod" ]; then
  info "Building for production..."
  npm run build
  ok "Build complete."
  echo ""
  echo -e "${GREEN}Starting production server at http://localhost:3899${NC}"
  echo ""
  npm start
else
  echo ""
  echo -e "${GREEN}Starting dev server...${NC}"
  echo -e "  Client: ${CYAN}http://localhost:5173${NC}"
  echo -e "  Server: ${CYAN}http://localhost:3899${NC}"
  echo ""
  npm run dev
fi
