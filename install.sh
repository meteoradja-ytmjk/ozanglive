#!/bin/bash
# ==============================================================================
#  OzangLive Quick Installer & Updater
#  Visual UI Redesign - Premium Cyberpunk Terminal Interface
# ==============================================================================
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
# ==============================================================================

set -e

# ANSI Styling Definitions
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

CYAN='\033[36m'
B_CYAN='\033[1;36m'
BLUE='\033[34m'
B_BLUE='\033[1;34m'
PURPLE='\033[35m'
B_PURPLE='\033[1;35m'
GREEN='\033[32m'
B_GREEN='\033[1;32m'
YELLOW='\033[33m'
B_YELLOW='\033[1;33m'
RED='\033[31m'
B_RED='\033[1;31m'
WHITE='\033[1;37m'
GRAY='\033[90m'

# Icons
ICON_SUCCESS="${B_GREEN}✔${NC}"
ICON_ERROR="${B_RED}✖${NC}"
ICON_WARN="${B_YELLOW}⚠️${NC}"
ICON_INFO="${B_CYAN}ℹ${NC}"
ICON_LOCK="${B_PURPLE}🔐${NC}"
ICON_GEAR="${B_CYAN}⚙️${NC}"
ICON_ROCKET="${B_GREEN}🚀${NC}"
ICON_PACKAGE="${B_BLUE}📦${NC}"
ICON_FIRE="${B_RED}🔥${NC}"
ICON_WAIT="${B_CYAN}⏳${NC}"

INSTALL_DIR="$HOME/ozanglive"
BACKUP_ROOT="$HOME/ozanglive-backups"
REPO_URL="https://github.com/meteoradja-ytmjk/ozanglive"
LOG_FILE="/tmp/ozang_install_$(date +%s).log"

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
        *) 
            echo -e "${B_RED}Error: Flag tidak dikenal: $1${NC}"
            exit 1 
            ;;
    esac
done

# ==============================================================================
# UI DRAWING FUNCTIONS
# ==============================================================================
draw_banner() {
    clear 2>/dev/null || true
    echo -e "${B_CYAN}╭──────────────────────────────────────────────────────────╮${NC}"
    echo -e "${B_CYAN}│${NC}       ${B_PURPLE}█▀▄▀█ █▀█ █▄ █ █▀▀ ▀█▀ █▀▀ █▀▄ █   █ █ █▀▀${NC}         ${B_CYAN}│${NC}"
    echo -e "${B_CYAN}│${NC}       ${B_CYAN}█ ▀ █ █ █ █ ▀█ ▀▀█  █  █▀▀ █▀▄ █   █ ▀▄▀ █▀▀${NC}         ${B_CYAN}│${NC}"
    echo -e "${B_CYAN}│${NC}       ${B_BLUE}█   █ █▄█ █  █ ▄▄█  █  ██▄ █ █ █▄▄ █  █  ██▄${NC}         ${B_CYAN}│${NC}"
    echo -e "${B_CYAN}│${NC}                                                          ${B_CYAN}│${NC}"
    echo -e "${B_CYAN}│${NC}        ${B_WHITE}STREAMING PLATFORM AUTOMATION — QUICK INSTALLER${NC}   ${B_CYAN}│${NC}"
    echo -e "${B_CYAN}╰──────────────────────────────────────────────────────────╯${NC}"
    echo
}

draw_section() {
    local step="$1"
    local title="$2"
    echo -e "${B_CYAN}┌──────────────────────────────────────────────────────────┐${NC}"
    echo -e "${B_CYAN}│${NC} ${B_YELLOW}[$step]${NC} ${B_WHITE}$title${NC}"
    echo -e "${B_CYAN}└──────────────────────────────────────────────────────────┘${NC}"
}

print_status() {
    local icon="$1"
    local msg="$2"
    echo -e "  $icon $msg"
}

run_task() {
    local label="$1"
    shift
    printf "  ${ICON_WAIT} %-50s" "$label..."
    if "$@" >> "$LOG_FILE" 2>&1; then
        printf "\r  ${ICON_SUCCESS} %-50s ${GRAY}(Selesai)${NC}\n" "$label"
    else
        printf "\r  ${ICON_ERROR} %-50s ${B_RED}(Gagal)${NC}\n" "$label"
        echo -e "\n${B_RED}╭────────────────── LOG ERROR SUMMARY ──────────────────╮${NC}"
        tail -n 15 "$LOG_FILE" | sed 's/^/│ /'
        echo -e "${B_RED}╰───────────────────────────────────────────────────────╯${NC}\n"
        exit 1
    fi
}

# ==============================================================================
# PASSWORD & AUTHENTICATION
# ==============================================================================
validate_password() {
    [ "$1" = "1988" ]
}

show_failure_message() {
    echo
    echo -e "${B_RED}╭──────────────────────────────────────────────────────────╮${NC}"
    echo -e "${B_RED}│ ❌ INSTALASI DIBATALKAN                                  │${NC}"
    echo -e "${B_RED}├──────────────────────────────────────────────────────────┤${NC}"
    echo -e "${B_RED}│ Password salah 3 kali berturut-turut.                    │${NC}"
    echo -e "${B_RED}│ Hubungi developer: 📱 WhatsApp 089621453431              │${NC}"
    echo -e "${B_RED}╰──────────────────────────────────────────────────────────╯${NC}"
    echo
}

prompt_password() {
    [ "$SKIP_PASSWORD" = "true" ] && return 0

    local max_attempts=3
    local attempt=1
    local password=""

    if [ ! -t 0 ] && [ ! -e /dev/tty ]; then
        echo -e "  ${ICON_ERROR} Error: Tidak dapat membaca input interaktif."
        echo -e "     Jalankan script langsung, bukan via pipe tanpa /dev/tty."
        return 1
    fi

    echo -e "${B_PURPLE}╭──────────────────────────────────────────────────────────╮${NC}"
    echo -e "${B_PURPLE}│ 🔐 OTENTIKASI KEAMANAN                                   │${NC}"
    echo -e "${B_PURPLE}│    Instalasi ini memerlukan password otorisasi.          │${NC}"
    echo -e "${B_PURPLE}│    Hubungi developer jika belum memiliki password.       │${NC}"
    echo -e "${B_PURPLE}╰──────────────────────────────────────────────────────────╯${NC}"
    echo

    while [ $attempt -le $max_attempts ]; do
        printf "  🔑 ${BOLD}Masukkan Password (${attempt}/${max_attempts}):${NC} "
        stty -echo 2>/dev/null </dev/tty || true
        read -r password </dev/tty
        stty echo 2>/dev/null </dev/tty || true
        echo

        if [ -z "$password" ]; then
            local remaining=$((max_attempts - attempt))
            [ $remaining -gt 0 ] && echo -e "  ${ICON_ERROR} ${RED}Password tidak boleh kosong! Sisa percobaan: ${remaining}${NC}\n"
            attempt=$((attempt + 1))
            continue
        fi

        if validate_password "$password"; then
            echo -e "  ${ICON_SUCCESS} ${B_GREEN}Password benar! Otorisasi diterima.${NC}\n"
            sleep 1
            return 0
        else
            local remaining=$((max_attempts - attempt))
            [ $remaining -gt 0 ] && echo -e "  ${ICON_ERROR} ${RED}Password salah! Sisa percobaan: ${remaining}${NC}\n"
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
        [ "$default" = "Y" ] && return 0 || return 1
    fi

    printf "  ${B_YELLOW}❓ %s %s:${NC} " "$question" "$prompt_hint"
    read -r reply </dev/tty || true
    [ -z "$reply" ] && reply="$default"

    case "$reply" in
        y|Y|yes|YES) return 0 ;;
        *) return 1 ;;
    esac
}

# ==============================================================================
# INSTALL PREREQUISITES
# ==============================================================================
install_prereqs() {
    draw_section "1/4" "MEMERIKSA & MENGINSTAL DEPENDENSI SISTEM"

    run_task "Mengupdate package cache apt" sudo apt-get update -y

    if ! command -v curl >/dev/null 2>&1; then
        run_task "Menginstal Curl" sudo apt-get install -y curl
    else
        print_status "$ICON_SUCCESS" "Curl terpasang"
    fi

    if ! command -v git >/dev/null 2>&1; then
        run_task "Menginstal Git" sudo apt-get install -y git
    else
        print_status "$ICON_SUCCESS" "Git $(git --version 2>/dev/null | awk '{print $3}') terpasang"
    fi

    if ! command -v node >/dev/null 2>&1; then
        run_task "Mengonfigurasi repository Node.js 22.x" bash -c "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
        run_task "Menginstal Node.js 22.x" sudo apt-get install -y nodejs
    else
        print_status "$ICON_SUCCESS" "Node.js $(node -v 2>/dev/null) terpasang"
    fi

    if ! command -v ffmpeg >/dev/null 2>&1; then
        run_task "Menginstal FFmpeg Multimedia Engine" sudo apt-get install -y ffmpeg
    else
        print_status "$ICON_SUCCESS" "FFmpeg Multimedia Engine terpasang"
    fi

    if ! command -v pm2 >/dev/null 2>&1; then
        run_task "Menginstal PM2 Process Manager" sudo npm install -g pm2
    else
        print_status "$ICON_SUCCESS" "PM2 Process Manager terpasang"
    fi
    echo
}

setup_timezone_firewall() {
    run_task "Mengatur timezone server ke Asia/Jakarta" sudo timedatectl set-timezone Asia/Jakarta
    if command -v ufw >/dev/null 2>&1; then
        run_task "Mengonfigurasi Firewall UFW (SSH & Port 7575)" bash -c "sudo ufw allow ssh >/dev/null 2>&1 && sudo ufw allow 7575 >/dev/null 2>&1 && sudo ufw --force enable >/dev/null 2>&1 || true"
    fi
}

# ==============================================================================
# DATA BACKUP
# ==============================================================================
backup_existing_data() {
    local label="$1"
    [ ! -d "$INSTALL_DIR" ] && return 0

    local stamp
    stamp="$(date +%Y%m%d_%H%M%S)"
    local target="$BACKUP_ROOT/${stamp}_${label}"

    printf "  ${ICON_WAIT} %-50s" "Membuat backup data pengguna..."
    mkdir -p "$target"
    [ -d "$INSTALL_DIR/db" ]              && cp -a "$INSTALL_DIR/db"              "$target/db"               2>/dev/null || true
    [ -d "$INSTALL_DIR/public/uploads" ]  && cp -a "$INSTALL_DIR/public/uploads"  "$target/uploads"          2>/dev/null || true
    [ -f "$INSTALL_DIR/.env" ]            && cp -a "$INSTALL_DIR/.env"            "$target/.env"             2>/dev/null || true
    printf "\r  ${ICON_SUCCESS} %-50s ${GRAY}(%s)${NC}\n" "Backup data pengguna selesai" "$target"
}

# ==============================================================================
# PM2 & ENVIRONMENT
# ==============================================================================
start_pm2() {
    cd "$INSTALL_DIR"
    if pm2 list 2>/dev/null | grep -q "ozanglive"; then
        run_task "Menghentikan instance PM2 MonsterLive lama" bash -c "pm2 delete ozanglive >/dev/null 2>&1 || true"
    fi

    if [ -f "ecosystem.config.js" ]; then
        run_task "Menjalankan MonsterLive via ecosystem.config.js" pm2 start ecosystem.config.js
    else
        print_status "$ICON_WARN" "ecosystem.config.js tidak ditemukan, fallback ke app.js"
        run_task "Menjalankan MonsterLive via app.js" pm2 start app.js --name ozanglive
    fi
    run_task "Menyimpan konfigurasi PM2 (pm2 save)" pm2 save
}

ensure_env_secret() {
    cd "$INSTALL_DIR"
    if [ ! -f ".env" ] || ! grep -q "^SESSION_SECRET=" .env 2>/dev/null; then
        if [ -f "package.json" ] && grep -q "\"generate-secret\"" package.json; then
            run_task "Membuat SESSION_SECRET otomatis di .env" npm run generate-secret
        fi
    fi
}

# ==============================================================================
# UPDATE FLOW
# ==============================================================================
do_update() {
    draw_section "2/4" "MODE PEMBARUAN (UPDATE MODE)"

    if [ ! -d "$INSTALL_DIR/.git" ]; then
        print_status "$ICON_ERROR" "Folder $INSTALL_DIR bukan repository git. Tidak dapat update."
        print_status "$ICON_INFO" "Gunakan flag --fresh untuk menginstal dari awal."
        exit 1
    fi

    backup_existing_data "before-update"

    cd "$INSTALL_DIR"

    if ! git diff --quiet || ! git diff --cached --quiet; then
        run_task "Stash perubahan lokal sementara" bash -c "git stash push -u -m 'auto-stash before installer update $(date +%Y%m%d_%H%M%S)' || true"
    fi

    run_task "Mengambil pembaruan terbaru (git fetch)" git fetch --all --prune
    run_task "Checkout ke branch $BRANCH" git checkout "$BRANCH"
    run_task "Menarik kode terbaru (git pull)" git pull --ff-only origin "$BRANCH"

    draw_section "3/4" "MENGINSTAL DEPENDENSI PROYEK"
    run_task "Menginstal Node.js dependencies" bash -c "npm install --omit=dev || npm install --production"

    draw_section "4/4" "KONFIGURASI AKHIR & MENJALANKAN SERVICE"
    ensure_env_secret
    setup_timezone_firewall
    start_pm2
}

# ==============================================================================
# FRESH INSTALL FLOW
# ==============================================================================
do_fresh() {
    draw_section "2/4" "MODE INSTALASI BARU (FRESH INSTALL)"

    if [ -d "$INSTALL_DIR" ] || pm2 list 2>/dev/null | grep -q "ozanglive"; then
        echo -e "  ${ICON_WARN} ${B_YELLOW}Instalasi MonsterLive terdeteksi di:${NC} $INSTALL_DIR"
        echo -e "  ${GRAY}FRESH install akan MENGHAPUS folder lama setelah mem-backup data.${NC}"
        echo -e "  ${GRAY}Database, uploads, dan file .env akan disimpan di:${NC} $BACKUP_ROOT"
        echo

        if ! confirm "Apakah Anda yakin ingin melanjutkan Fresh Install?" "N"; then
            print_status "$ICON_INFO" "Dibatalkan. Gunakan mode --update untuk update tanpa hapus data."
            exit 1
        fi

        backup_existing_data "before-fresh-install"

        run_task "Menghentikan instance PM2 lama" bash -c "pm2 delete ozanglive >/dev/null 2>&1 || true && pm2 save >/dev/null 2>&1 || true"
        run_task "Menghapus folder instalasi lama" rm -rf "$INSTALL_DIR"
        echo
    fi

    run_task "Cloning repository MonsterLive ($BRANCH)" git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    draw_section "3/4" "MENGINSTAL DEPENDENSI PROYEK"
    run_task "Menginstal Node.js dependencies" bash -c "npm install --omit=dev || npm install --production"

    draw_section "4/4" "KONFIGURASI AKHIR & MENJALANKAN SERVICE"
    ensure_env_secret
    setup_timezone_firewall
    start_pm2
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================
draw_banner

if ! prompt_password; then
    exit 1
fi

# Auto-detect mode bila belum di-set
if [ -z "$MODE" ]; then
    if [ -d "$INSTALL_DIR/.git" ]; then
        MODE="update"
        print_status "$ICON_INFO" "Instalasi terdeteksi → Mode ${B_CYAN}UPDATE${NC} (Data aman & di-backup otomatis)."
        print_status "$ICON_INFO" "Tambahkan ${YELLOW}--fresh${NC} jika ingin menginstal dari awal."
        echo
    else
        MODE="fresh"
    fi
fi

install_prereqs

case "$MODE" in
    update) do_update ;;
    fresh)  do_fresh  ;;
    *)      print_status "$ICON_ERROR" "Mode tidak dikenal: $MODE"; exit 1 ;;
esac

# Summary
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "IP_SERVER_ANDA")

echo
echo -e "${B_GREEN}╭──────────────────────────────────────────────────────────╮${NC}"
echo -e "${B_GREEN}│ 🎉 INSTALASI & KONFIGURASI BERHASIL DISLESAIKAN!       │${NC}"
echo -e "${B_GREEN}├──────────────────────────────────────────────────────────┤${NC}"
echo -e "${B_GREEN}│${NC} 🌐 ${BOLD}URL Akses Web${NC} : ${B_CYAN}http://${SERVER_IP}:7575${NC}"
echo -e "${B_GREEN}│${NC} 📁 ${BOLD}Lokasi App${NC}   : ${WHITE}${INSTALL_DIR}${NC}"
echo -e "${B_GREEN}│${NC} 💾 ${BOLD}Folder Backup${NC}: ${WHITE}${BACKUP_ROOT}${NC}"
echo -e "${B_GREEN}├──────────────────────────────────────────────────────────┤${NC}"
echo -e "${B_GREEN}│ 📌 ${BOLD}PERINTAH PENTING MANAGEMENT (PM2):${NC}                   │"
echo -e "${B_GREEN}│${NC}   • ${B_YELLOW}pm2 status${NC}              - Status aplikasi"
echo -e "${B_GREEN}│${NC}   • ${B_YELLOW}pm2 logs ozanglive${NC}      - Monitoring log real-time"
echo -e "${B_GREEN}│${NC}   • ${B_YELLOW}pm2 restart ozanglive${NC}   - Restart aplikasi"
echo -e "${B_GREEN}│${NC}   • ${B_YELLOW}pm2 monit${NC}               - Dashboard performa RAM/CPU"
echo -e "${B_GREEN}╰──────────────────────────────────────────────────────────╯${NC}"

if ! systemctl list-unit-files 2>/dev/null | grep -q "pm2-"; then
    echo
    echo -e "  ${ICON_INFO} ${B_YELLOW}Tips Auto-Start Reboot:${NC}"
    echo -e "     Jalankan ${B_CYAN}pm2 startup${NC} dan ikuti perintah yang muncul agar"
    echo -e "     MonsterLive otomatis berjalan saat VPS/Server dinyalakan ulang."
fi

echo
echo -e "  ${ICON_ROCKET} ${B_GREEN}Terima kasih telah menggunakan MonsterLive Quick Installer!${NC}"
echo
