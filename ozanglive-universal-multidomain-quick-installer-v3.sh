#!/usr/bin/env bash

# Safe mode
set +e

# Reconnect standard input to terminal if run through a pipe (e.g. curl ... | bash)
if [ ! -t 0 ] && [ -r /dev/tty ]; then
    exec < /dev/tty 2>/dev/null || true
fi

# Fallback for sudo if root or command not found
if ! command -v sudo >/dev/null 2>&1; then
    sudo() { "$@"; }
fi

# Dynamic application directory detection
if [[ -z "${APP_DIR:-}" ]]; then
    if [[ -d "$HOME/ozanglive" ]]; then
        APP_DIR="$HOME/ozanglive"
    elif [[ -d "/home/ubuntu/ozanglive" ]]; then
        APP_DIR="/home/ubuntu/ozanglive"
    elif [[ -f "$(pwd)/package.json" ]]; then
        APP_DIR="$(pwd)"
    else
        APP_DIR="$HOME/ozanglive"
    fi
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
# 1. USER & PERMISSION INFO
# ======================================================

if [[ "$EUID" -eq 0 ]]; then
    echo "Info: Menjalankan installer sebagai user root."
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

echo "OK: Aplikasi ditemukan di $APP_DIR."
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
echo "(Tekan ENTER atau ketik 'skip' jika ingin melewati konfigurasi domain sekarang)"
echo ""

read -r -p "Masukkan DOMAIN yang akan digunakan: " DOMAIN </dev/tty 2>/dev/null || read -r -p "Masukkan DOMAIN yang akan digunakan: " DOMAIN || DOMAIN=""

DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%/}"

if [[ -z "$DOMAIN" || "$DOMAIN" =~ ^(skip|n|no|exit)$ ]]; then
    echo ""
    echo "Setup domain dilewati."
    echo "Aplikasi Anda tetap berjalan normal di: http://127.0.0.1:${APP_PORT}"
    echo "Untuk setup domain nanti, cukup jalankan:"
    echo "  cd $APP_DIR && bash ozanglive-universal-multidomain-quick-installer-v3.sh"
    exit 0
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

read -r -p "Benar? [Y/n]: " CONFIRM </dev/tty 2>/dev/null || read -r -p "Benar? [Y/n]: " CONFIRM || CONFIRM="Y"

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

if [[ -n "$PID" && -f "/proc/$PID/environ" ]]; then
    PM2_BASE_URL="$(sudo tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | grep '^BASE_URL=' || true)"
    PM2_PORT="$(sudo tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | grep '^PORT=' || true)"
    echo ""
    echo "PM2 BASE_URL : ${PM2_BASE_URL:-TIDAK ADA}"
    echo "PM2 PORT     : ${PM2_PORT:-TIDAK ADA}"
fi

echo ""
echo "OK: .env dan PM2 sudah disinkronkan."

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

    sudo mkdir -p --mode=0755 /usr/share/keyrings || true

    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null 2>&1 || true

    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null 2>&1 || true

    sudo apt-get update -y || true
    if ! sudo apt-get install -y cloudflared; then
        echo "Apt install gagal atau repo belum sinkron. Mendownload binary cloudflared langsung..."
        sudo curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
        sudo chmod +x /usr/local/bin/cloudflared
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
    read -r -p "Apakah ingin mengganti tunnel/service yang ada? [y/N]: " REPLACE </dev/tty 2>/dev/null || read -r -p "Apakah ingin mengganti tunnel/service yang ada? [y/N]: " REPLACE || REPLACE="N"

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
# TOKEN INPUT YANG RAMAH UNTUK SSH / HP
# ------------------------------------------------------
# V3 memakai "read -s". Pada beberapa aplikasi SSH mobile,
# input tersembunyi dapat membuat paste terlihat seperti tidak masuk.
# Di versi ini token sengaja dibuat TERLIHAT saat paste agar mudah
# dipastikan sudah masuk. Token tidak dimasukkan ke shell history.
# ------------------------------------------------------

echo ""
echo "CARA PASTE TOKEN:"
echo "1. Copy Tunnel Token dari Cloudflare."
echo "2. Paste ke prompt di bawah."
echo "3. Tekan ENTER."
echo ""
echo "CATATAN: token akan terlihat di layar saat ditempel."
echo "Jangan screenshot atau bagikan token tersebut."
echo ""

# Pastikan sudo siap sebelum proses instalasi service.
sudo -v

TUNNEL_TOKEN=""
while [[ -z "$TUNNEL_TOKEN" ]]; do
    IFS= read -r -p "Paste Tunnel Token: " TUNNEL_TOKEN </dev/tty 2>/dev/null || IFS= read -r -p "Paste Tunnel Token: " TUNNEL_TOKEN || TUNNEL_TOKEN=""
    # Bersihkan carriage-return yang kadang ikut terbawa dari clipboard.
    TUNNEL_TOKEN="${TUNNEL_TOKEN//$'\\r'/}"
    TUNNEL_TOKEN="${TUNNEL_TOKEN#"${TUNNEL_TOKEN%%[![:space:]]*}"}"
    TUNNEL_TOKEN="${TUNNEL_TOKEN%"${TUNNEL_TOKEN##*[![:space:]]}"}"

    if [[ -z "$TUNNEL_TOKEN" ]]; then
        echo ""
        echo "ERROR: Token kosong. Silakan paste ulang."
        echo ""
    fi
done

echo ""
echo "Token diterima. Memasang Cloudflare Tunnel service..."

# ======================================================
# INSTALL CLOUDFLARED SERVICE
# ======================================================

echo ""
echo "[7/9] Memasang Cloudflare Tunnel service..."

if ! sudo cloudflared service install "$TUNNEL_TOKEN"; then
    echo ""
    echo "ERROR: Cloudflare gagal memasang service menggunakan token."
    echo ""
    echo "Kemungkinan:"
    echo "  - Token terpotong saat copy/paste."
    echo "  - Yang ditempel bukan Tunnel Token."
    echo "  - Tunnel di Cloudflare sudah dihapus/tidak valid."
    echo ""
    echo "Silakan jalankan installer kembali dan copy token dari:"
    echo "Cloudflare Dashboard -> Networking -> Tunnels -> tunnel -> Connectors"
    unset TUNNEL_TOKEN
    exit 1
fi

# Token tidak lagi dibutuhkan oleh script.
unset TUNNEL_TOKEN

echo ""
echo "OK: Cloudflare service terpasang."

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
