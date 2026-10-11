#!/usr/bin/env bash

set -Eeuo pipefail

# Redirect stdin from /dev/tty jika dijalankan melalui pipe atau script lain
if [ ! -t 0 ] && [ -r /dev/tty ]; then
    exec < /dev/tty
fi

# ======================================================
# 0. DETEKSI DIREKTORI APLIKASI
# ======================================================

if [[ -n "${INSTALL_DIR:-}" && -d "$INSTALL_DIR" ]]; then
    APP_DIR="$INSTALL_DIR"
elif [[ -d "$HOME/ozanglive" ]]; then
    APP_DIR="$HOME/ozanglive"
elif [[ -d "/home/ubuntu/ozanglive" ]]; then
    APP_DIR="/home/ubuntu/ozanglive"
elif [[ -d "$(pwd)" && -f "$(pwd)/ecosystem.config.js" ]]; then
    APP_DIR="$(pwd)"
else
    APP_DIR="$HOME/ozanglive"
fi

APP_NAME="ozanglive"
APP_PORT="7575"

echo ""
echo "======================================================"
echo "       OZANGLIVE - QUICK DEPLOYMENT INSTALLER DOMAIN"
echo "======================================================"
echo ""
echo "Installer ini akan:"
echo "  1. Memeriksa aplikasi"
echo "  2. Meminta domain"
echo "  3. Memperbaiki BASE_URL"
echo "  4. Sinkronisasi environment PM2"
echo "  5. Menyimpan konfigurasi PM2"
echo "  6. Memasang Cloudflare Tunnel"
echo "  7. Memeriksa koneksi tunnel"
echo "  8. Melakukan validasi akhir"
echo ""
echo "Database TIDAK akan dihapus."
echo ""

# ======================================================
# 1. CHECK ROOT / USER
# ======================================================

if [[ "$EUID" -eq 0 ]]; then
    if id ubuntu >/dev/null 2>&1 && [[ -d "/home/ubuntu/ozanglive" && "$APP_DIR" == "/home/ubuntu/ozanglive" ]]; then
        echo "CATATAN: Anda login sebagai root, namun aplikasi terinstal di user ubuntu."
        echo "Installer akan melanjutkan konfigurasi..."
        echo ""
    fi
fi

# ======================================================
# 2. CHECK APPLICATION
# ======================================================

echo "[1/9] Memeriksa aplikasi..."

if [[ ! -d "$APP_DIR" ]]; then
    echo ""
    echo "ERROR: Folder aplikasi tidak ditemukan:"
    echo "$APP_DIR"
    echo ""
    echo "Pastikan aplikasi sudah di-install terlebih dahulu."
    exit 1
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
    echo ""
    echo "ERROR: File .env tidak ditemukan:"
    echo "$APP_DIR/.env"
    exit 1
fi

echo "OK: Aplikasi ditemukan."
echo ""

# ======================================================
# 3. ASK DOMAIN
# ======================================================

echo "======================================================"
echo " KONFIGURASI DOMAIN"
echo "======================================================"
echo ""
echo "Contoh:"
echo "  live1.monsterlive.my.id"
echo "  live2.monsterlive.my.id"
echo "  app.domainlain.com"
echo ""

read -r -p "Masukkan DOMAIN yang akan digunakan: " DOMAIN

DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%/}"

if [[ -z "$DOMAIN" ]]; then
    echo "ERROR: Domain tidak boleh kosong."
    exit 1
fi

if [[ "$DOMAIN" == *"/"* ]]; then
    echo "ERROR: Domain tidak boleh mengandung path."
    echo "Contoh benar: app.example.com"
    exit 1
fi

BASE_URL="https://${DOMAIN}"

echo ""
echo "Domain yang dipilih:"
echo "  $BASE_URL"
echo ""

read -r -p "Benar? [Y/n]: " CONFIRM

if [[ "${CONFIRM:-Y}" =~ ^[Nn]$ ]]; then
    echo "Dibatalkan."
    exit 0
fi

# ======================================================
# 4. BACKUP ENV
# ======================================================

echo ""
echo "[2/9] Membuat backup .env..."

cp "$APP_DIR/.env" "$APP_DIR/.env.backup.$(date +%Y%m%d-%H%M%S)"

echo "OK: Backup .env dibuat."

# ======================================================
# 5. UPDATE BASE_URL AND PORT
# ======================================================

echo ""
echo "[3/9] Memperbarui .env..."

cd "$APP_DIR"

if grep -q '^BASE_URL=' .env; then
    sed -i "s|^BASE_URL=.*|BASE_URL=${BASE_URL}|" .env
else
    echo "BASE_URL=${BASE_URL}" >> .env
fi

if grep -q '^PORT=' .env; then
    sed -i "s|^PORT=.*|PORT=${APP_PORT}|" .env
else
    echo "PORT=${APP_PORT}" >> .env
fi

echo ""
echo "Environment aplikasi:"
grep -E '^(BASE_URL|PORT)=' .env

# ======================================================
# 6. CHECK PM2
# ======================================================

echo ""
echo "[4/9] Memeriksa PM2..."

if ! command -v pm2 >/dev/null 2>&1; then
    echo "ERROR: PM2 belum ter-install."
    echo "Install PM2 terlebih dahulu."
    exit 1
fi

if ! pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    echo ""
    echo "ERROR: PM2 application '$APP_NAME' tidak ditemukan."
    echo ""
    echo "Periksa dengan:"
    echo "  pm2 list"
    exit 1
fi

echo "OK: PM2 application ditemukan."

# ======================================================
# 7. SYNCHRONIZE PM2 ENV
# ======================================================

echo ""
echo "[5/9] Sinkronisasi BASE_URL ke PM2..."

export BASE_URL="$BASE_URL"
export PORT="$APP_PORT"

pm2 restart "$APP_NAME" --update-env

sleep 3

echo ""
echo "Memeriksa environment proses PM2..."

PID="$(pm2 pid "$APP_NAME" | head -n 1 | tr -d '[:space:]')"

if [[ -z "$PID" || "$PID" == "0" ]]; then
    echo "ERROR: PID PM2 tidak ditemukan."
    pm2 status
    exit 1
fi

PM2_BASE_URL="$( (sudo cat "/proc/$PID/environ" 2>/dev/null || cat "/proc/$PID/environ" 2>/dev/null || true) | tr '\0' '\n' | grep '^BASE_URL=' || true)"
PM2_PORT="$( (sudo cat "/proc/$PID/environ" 2>/dev/null || cat "/proc/$PID/environ" 2>/dev/null || true) | tr '\0' '\n' | grep '^PORT=' || true)"

echo ""
echo "PM2 BASE_URL : ${PM2_BASE_URL:-TIDAK ADA}"
echo "PM2 PORT     : ${PM2_PORT:-TIDAK ADA}"

if [[ -n "$PM2_BASE_URL" && "$PM2_BASE_URL" != "BASE_URL=$BASE_URL" ]]; then
    echo "Info: Memastikan env diterapkan pada proses..."
    pm2 reload "$APP_NAME" --update-env || true
fi

echo ""
echo "OK: .env dan PM2 sudah sinkron."

# ======================================================
# 8. SAVE PM2
# ======================================================

echo ""
echo "[6/9] Menyimpan konfigurasi PM2..."

pm2 save

echo "OK: PM2 configuration saved."

# ======================================================
# 9. CLOUDFLARED
# ======================================================

echo ""
echo "======================================================"
echo " CLOUDFLARE TUNNEL"
echo "======================================================"
echo ""

if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared belum ter-install."
    echo ""
    echo "Install cloudflared..."

    sudo mkdir -p --mode=0755 /usr/share/keyrings

    curl -fsSL \
        https://pkg.cloudflare.com/cloudflare-main.gpg \
        | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
        | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null

    sudo apt-get update -y || true
    sudo apt-get install -y cloudflared || true

    if ! command -v cloudflared >/dev/null 2>&1; then
        echo "Apt install belum berhasil. Mengunduh binary cloudflared resmi..."
        sudo curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared || true
        sudo chmod +x /usr/local/bin/cloudflared || true
    fi
fi

echo ""
echo "cloudflared version:"
cloudflared --version

echo ""

# ======================================================
# CHECK EXISTING SERVICE
# ======================================================

if systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared.service'; then

    echo "PERINGATAN:"
    echo "cloudflared.service SUDAH ADA di VPS ini."
    echo ""

    systemctl is-active --quiet cloudflared \
        && echo "Status: RUNNING" \
        || echo "Status: NOT RUNNING"

    echo ""
    read -r -p "Apakah ingin mengganti tunnel/service yang ada? [y/N]: " REPLACE

    if [[ ! "$REPLACE" =~ ^[Yy]$ ]]; then
        echo ""
        echo "Tunnel lama dipertahankan."
        echo "Installer berhenti di tahap Cloudflare."
        echo ""
        echo "Aplikasi sudah dikonfigurasi:"
        echo "  $BASE_URL"
        exit 0
    fi

    echo ""
    echo "Menghapus cloudflared service lama..."

    sudo cloudflared service uninstall || true

    sudo systemctl daemon-reload || true
fi

# ======================================================
# TUNNEL TOKEN
# ======================================================

echo ""
echo "======================================================"
echo " MASUKKAN CLOUDFLARE TUNNEL TOKEN"
echo "======================================================"
echo ""
echo "Buat tunnel di Cloudflare Dashboard terlebih dahulu."
echo ""
echo "Cloudflare:"
echo "  Networking"
echo "    -> Tunnels"
echo "      -> Create Tunnel"
echo ""
echo "Kemudian pilih Linux dan copy Tunnel Token."
echo ""

# ------------------------------------------------------
# TOKEN INPUT YANG AMAN UNTUK SSH / HP
# ------------------------------------------------------
# Jangan memakai read -s: beberapa aplikasi SSH mobile bermasalah
# saat paste input tersembunyi.
# Input juga TIDAK diteruskan melalui shell/eval.
# Jika user menempelkan seluruh perintah install dari Cloudflare,
# script akan mengambil token dari argumen terakhir.
# ------------------------------------------------------

echo ""
echo "CARA PASTE TOKEN:"
echo "1. Copy Tunnel Token dari Cloudflare."
echo "2. Paste ke prompt di bawah."
echo "3. Tekan ENTER."
echo ""
echo "Bisa paste TOKEN SAJA atau seluruh perintah 'cloudflared service install ...'."
echo "Token tidak disimpan ke shell history."
echo ""

# Pastikan sudo siap sebelum proses instalasi service.
sudo -v

TUNNEL_TOKEN=""
INSTALL_OK=0

while [[ "$INSTALL_OK" -ne 1 ]]; do
    echo ""
    IFS= read -r -p "Paste Tunnel Token: " RAW_TOKEN || true

    # Bersihkan karakter clipboard yang umum.
    RAW_TOKEN="${RAW_TOKEN//$'\r'/}"
    RAW_TOKEN="${RAW_TOKEN#"${RAW_TOKEN%%[![:space:]]*}"}"
    RAW_TOKEN="${RAW_TOKEN%"${RAW_TOKEN##*[![:space:]]}"}"

    # Ambil token dari beberapa format yang mungkin disalin dari Cloudflare.
    # Contoh:
    #   eyJ...
    #   cloudflared tunnel run --token eyJ...
    #   sudo cloudflared service install eyJ...
    if [[ "$RAW_TOKEN" == *"--token"* ]]; then
        TUNNEL_TOKEN="${RAW_TOKEN#*--token}"
    elif [[ "$RAW_TOKEN" == *"service install"* ]]; then
        TUNNEL_TOKEN="${RAW_TOKEN#*service install}"
    else
        TUNNEL_TOKEN="$RAW_TOKEN"
    fi

    # Ambil hanya token pertama setelah command/flag, lalu bersihkan quote.
    TUNNEL_TOKEN="$(printf '%s\n' "$TUNNEL_TOKEN" | awk '{print $1}')"
    TUNNEL_TOKEN="${TUNNEL_TOKEN#\"}"
    TUNNEL_TOKEN="${TUNNEL_TOKEN%\"}"
    TUNNEL_TOKEN="${TUNNEL_TOKEN#\'}"
    TUNNEL_TOKEN="${TUNNEL_TOKEN%\'}"
    TUNNEL_TOKEN="${TUNNEL_TOKEN//$'\r'/}"

    if [[ -z "$TUNNEL_TOKEN" ]]; then
        echo ""
        echo "ERROR: Token kosong. Silakan paste ulang."
        continue
    fi

    # JANGAN memvalidasi bentuk JWT di sini.
    # Format token dapat berubah; cloudflared sendiri yang menjadi validator.
    echo ""
    echo "Token diterima. Memasang Cloudflare Tunnel service..."
    echo "(Jika gagal, installer TIDAK akan menutup terminal.)"
    echo ""

    # Jangan biarkan kegagalan service install mematikan script/SSH.
    set +e
    sudo cloudflared service install "$TUNNEL_TOKEN"
    INSTALL_RC=$?
    set -e

    if [[ "$INSTALL_RC" -eq 0 ]]; then
        INSTALL_OK=1
        echo ""
        echo "OK: Cloudflare service berhasil dipasang."
    else
        echo ""
        echo "ERROR: Cloudflare gagal memasang service. (exit code: $INSTALL_RC)"
        echo ""
        echo "Kemungkinan:"
        echo "  - Token tidak valid / sudah di-rotate."
        echo "  - Token terpotong saat copy/paste."
        echo "  - Service lama masih bentrok."
        echo ""
        echo "Silakan paste token yang BARU untuk mencoba lagi."
        echo "Tidak perlu menjalankan ulang script."
        TUNNEL_TOKEN=""
    fi
done

# Token tidak lagi dibutuhkan oleh script.
unset TUNNEL_TOKEN

echo ""
echo "OK: Cloudflare service terpasang."

# ======================================================
# ENABLE + START
# ======================================================

echo ""
echo "[8/9] Mengaktifkan Cloudflare Tunnel..."

sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

sleep 5

echo ""
echo "Cloudflare service status:"
sudo systemctl status cloudflared --no-pager -l | head -40

# ======================================================
# LOCAL APPLICATION CHECK
# ======================================================

echo ""
echo "Memeriksa aplikasi lokal..."

if curl -fsS --max-time 10 "http://127.0.0.1:${APP_PORT}" >/dev/null; then
    echo "OK: Aplikasi merespons di:"
    echo "http://127.0.0.1:${APP_PORT}"
else
    echo ""
    echo "WARNING: Aplikasi tidak merespons di port ${APP_PORT}."
    echo ""
    echo "Periksa:"
    echo "  pm2 logs ${APP_NAME}"
fi

# ======================================================
# FINAL VALIDATION
# ======================================================

echo ""
echo "======================================================"
echo " VALIDASI AKHIR"
echo "======================================================"

echo ""
echo "Domain:"
echo "  $BASE_URL"

echo ""
echo "OAuth Callback:"
echo "  ${BASE_URL}/api/youtube/oauth/callback"

echo ""
echo "Local Application:"
echo "  http://127.0.0.1:${APP_PORT}"

echo ""
echo "PM2:"
pm2 status

echo ""
echo "Cloudflare:"
if systemctl is-active --quiet cloudflared; then
    echo "  STATUS: HEALTHY / RUNNING"
else
    echo "  STATUS: NOT RUNNING"
fi

echo ""
echo "======================================================"
echo "              DEPLOYMENT SELESAI"
echo "======================================================"
echo ""
echo "Aplikasi:"
echo "  $BASE_URL"
echo ""
echo "OAuth Callback:"
echo "  ${BASE_URL}/api/youtube/oauth/callback"
echo ""
echo "PENTING:"
echo "Authorized Redirect URI di Google Cloud harus:"
echo ""
echo "  ${BASE_URL}/api/youtube/oauth/callback"
echo ""
echo "======================================================"
echo ""
