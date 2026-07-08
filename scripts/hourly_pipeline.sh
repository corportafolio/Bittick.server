#!/bin/bash
# Pipeline horario de Trading Avizor
# Ejecutar cada hora via cron: hermes cron o crontab del sistema

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BITTICK_SERVER="${SCRIPT_DIR}/.."
VAULT_BASE="${HOME}/Escritorio/Obsidian_TradingAvizor"
TRANSCRIPTS_DIR="${VAULT_BASE}/03_Transcripciones"

# Configuracion del canal
CHANNEL_HANDLE="TradingAvizor"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# 1. Obtener ultimo videoId desde la pagina del canal (gratis, sin API Key)
check_new_video() {
  log "Consultando canal @${CHANNEL_HANDLE}..."

  local HTML=$(curl -s --max-time 15 \
    -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" \
    "https://www.youtube.com/@${CHANNEL_HANDLE}/videos" 2>/dev/null)

  local VIDEO_ID=$(echo "$HTML" | grep -oP '"videoId":"[^"]+"' | head -1 | grep -oP ':"[^"]+' | tr -d ':"')
  local VIDEO_TITLE=$(echo "$HTML" | grep -oP '"title":{"runs":\[{"text":"[^"]+"' | head -1 | grep -oP ':\[{"text":"[^"]+' | grep -oP '"text":"[^"]+' | sed 's/"text":"//')

  if [ -z "$VIDEO_ID" ]; then
    log "WARN: No se pudo obtener el ultimo video del canal"
    return 1
  fi

  log "Ultimo video: ${VIDEO_ID} - ${VIDEO_TITLE}"

  if find "$TRANSCRIPTS_DIR" -name "*_${VIDEO_ID}.md" 2>/dev/null | grep -q .; then
    log "INFO: ${VIDEO_ID} ya transcript. Sin novedades."
    return 1
  fi

  echo "$VIDEO_ID"
}

# 2. Descargar transcript
download_transcript() {
  local VIDEO_ID="$1"
  log "Descargando transcript de ${VIDEO_ID}..."
  cd "$SCRIPT_DIR"
  node fetch_transcripts.js "$VIDEO_ID" 2>&1 || {
    log "ERROR: Fallo la descarga de ${VIDEO_ID}"
    return 1
  }
  log "Transcript descargado"
}

# 3. Extraer zonas
extract_zones() {
  log "Extrayendo zonas con extract_prices.js..."
  cd "$SCRIPT_DIR"
  node extract_prices.js 2>&1 || {
    log "ERROR: Fallo extraccion de zonas"
    return 1
  }
  log "Zonas extraidas"
}

# ---- MAIN ----
log "=== Pipeline Trading Avizor ==="

NEW_VIDEO=$(check_new_video) || {
  log "Pipeline finalizado (sin novedades)"
  exit 0
}

download_transcript "$NEW_VIDEO" || exit 1
extract_zones || exit 1

log "=== Pipeline completado ==="
