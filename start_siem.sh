#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v powershell.exe >/dev/null 2>&1; then
  exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$SCRIPT_DIR\\start_siem.ps1"
elif command -v pwsh >/dev/null 2>&1; then
  exec pwsh -NoProfile -File "$SCRIPT_DIR/start_siem.ps1"
else
  echo "PowerShell not found. Install PowerShell or run from Windows PowerShell."
  exit 1
fi
