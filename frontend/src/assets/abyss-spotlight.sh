# Abyss theme - docker init script
# for use with linuxserver/jellyfin via custom-cont-init.d
#
# place at: config/custom-cont-init.d/abyss-spotlight.sh
# make executable: chmod +x config/custom-cont-init.d/abyss-spotlight.sh
# mount in compose: ./config/custom-cont-init.d:/custom-cont-init.d

REPO="AumGupta/abyss-jellyfin"
BRANCH="main"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
WEB_DIR="/usr/share/jellyfin/web"
UI_DIR="${WEB_DIR}/ui"

SPOTLIGHT_FILES=(
    "scripts/spotlight/spotlight.html"
    "scripts/spotlight/spotlight.css"
    "scripts/spotlight/home-html.chunk.js"
)

log() { echo "**** [abyss] $* ****"; }

log "Applying Abyss Spotlight theme"

if [ ! -d "$WEB_DIR" ]; then
    log "ERROR: Web directory not found at ${WEB_DIR}"
    log "If using a non-linuxserver image, set WEB_DIR to your web directory path"
    exit 1
fi

STAGE_DIR="/tmp/abyss-stage"
mkdir -p "$STAGE_DIR"

for file in "${SPOTLIGHT_FILES[@]}"; do
    dest="${STAGE_DIR}/$(basename "$file")"
    if curl -fsSL "${RAW}/${file}" -o "$dest"; then
        log "Downloaded: $(basename "$file")"
    else
        log "ERROR: Failed to download $(basename "$file") - check internet connection"
        rm -rf "$STAGE_DIR"
        exit 1
    fi
done

mkdir -p "$UI_DIR"
for f in spotlight.html spotlight.css; do
    src="${STAGE_DIR}/${f}"
    dest="${UI_DIR}/${f}"
    if ! cmp -s "$src" "$dest" 2>/dev/null; then
        cp -f "$src" "$dest"
        log "Updated: ${f}"
    else
        log "Unchanged: ${f} (skipped)"
    fi
done

CHUNK_FILE=$(find "$WEB_DIR" -maxdepth 1 -name "home-html.*.chunk.js" | head -1)

if [ -z "$CHUNK_FILE" ]; then
    log "WARNING: Could not find home-html.*.chunk.js - skipping chunk patch"
    rm -rf "$STAGE_DIR"
    exit 0
fi

log "Found chunk: $(basename "$CHUNK_FILE")"

if grep -q "abyss-spotlight-frame\|featurediframe" "$CHUNK_FILE" 2>/dev/null; then
    log "Chunk already patched, skipping"
else
    cp -f "$CHUNK_FILE" "${CHUNK_FILE}.bak"
    cp -f "${STAGE_DIR}/home-html.chunk.js" "$CHUNK_FILE"
    log "Chunk patched successfully"
fi

rm -rf "$STAGE_DIR"

log "Abyss Spotlight theme applied successfully"