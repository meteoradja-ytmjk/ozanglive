#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================
# OZANGLIVE - UNIVERSAL MULTI-USER / MULTI-DOMAIN QUICK INSTALLER
# ==============================================================
# IMPORTANT:
# Run this on a NEW VPS AFTER Ozanglive/Streamflow is installed.
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
# 1. The user's domain/zone MUST already be added to Cloudflare.
# 2. The Cloudflare account used by "cloudflared tunnel login"
#    must have permission to manage that zone.
# 3. The application must already exist in APP_DIR.
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
# - change Google Cloud OAuth Console
# - replace an existing ENCRYPTION_KEY
# - copy secrets to the screen
# ==============================================================

trap 'echo; echo "❌ Installer berhenti pada baris $LINENO."; exit 1' ERR

C_RESET='\033[0m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[0;31m'

ok()   { echo -e "${C_GREEN}✅ $*${C_RESET}"; }
warn() { echo -e "${C_YELLOW}⚠️  $*${C_RESET}"; }
die()  { echo -e "${C_RED}❌ $*${C_RESET}"; exit 1; }

echo
echo "=============================================================="
echo " OZANGLIVE - UNIVERSAL MULTI-DOMAIN QUICK INSTALLER"
echo "=============================================================="
echo
echo "Domain tidak harus monsterlive.my.id."
echo "Setiap user boleh memakai domain yang berbeda."
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

read -rp "Folder aplikasi [/home/ubuntu/ozanglive]: " APP_DIR
APP_DIR="${APP_DIR:-/home/ubuntu/ozanglive}"

[[ "$APP_PORT" =~ ^[0-9]+$ ]] || die "Port harus berupa angka."
[[ -d "$APP_DIR" ]] || die "Folder aplikasi tidak ditemukan: $APP_DIR"

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

if cloudflared tunnel list 2>/dev/null | awk 'NR>1 {print $2}' | grep -Fxq "$TUNNEL_NAME"; then
    die "Tunnel '$TUNNEL_NAME' sudah ada. Gunakan nama unik."
fi

CREATE_OUTPUT="$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)"
echo "$CREATE_OUTPUT"

TUNNEL_ID="$(
    printf '%s\n' "$CREATE_OUTPUT" |
    grep -Eo '[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}' |
    tail -n1 || true
)"

if [[ -z "$TUNNEL_ID" ]]; then
    TUNNEL_ID="$(
        cloudflared tunnel list 2>/dev/null |
        awk -v n="$TUNNEL_NAME" '$2==n {print $1; exit}'
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

cloudflared --config "$CONFIG_FILE" tunnel ingress validate
ok "config.yml valid."

echo
echo "Membuat DNS route..."
if [[ "$DOMAIN_READY" =~ ^[Nn]$ ]]; then
    echo "⚠️ Domain belum ditambahkan ke Cloudflare."
    echo "Installer tetap mencoba membuat route setelah login."
    echo "Jika route gagal, tambahkan domain/zone ke Cloudflare terlebih dahulu,"
    echo "lalu jalankan ulang installer."
fi

DNS_OUTPUT="$(cloudflared tunnel route dns "$TUNNEL_NAME" "$PUBLIC_HOST" 2>&1 || true)"
echo "$DNS_OUTPUT"

if printf '%s\n' "$DNS_OUTPUT" | grep -qiE 'already configured|created|route|success'; then
    ok "DNS route diproses."
else
    warn "DNS route belum dapat dipastikan."
    warn "Kemungkinan zone belum ada di Cloudflare atau permission tidak cukup."
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

if curl -fsS --max-time 10 "http://127.0.0.1:$APP_PORT/" >/dev/null; then
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
        pm2 restart all || true
        pm2 save || true
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
if curl -fsS --max-time 10 "http://127.0.0.1:$APP_PORT/" >/dev/null; then
    ok "http://127.0.0.1:$APP_PORT OK"
else
    warn "Origin belum OK."
fi

echo
echo "Public HTTPS:"
if curl -fsSIL --max-time 25 "https://$PUBLIC_HOST/" >/dev/null; then
    ok "https://$PUBLIC_HOST OK"
else
    warn "HTTPS belum OK."
    echo "Tunggu 10-30 detik lalu:"
    echo "curl -I https://$PUBLIC_HOST"
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
if [[ "$SAME_BASE" =~ ^[Yy]$ ]]; then
    echo "Mode domain: BASE DOMAIN SAMA"
    echo "Base domain : $BASE_DOMAIN"
    echo "Subdomain   : $PUBLIC_HOST"
else
    echo "Mode domain: DOMAIN USER BERBEDA"
    echo "Domain      : $PUBLIC_HOST"
fi
echo
echo "Log Cloudflare:"
echo "sudo journalctl -u cloudflared -n 50 --no-pager"
echo
echo "JANGAN membagikan:"
echo "- ~/.cloudflared/cert.pem"
echo "- ~/.cloudflared/$TUNNEL_ID.json"
echo "- $ENV_FILE"
echo "- OAuth Client Secret"
echo
echo "=============================================================="
