#!/bin/bash
#
# OzangLive Installer / Updater
#
# Modes:
#   - update  (default jika sudah ada instalasi)
#               * auto-backup db/ + .env + public/uploads/ ke ~/ozanglive-backups/<timestamp>
#               * git fetch + git pull
#               * npm install
#               * restart via ecosystem.config.js (load TZ, memory limit, dsb)
#               * NO rm -rf, data user aman
#
#   - fresh   (default jika belum ada instalasi, atau via --fresh)
#               * jika ada instalasi lama: BACKUP penuh dulu, lalu hapus folder
#               * clone repo, install dependency, start via ecosystem
#
# Flags:
#   --fresh         paksa fresh install (akan minta konfirmasi sebelum hapus)
#   --update        paksa mode update (gagal jika tidak ada instalasi)
#   --branch <name> checkout branch tertentu (default: main)
#   --no-password   skip prompt password (untuk CI / re-run otomatis)
#

set -e

INSTALL_DIR="$HOME/ozanglive"
BACKUP_ROOT="$HOME/ozanglive-backups"
REPO_URL="https://github.com/meteoradja-ytmjk/ozanglive"

MODE=""
BRANCH="main"
SKIP_PASSWORD="false"

# ---------- Parse flags ----------
while [ $# -gt 0 ]; do
    case "$1" in
        --fresh)       MODE="fresh"; shift ;;
        --update)      MODE="update"; shift ;;
        --branch)      BRANCH="$2"; shift 2 ;;
        --no-password) SKIP_PASSWORD="true"; shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

# ================================
# PASSWORD VALIDATION FUNCTIONS
# ================================
validate_password() {
    [ "$1" = "1988" ]
}

show_failure_message() {
    echo
    echo "================================"
    echo "❌ INSTALASI DIBATALKAN"
    echo "================================"
    echo
    echo "Password salah 3 kali berturut-turut."
    echo "Hubungi developer: 📱 WhatsApp 089621453431"
    echo "================================"
}

prompt_password() {
    [ "$SKIP_PASSWORD" = "true" ] && return 0

    local max_attempts=3
    local attempt=1
    local password=""

    if [ ! -t 0 ] && [ ! -e /dev/tty ]; then
        echo "❌ Error: Tidak dapat membaca input interaktif."
        echo "   Jalankan script langsung, bukan via pipe tanpa /dev/tty."
        return 1
    fi

    echo "🔐 Instalasi ini memerlukan password."
    echo "   Hubungi developer untuk mendapatkan password."
    echo

    while [ $attempt -le $max_attempts ]; do
        printf "🔑 Masukkan password: "
        stty -echo 2>/dev/null </dev/tty || true
        read -r password </dev/tty
        stty echo 2>/dev/null </dev/tty || true
        echo

        if [ -z "$password" ]; then
            local remaining=$((max_attempts - attempt))
            [ $remaining -gt 0 ] && echo "❌ Password tidak boleh kosong! Sisa percobaan: $remaining" && echo
            attempt=$((attempt + 1))
            continue
        fi

        if validate_password "$password"; then
            echo
            echo "✅ Password benar! Melanjutkan..."
            echo
            return 0
        else
            local remaining=$((max_attempts - attempt))
            [ $remaining -gt 0 ] && echo "❌ Password salah! Sisa percobaan: $remaining" && echo
            attempt=$((attempt + 1))
        fi
    done

    show_failure_message
    return 1
}

confirm() {
    local question="$1"
    local default="${2:-N}"
    local prompt_hint
    if [ "$default" = "Y" ]; then prompt_hint="[Y/n]"; else prompt_hint="[y/N]"; fi

    local reply=""
    if [ ! -t 0 ] && [ ! -e /dev/tty ]; then
        # Non-interactive → pakai default
        [ "$default" = "Y" ] && return 0 || return 1
    fi

    printf "%s %s " "$question" "$prompt_hint"
    read -r reply </dev/tty || true
    [ -z "$reply" ] && reply="$default"

    case "$reply" in
        y|Y|yes|YES) return 0 ;;
        *) return 1 ;;
    esac
}

# ================================
# INSTALL PREREQ (idempoten)
# ================================
install_prereqs() {
    echo "🔄 Updating apt cache..."
    sudo apt update -y

    if ! command -v curl >/dev/null 2>&1; then
        sudo apt install -y curl
    fi
    if ! command -v git >/dev/null 2>&1; then
        echo "📦 Installing Git..."
        sudo apt install -y git
    fi
    if ! command -v node >/dev/null 2>&1; then
        echo "📦 Installing Node.js 22.x..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "✅ Node.js: $(node -v)"
    fi
    if ! command -v ffmpeg >/dev/null 2>&1; then
        echo "🎬 Installing FFmpeg..."
        sudo apt install -y ffmpeg
    else
        echo "✅ FFmpeg sudah terinstall"
    fi
    if ! command -v pm2 >/dev/null 2>&1; then
        echo "🚀 Installing PM2..."
        sudo npm install -g pm2
    else
        echo "✅ PM2 sudah terinstall"
    fi
}

setup_timezone_firewall() {
    echo "🕐 Setup timezone host → Asia/Jakarta..."
    sudo timedatectl set-timezone Asia/Jakarta || true

    echo "🔧 Setup firewall..."
    if command -v ufw >/dev/null 2>&1; then
        sudo ufw allow ssh || true
        sudo ufw allow 7575 || true
        sudo ufw --force enable || true
    fi
}

# ================================
# BACKUP existing data
# ================================
backup_existing_data() {
    local label="$1"
    [ ! -d "$INSTALL_DIR" ] && return 0

    local stamp
    stamp="$(date +%Y%m%d_%H%M%S)"
    local target="$BACKUP_ROOT/${stamp}_${label}"
    mkdir -p "$target"

    echo "💾 Membuat backup ke $target ..."
    [ -d "$INSTALL_DIR/db" ]              && cp -a "$INSTALL_DIR/db"              "$target/db"               2>/dev/null || true
    [ -d "$INSTALL_DIR/public/uploads" ]  && cp -a "$INSTALL_DIR/public/uploads"  "$target/uploads"          2>/dev/null || true
    [ -f "$INSTALL_DIR/.env" ]            && cp -a "$INSTALL_DIR/.env"            "$target/.env"             2>/dev/null || true
    echo "✅ Backup selesai."
}

# ================================
# START / RESTART via PM2 ecosystem
# ================================
start_pm2() {
    cd "$INSTALL_DIR"
    if pm2 list 2>/dev/null | grep -q "ozanglive"; then
        echo "🔄 Restart ozanglive via ecosystem.config.js..."
        pm2 delete ozanglive >/dev/null 2>&1 || true
    else
        echo "▶️ Start ozanglive via ecosystem.config.js..."
    fi

    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
    else
        echo "⚠️ ecosystem.config.js tidak ditemukan, fallback ke app.js..."
        pm2 start app.js --name ozanglive
    fi
    pm2 save
}

ensure_env_secret() {
    cd "$INSTALL_DIR"
    if [ ! -f ".env" ] || ! grep -q "^SESSION_SECRET=" .env 2>/dev/null; then
        if [ -f "package.json" ] && grep -q "\"generate-secret\"" package.json; then
            echo "🔐 Generating SESSION_SECRET..."
            npm run generate-secret || true
        fi
    fi
}

# ================================
# UPDATE FLOW
# ================================
do_update() {
    echo "================================"
    echo "   OzangLive UPDATE Mode       "
    echo "================================"

    if [ ! -d "$INSTALL_DIR/.git" ]; then
        echo "❌ Folder $INSTALL_DIR bukan git repo. Tidak bisa update."
        echo "   Jalankan dengan --fresh untuk install ulang."
        exit 1
    fi

    backup_existing_data "before-update"

    cd "$INSTALL_DIR"

    # Simpan perubahan lokal apa adanya (jangan hilangkan)
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo "⚠️ Ada perubahan lokal yang belum di-commit. Stashing..."
        git stash push -u -m "auto-stash before installer update $(date +%Y%m%d_%H%M%S)" || true
    fi

    echo "📥 Fetching latest from origin..."
    git fetch --all --prune

    echo "🔀 Checkout branch: $BRANCH"
    git checkout "$BRANCH"
    git pull --ff-only origin "$BRANCH"

    echo "📦 Updating dependencies..."
    npm install --omit=dev || npm install --production

    ensure_env_secret
    setup_timezone_firewall
    start_pm2
}

# ================================
# FRESH INSTALL FLOW
# ================================
do_fresh() {
    echo "================================"
    echo "   OzangLive FRESH Install     "
    echo "================================"

    if [ -d "$INSTALL_DIR" ] || pm2 list 2>/dev/null | grep -q "ozanglive"; then
        echo "⚠️  Instalasi OzangLive sudah ada di $INSTALL_DIR"
        echo "    FRESH install AKAN MENGHAPUS folder tersebut."
        echo "    Data user (database, uploads, .env) akan di-backup dulu ke:"
        echo "    $BACKUP_ROOT"
        echo
        if ! confirm "Lanjutkan fresh install?" "N"; then
            echo "Dibatalkan. Gunakan --update untuk update tanpa hapus data."
            exit 1
        fi

        backup_existing_data "before-fresh-install"

        echo "🛑 Menghentikan PM2 ozanglive lama..."
        pm2 delete ozanglive >/dev/null 2>&1 || true
        pm2 save >/dev/null 2>&1 || true

        echo "🗑️  Menghapus folder lama..."
        rm -rf "$INSTALL_DIR"
        echo "✅ Folder lama dihapus (backup tersimpan di $BACKUP_ROOT)."
        echo
    fi

    echo "📥 Clone repository..."
    cd "$HOME"
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    if [ "$BRANCH" != "main" ]; then
        git checkout "$BRANCH"
    fi

    echo "⚙️ Installing dependencies..."
    npm install --omit=dev || npm install --production

    ensure_env_secret
    setup_timezone_firewall
    start_pm2
}

# ================================
# MAIN
# ================================
echo "================================"
echo "   OzangLive Quick Installer   "
echo "================================"
echo

if ! prompt_password; then
    exit 1
fi

# Auto-detect mode bila belum di-set
if [ -z "$MODE" ]; then
    if [ -d "$INSTALL_DIR/.git" ]; then
        MODE="update"
        echo "ℹ️ Instalasi terdeteksi → mode UPDATE (data aman, akan di-backup)."
        echo "   Tambahkan --fresh untuk paksa install ulang dari nol."
        echo
    else
        MODE="fresh"
    fi
fi

install_prereqs

case "$MODE" in
    update) do_update ;;
    fresh)  do_fresh  ;;
    *)      echo "Mode tidak dikenal: $MODE"; exit 1 ;;
esac

# ----- pm2 startup hint -----
if ! systemctl list-unit-files 2>/dev/null | grep -q "pm2-"; then
    echo
    echo "💡 Untuk auto-start saat reboot, jalankan:"
    echo "   pm2 startup"
    echo "   (lalu copy & jalankan perintah yang ditampilkan)"
fi

echo
echo "================================"
echo "✅ SELESAI!"
echo "================================"

SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "IP_SERVER")
echo
echo "🌐 URL Akses : http://$SERVER_IP:7575"
echo "📁 Folder    : $INSTALL_DIR"
echo "💾 Backups   : $BACKUP_ROOT"
echo
echo "📌 Perintah berguna:"
echo "   pm2 status              - Cek status"
echo "   pm2 logs ozanglive      - Lihat logs"
echo "   pm2 restart ozanglive   - Restart app"
echo "   pm2 monit               - Monitor realtime"
echo
echo "🔁 Untuk update di kemudian hari, jalankan ulang script ini."
echo "   Mode UPDATE akan otomatis terpilih, data tetap aman."
echo "================================"
