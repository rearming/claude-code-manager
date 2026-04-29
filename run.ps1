# ── Claude Code Manager ──────────────────────────────────────────────
# One-command setup & run script for Windows PowerShell.
# Usage:
#   .\run.ps1          — install deps (if needed) + start dev server
#   .\run.ps1 --prod   — install deps (if needed) + build + start prod server
# ----------------------------------------------------------------------

$ErrorActionPreference = "Stop"

function Write-Info  { Write-Host "[info]  $args" -ForegroundColor Cyan }
function Write-Ok    { Write-Host "[ok]    $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[warn]  $args" -ForegroundColor Yellow }
function Write-Err   { Write-Host "[error] $args" -ForegroundColor Red }

Set-Location $PSScriptRoot

# ── Check Node.js ────────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js is not installed."
    Write-Host ""
    Write-Host "Install it from https://nodejs.org (v18+ recommended)"
    Write-Host "  or via a version manager:"
    Write-Host "    winget install OpenJS.NodeJS.LTS"
    Write-Host "    fnm install --lts"
    Write-Host "    nvm install lts"
    exit 1
}

$nodeMajor = [int](node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($nodeMajor -lt 18) {
    Write-Err "Node.js v18+ is required (found $(node -v))."
    exit 1
}
Write-Ok "Node.js $(node -v)"

# ── Check npm ────────────────────────────────────────────────────────
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm is not installed."
    exit 1
}

$npmMajor = [int]((npm -v).Split('.')[0])
if ($npmMajor -lt 7) {
    Write-Err "npm 7+ is required for workspaces (found $(npm -v))."
    exit 1
}
Write-Ok "npm $(npm -v)"

# ── Check Claude Code sessions ───────────────────────────────────────
$claudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $claudeDir)) {
    Write-Warn "No ~/.claude directory found. The app reads Claude Code sessions from there."
    Write-Warn "It will still start, but there won't be any sessions to browse."
}

# ── Install dependencies ─────────────────────────────────────────────
$needInstall = (-not (Test-Path "node_modules")) -or
               (-not (Test-Path "server\node_modules")) -or
               (-not (Test-Path "client\node_modules"))

if ($needInstall) {
    Write-Info "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Ok "Dependencies installed."
} else {
    Write-Ok "Dependencies already installed."
}

# ── Start ─────────────────────────────────────────────────────────────
if ($args -contains "--prod") {
    Write-Info "Building for production..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Ok "Build complete."
    Write-Host ""
    Write-Host "Starting production server at http://localhost:3899" -ForegroundColor Green
    Write-Host ""
    npm start
} else {
    Write-Host ""
    Write-Host "Starting dev server..." -ForegroundColor Green
    Write-Host "  Client: " -NoNewline; Write-Host "http://localhost:5173" -ForegroundColor Cyan
    Write-Host "  Server: " -NoNewline; Write-Host "http://localhost:3899" -ForegroundColor Cyan
    Write-Host ""
    npm run dev
}
