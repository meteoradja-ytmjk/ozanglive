#!/usr/bin/env bash

# ==============================================================
# OZANGLIVE - UNIVERSAL MULTI-USER / MULTI-DOMAIN QUICK INSTALLER V3
# ==============================================================
# IMPORTANT:
# Run this on a VPS AFTER Ozanglive/MonsterLive is installed.
#
# This installer does NOT assume monsterlive.my.id.
# Every customer/user can have a completely different domain:
#
#   user A -> https://stream.example.com
#   user B -> https://panel.otherdomain.com
#   user C -> https://live.customer-domain.com
#
# Each VPS gets its OWN Cloudflare Tunnel + UUID + JSON credential.
#
# REQUIREMENT:
# 1. The application must already be running (check with: pm2 status)
# 2. Domain SEBAIKNYA sudah ditambahkan ke Cloudflare (bisa skip, setup manual nanti)
# 3. Port 7575 atau port aplikasi harus bisa diakses
#
# The installer:
# - installs cloudflared
# - logs into the user's Cloudflare account
# - creates a unique tunnel
# - creates local config.yml
# - routes the user's domain to localhost:APP_PORT
# - updates PORT + BASE_URL in .env
# - installs cloudflared as systemd
# - restarts PM2 if present
# - tests local origin + public HTTPS
#
# It does NOT:
# - install aplikasi MonsterLive (gunakan install.sh dulu)
# - change Google Cloud OAuth Console
# - replace an existing ENCRYPTION_KEY
# - copy secrets to the screen
# ==============================================================

# Make script more tolerant - only exit on explicit die() calls
set -Eeu
trap 'handle_error $LINENO' ERR

handle_error() {
    local line_no=$1
    echo
    echo "❌ Installer mengalami error pada baris $line_no."
    echo "Jika Anda memerlukan bantuan, hubungi support dengan informasi ini."
    exit 1
}

C_RESET='\033[0m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[0;31m'

ok()   { echo -e "${C_GREEN}✅ $*${C_RESET}"; }
warn() { echo -e "${C_YELLOW}⚠️  $*${C_RESET}"; }
die()  { echo -e "${C_RED}❌ $*${C_RESET}"; exit 1; }

echo
echo "=============================================================="
echo " OZANGLIVE - UNIVERSAL MULTI-DOMAIN QUICK INSTALLER V3"
echo "=============================================================="
echo
echo "Installer ini akan mengkonfigurasi DOMAIN KUSTOM untuk aplikasi"
echo "MonsterLive Anda menggunakan Cloudflare Tunnel."
echo
echo "Domain tidak harus monsterlive.my.id."
echo "Setiap user boleh memakai domain yang berbeda."
echo

# ---------------- PRE-CHECK ----------------

echo "=============================================================="
echo " PRE-FLIGHT CHECK"
echo "=============================================================="
echo

# Check if PM2 app is running
if ! command -v pm2 >/dev/null 2>&1; then
    die "PM2 tidak terinstall. Jalankan install.sh terlebih dahulu."
fi

PM2_LIST_OUTPUT=$(pm2 list 2>/dev/null || echo "")
if echo "$PM2_LIST_OUTPUT" | grep -q "ozanglive"; then
    ok "Aplikasi MonsterLive ditemukan di PM2"
else
    warn "Aplikasi 'ozanglive' tidak ditemukan di PM2."
    echo
    echo "Pastikan aplikasi MonsterLive sudah terinstall dan running."
    echo "Jalankan dulu: bash install.sh"
    echo
    read -rp "Tetap lanjutkan installer domain? [y/N]: " FORCE_CONTINUE
    if [[ ! "$FORCE_CONTINUE" =~ ^[Yy]$ ]]; then
        die "Installer dibatalkan. Instal aplikasi terlebih dahulu."
    fi
fi

echo

# ---------------- INPUT ----------------

read -rp "Nama tunnel unik [live-user-01]: " TUNNEL_NAME
TUNNEL_NAME="${TUNNEL_NAME:-live-user-01}"

echo
echo "=============================================================="
echo " PEMILIHAN DOMAIN"
echo "=============================================================="
echo "Apakah user ingin menggunakan BASE DOMAIN yang sama?"
echo "Contoh: monsterlive.my.id"
echo
echo "Y = gunakan base domain yang sama, lalu masukkan subdomain/alias."
echo "N = gunakan domain berbeda milik user."
echo

read -rp "Gunakan base domain yang sama? [Y/n]: " SAME_BASE
SAME_BASE="${SAME_BASE:-Y}"

if [[ "$SAME_BASE" =~ ^[Yy]$ ]]; then
    read -rp "Base domain yang digunakan (contoh: monsterlive.my.id): " BASE_DOMAIN
    [[ -n "$BASE_DOMAIN" ]] || die "Base domain wajib diisi."

    BASE_DOMAIN="${BASE_DOMAIN#https://}"
    BASE_DOMAIN="${BASE_DOMAIN#http://}"
    BASE_DOMAIN="${BASE_DOMAIN%%/*}"

    read -rp "Subdomain/alias user (contoh: live2): " SUBDOMAIN
    [[ -n "$SUBDOMAIN" ]] || die "Subdomain/alias wajib diisi."

    SUBDOMAIN="${SUBDOMAIN#https://}"
    SUBDOMAIN="${SUBDOMAIN#http://}"
    SUBDOMAIN="${SUBDOMAIN%%/*}"

    if [[ "$SUBDOMAIN" == *.* ]]; then
        PUBLIC_HOST="$SUBDOMAIN"
    else
        PUBLIC_HOST="${SUBDOMAIN}.${BASE_DOMAIN}"
    fi
else
    echo
    echo "Masukkan DOMAIN PENUH milik user."
    echo "Contoh: stream.budilive.com"
    echo
    read -rp "Domain publik user: " PUBLIC_HOST
    [[ -n "$PUBLIC_HOST" ]] || die "Domain wajib diisi."

    PUBLIC_HOST="${PUBLIC_HOST#https://}"
    PUBLIC_HOST="${PUBLIC_HOST#http://}"
    PUBLIC_HOST="${PUBLIC_HOST%%/*}"
fi

echo
echo "Domain yang akan digunakan: https://$PUBLIC_HOST"
echo

read -rp "Apakah domain tersebut SUDAH ditambahkan ke Cloudflare? [Y/n]: " DOMAIN_READY
DOMAIN_READY="${DOMAIN_READY:-Y}"

read -rp "Port aplikasi [7575]: " APP_PORT
APP_PORT="${APP_PORT:-7575}"

# Auto-detect application directory
DEFAULT_APP_DIR="/home/ubuntu/ozanglive"
if [[ ! -d "$DEFAULT_APP_DIR" ]]; then
    # Try to find ozanglive directory
    if [[ -d "$HOME/ozanglive" ]]; then
        DEFAULT_APP_DIR="$HOME/ozanglive"
    elif [[ -d "/opt/ozanglive" ]]; then
        DEFAULT_APP_DIR="/opt/ozanglive"
    elif [[ -d "/var/www/ozanglive" ]]; then
        DEFAULT_APP_DIR="/var/www/ozanglive"
    fi
fi

echo
echo "Mencari folder aplikasi MonsterLive..."
if [[ -d "$DEFAULT_APP_DIR" ]]; then
    ok "Folder ditemukan: $DEFAULT_APP_DIR"
else
    warn "Folder default tidak ditemukan: $DEFAULT_APP_DIR"
fi

read -rp "Folder aplikasi [$DEFAULT_APP_DIR]: " APP_DIR
APP_DIR="${APP_DIR:-$DEFAULT_APP_DIR}"

# Expand ~ to home directory if present
APP_DIR="${APP_DIR/#\~/$HOME}"

read -rp "Nama aplikasi PM2 [ozanglive]: " PM2_APP
PM2_APP="${PM2_APP:-ozanglive}"

[[ "$APP_PORT" =~ ^[0-9]+$ ]] || die "Port harus berupa angka."
[[ -n "$PM2_APP" ]] || die "Nama aplikasi PM2 wajib diisi."

# Check if app directory exists, give helpful error if not
if [[ ! -d "$APP_DIR" ]]; then
    echo
    warn "Folder aplikasi tidak ditemukan: $APP_DIR"
    echo
    echo "Kemungkinan penyebab:"
    echo "  1. Aplikasi MonsterLive belum diinstall"
    echo "  2. Path folder salah"
    echo
    echo "Solusi:"
    echo "  - Install aplikasi dulu dengan: bash install.sh"
    echo "  - Atau masukkan path folder yang benar"
    echo
    read -rp "Apakah Anda ingin mencoba path folder lain? [Y/n]: " TRY_AGAIN
    TRY_AGAIN="${TRY_AGAIN:-Y}"
    
    if [[ "$TRY_AGAIN" =~ ^[Yy]$ ]]; then
        read -rp "Masukkan path folder aplikasi: " APP_DIR
        APP_DIR="${APP_DIR/#\~/$HOME}"
        
        if [[ ! -d "$APP_DIR" ]]; then
            die "Folder tidak ditemukan: $APP_DIR. Install aplikasi terlebih dahulu."
        fi
    else
        die "Installer dibatalkan. Install aplikasi MonsterLive terlebih dahulu dengan: bash install.sh"
    fi
fi

ok "Folder aplikasi ditemukan: $APP_DIR"

if [[ "$EUID" -eq 0 ]]; then
    SUDO=""
    RUN_USER="${SUDO_USER:-root}"
else
    SUDO="sudo"
    RUN_USER="$(id -un)"
fi

USER_HOME="$(eval echo "~$RUN_USER")"
CF_DIR="$USER_HOME/.cloudflared"
CONFIG_FILE="$CF_DIR/config.yml"
ENV_FILE="$APP_DIR/.env"

echo
echo "--------------------------------------------------------------"
echo " DEPLOYMENT"
echo "--------------------------------------------------------------"
echo "Tunnel : $TUNNEL_NAME"
echo "Domain : https://$PUBLIC_HOST"
echo "Origin : http://127.0.0.1:$APP_PORT"
echo "App    : $APP_DIR"
echo "PM2    : $PM2_APP"
echo "--------------------------------------------------------------"
echo

# ---------------- 1. CLOUDFLARED ----------------

echo "1/8 - Memeriksa cloudflared..."

if ! command -v cloudflared >/dev/null 2>&1; then
    echo "Installing cloudflared..."
    $SUDO mkdir -p --mode=0755 /usr/share/keyrings

    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
      | $SUDO tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
      | $SUDO tee /etc/apt/sources.list.d/cloudflared.list >/dev/null

    $SUDO apt-get update
    $SUDO apt-get install -y cloudflared
fi

ok "cloudflared tersedia."

mkdir -p "$CF_DIR"
chmod 700 "$CF_DIR"

# ---------------- 2. CLOUDFLARE LOGIN ----------------

echo
echo "2/8 - Login Cloudflare..."

if [[ ! -s "$CF_DIR/cert.pem" ]]; then
    echo
    echo "Browser akan meminta login Cloudflare."
    echo
    echo "PENTING:"
    echo "Login menggunakan Cloudflare account yang mempunyai akses"
    echo "ke zone/domain: $PUBLIC_HOST"
    echo
    echo "Jika domain belum ditambahkan ke Cloudflare, tambahkan"
    echo "terlebih dahulu dan pastikan nameserver/domain sudah aktif."
    echo

    cloudflared tunnel login

    [[ -s "$CF_DIR/cert.pem" ]] || die "Login gagal: cert.pem tidak ditemukan."
else
    echo "✅ cert.pem Cloudflare sudah tersedia."
    echo "Installer akan memakai login Cloudflare yang sudah ada."
    echo "Jika ini VPS baru untuk account Cloudflare yang BERBEDA,"
    echo "hapus cert.pem lalu jalankan cloudflared tunnel login lagi."
fi

ok "Cloudflare login tersedia."

# ---------------- 3. UNIQUE TUNNEL ----------------

echo
echo "3/8 - Membuat tunnel baru..."

TUNNEL_LIST_OUTPUT=$(cloudflared tunnel list 2>/dev/null || echo "")
if echo "$TUNNEL_LIST_OUTPUT" | awk 'NR>1 {print $2}' | grep -Fxq "$TUNNEL_NAME" 2>/dev/null; then
    die "Tunnel '$TUNNEL_NAME' sudah ada. Gunakan nama unik."
fi

CREATE_OUTPUT="$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1 || echo "")"
echo "$CREATE_OUTPUT"

TUNNEL_ID="$(
    printf '%s\n' "$CREATE_OUTPUT" |
    grep -Eo '[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}' |
    tail -n1 2>/dev/null || echo ""
)"

if [[ -z "$TUNNEL_ID" ]]; then
    TUNNEL_ID="$(
        cloudflared tunnel list 2>/dev/null |
        awk -v n="$TUNNEL_NAME" '$2==n {print $1; exit}' || echo ""
    )"
fi

[[ -n "$TUNNEL_ID" ]] || die "Tunnel UUID tidak ditemukan."

CRED_FILE="$CF_DIR/$TUNNEL_ID.json"

[[ -s "$CRED_FILE" ]] || die "Credentials JSON tidak ditemukan: $CRED_FILE"

ok "Tunnel baru dibuat."
echo "UUID: $TUNNEL_ID"
echo "Credentials JSON tersimpan di ~/.cloudflared/"

# ---------------- 4. CONFIG + DNS ----------------

echo
echo "4/8 - Membuat config.yml..."

cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $PUBLIC_HOST
    service: http://127.0.0.1:$APP_PORT

  - service: http_status:404
EOF

chmod 600 "$CONFIG_FILE"

# Validate config without pipefail causing issues
if cloudflared --config "$CONFIG_FILE" tunnel ingress validate 2>/dev/null; then
    ok "config.yml valid."
else
    warn "Tidak bisa memvalidasi config.yml (mungkin versi cloudflared lama)"
    ok "config.yml dibuat."
fi

echo
echo "Membuat DNS route..."
if [[ "$DOMAIN_READY" =~ ^[Nn]$ ]]; then
    echo "⚠️ Domain belum ditambahkan ke Cloudflare."
    echo "Installer tetap mencoba membuat route setelah login."
    echo "Jika route gagal, tambahkan domain/zone ke Cloudflare terlebih dahulu,"
    echo "lalu jalankan ulang installer."
    echo
    echo "Anda bisa skip DNS route sekarang dan setup manual nanti dengan:"
    echo "cloudflared tunnel route dns $TUNNEL_NAME $PUBLIC_HOST"
    echo
    read -rp "Tetap lanjutkan setup DNS route sekarang? [Y/n]: " CONTINUE_DNS
    CONTINUE_DNS="${CONTINUE_DNS:-Y}"
    
    if [[ "$CONTINUE_DNS" =~ ^[Nn]$ ]]; then
        warn "DNS route dilewati. Setup manual nanti dengan perintah di atas."
    else
        DNS_OUTPUT="$(cloudflared tunnel route dns "$TUNNEL_NAME" "$PUBLIC_HOST" 2>&1 || true)"
        echo "$DNS_OUTPUT"
        
        if printf '%s\n' "$DNS_OUTPUT" | grep -qiE 'already configured|created|route|success'; then
            ok "DNS route diproses."
        else
            warn "DNS route gagal atau belum dapat dipastikan."
            warn "Setup manual nanti dengan: cloudflared tunnel route dns $TUNNEL_NAME $PUBLIC_HOST"
        fi
    fi
else
    DNS_OUTPUT="$(cloudflared tunnel route dns "$TUNNEL_NAME" "$PUBLIC_HOST" 2>&1 || true)"
    echo "$DNS_OUTPUT"
    
    if printf '%s\n' "$DNS_OUTPUT" | grep -qiE 'already configured|created|route|success'; then
        ok "DNS route diproses."
    else
        warn "DNS route belum dapat dipastikan."
        warn "Kemungkinan zone belum ada di Cloudflare atau permission tidak cukup."
        warn "Setup manual nanti dengan: cloudflared tunnel route dns $TUNNEL_NAME $PUBLIC_HOST"
    fi
fi

# ---------------- 5. ENV ----------------

echo
echo "5/8 - Mengatur .env..."

if [[ -f "$ENV_FILE" ]]; then
    cp -a "$ENV_FILE" "$ENV_FILE.backup-$(date +%Y%m%d-%H%M%S)"

    if grep -qE '^PORT=' "$ENV_FILE"; then
        sed -i "s|^PORT=.*|PORT=$APP_PORT|" "$ENV_FILE"
    else
        printf '\nPORT=%s\n' "$APP_PORT" >> "$ENV_FILE"
    fi

    if grep -qE '^BASE_URL=' "$ENV_FILE"; then
        sed -i "s|^BASE_URL=.*|BASE_URL=https://$PUBLIC_HOST|" "$ENV_FILE"
    else
        printf 'BASE_URL=https://%s\n' "$PUBLIC_HOST" >> "$ENV_FILE"
    fi
else
    cat > "$ENV_FILE" <<EOF
PORT=$APP_PORT
BASE_URL=https://$PUBLIC_HOST
EOF
    chmod 600 "$ENV_FILE"
    warn ".env belum ada; dibuat."
fi

echo
echo "Konfigurasi non-secret:"
grep -E '^(PORT|BASE_URL)=' "$ENV_FILE" || true
ok ".env siap."

# ---------------- 6. LOCAL TEST ----------------

echo
echo "6/8 - Mengecek aplikasi lokal..."

if curl -fsS --max-time 10 "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
    ok "Aplikasi merespons di port $APP_PORT."
else
    warn "Aplikasi belum merespons di port $APP_PORT."
    warn "Pastikan PM2/Node aplikasi sudah running."
fi

# ---------------- 7. SYSTEMD ----------------

echo
echo "7/8 - Memasang cloudflared sebagai service..."

# One cloudflared service per VPS. Remove an old service so its
# token/config cannot conflict with this deployment.
if systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared\.service'; then
    echo "Service cloudflared lama ditemukan."
    echo "Menghapus service lama agar tidak memakai token/config yang salah..."
    $SUDO systemctl stop cloudflared >/dev/null 2>&1 || true
    $SUDO cloudflared service uninstall >/dev/null 2>&1 || true
    $SUDO systemctl daemon-reload
fi

$SUDO cloudflared --config "$CONFIG_FILE" service install
$SUDO systemctl daemon-reload
$SUDO systemctl enable cloudflared
$SUDO systemctl restart cloudflared

sleep 5

echo
$SUDO systemctl is-enabled cloudflared \
    && ok "cloudflared enabled." \
    || warn "cloudflared belum enabled."

$SUDO systemctl is-active cloudflared \
    && ok "cloudflared active/running." \
    || warn "cloudflared belum running."

# ---------------- 8. PM2 + FINAL ----------------

echo
echo "8/8 - Finalisasi aplikasi..."

if command -v pm2 >/dev/null 2>&1; then
    (
        cd "$APP_DIR"

        if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
            # IMPORTANT:
            # .env alone does not guarantee that an already-running Node/PM2
            # process receives the new BASE_URL. --update-env is required.
            pm2 restart "$PM2_APP" --update-env
            pm2 save

            sleep 3

            PM2_PID="$(pm2 pid "$PM2_APP" | head -n1 | tr -d '[:space:]')"

            if [[ -n "$PM2_PID" && "$PM2_PID" != "0" ]]; then
                RUNNING_BASE_URL="$(
                    sudo tr '\0' '\n' < "/proc/$PM2_PID/environ" 2>/dev/null |
                    grep '^BASE_URL=' || true
                )"

                echo ""
                echo "BASE_URL proses PM2:"
                echo "${RUNNING_BASE_URL:-TIDAK DITEMUKAN}"

                if [[ "$RUNNING_BASE_URL" == "BASE_URL=https://$PUBLIC_HOST" ]]; then
                    ok "BASE_URL PM2 sudah sinkron dengan domain baru."
                else
                    warn "BASE_URL PM2 belum cocok dengan domain baru."
                    warn "Periksa dengan: pm2 env $PM2_APP"
                fi
            fi
        else
            warn "PM2 app '$PM2_APP' tidak ditemukan."
            warn "Aplikasi sudah dikonfigurasi, tetapi PM2 tidak direstart."
            warn "Periksa dengan: pm2 list"
        fi
    )
    ok "PM2 diproses."
else
    warn "PM2 tidak ditemukan; tidak ada restart PM2."
fi

sleep 3

echo
echo "=============================================================="
echo " HASIL AKHIR"
echo "=============================================================="

echo
echo "Cloudflared:"
$SUDO systemctl status cloudflared --no-pager -l || true

echo
echo "Tunnel:"
cloudflared tunnel info "$TUNNEL_NAME" || true

echo
echo "Local origin:"
if curl -fsS --max-time 10 "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
    ok "http://127.0.0.1:$APP_PORT OK"
else
    warn "Origin belum OK. Pastikan aplikasi berjalan di port $APP_PORT"
fi

echo
echo "Public HTTPS:"
if curl -fsSIL --max-time 25 "https://$PUBLIC_HOST/" >/dev/null 2>&1; then
    ok "https://$PUBLIC_HOST OK"
else
    warn "HTTPS belum OK."
    echo "Ini NORMAL jika:"
    echo "  1. Domain baru saja di-route (tunggu 10-60 detik)"
    echo "  2. DNS route dilewati (setup manual diperlukan)"
    echo
    echo "Untuk setup manual DNS route:"
    echo "  cloudflared tunnel route dns $TUNNEL_NAME $PUBLIC_HOST"
    echo
    echo "Test manual setelah beberapa saat:"
    echo "  curl -I https://$PUBLIC_HOST"
fi

echo
echo "=============================================================="
echo " DEPLOYMENT SELESAI"
echo "=============================================================="
echo
echo "Domain : https://$PUBLIC_HOST"
echo "Tunnel : $TUNNEL_NAME"
echo "UUID   : $TUNNEL_ID"
echo "Origin : http://127.0.0.1:$APP_PORT"
echo
echo "Config : $CONFIG_FILE"
echo "JSON   : $CRED_FILE"
echo
echo "Google OAuth callback untuk domain ini:"
echo "https://$PUBLIC_HOST/api/youtube/oauth/callback"
echo
echo "PENTING UNTUK YOUTUBE / GOOGLE OAUTH:"
echo "Authorized Redirect URI harus menggunakan DOMAIN INI,"
echo "bukan domain VPS/tunnel lama."
echo
echo "Jika domain user berbeda, contoh:"
echo "  https://live2.example.com/api/youtube/oauth/callback"
echo
if [[ "$SAME_BASE" =~ ^[Yy]$ ]]; then
    echo "Mode domain: BASE DOMAIN SAMA"
    echo "Base domain : $BASE_DOMAIN"
    echo "Subdomain   : $PUBLIC_HOST"
else
    echo "Mode domain: DOMAIN USER BERBEDA"
    echo "Domain      : $PUBLIC_HOST"
fi
echo
echo "=============================================================="
echo " TROUBLESHOOTING"
echo "=============================================================="
echo
echo "Jika HTTPS belum berfungsi:"
echo
echo "1. Cek status cloudflared:"
echo "   sudo systemctl status cloudflared"
echo
echo "2. Cek log cloudflared:"
echo "   sudo journalctl -u cloudflared -n 50 --no-pager"
echo
echo "3. Cek tunnel info:"
echo "   cloudflared tunnel info $TUNNEL_NAME"
echo
echo "4. Setup DNS route manual (jika dilewati):"
echo "   cloudflared tunnel route dns $TUNNEL_NAME $PUBLIC_HOST"
echo
echo "5. Test origin local:"
echo "   curl http://127.0.0.1:$APP_PORT"
echo
echo "6. Test public HTTPS:"
echo "   curl -I https://$PUBLIC_HOST"
echo
echo "7. Restart cloudflared jika perlu:"
echo "   sudo systemctl restart cloudflared"
echo
echo "8. Cek PM2 app:"
echo "   pm2 list"
echo "   pm2 logs $PM2_APP --lines 50"
echo
echo "=============================================================="
echo
echo "JANGAN membagikan:"
echo "- ~/.cloudflared/cert.pem"
echo "- ~/.cloudflared/$TUNNEL_ID.json"
echo "- $ENV_FILE"
echo "- OAuth Client Secret"
echo
echo "=============================================================="
