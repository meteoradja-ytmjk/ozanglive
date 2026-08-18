# ✅ Update: Installer V3 - Simplified & Production Ready

## 🎯 Status: SYNCED FROM GITHUB

File `ozanglive-universal-multidomain-quick-installer-v3.sh` sudah di-update dengan versi yang **TERBUKTI WORK** di production.

## 📦 Perubahan Utama

### Before (Complex Version):
- 600+ lines code
- Banyak validasi strict yang bisa menyebabkan hang
- Complex error handling
- Multiple scenarios dan options
- pipefail mode issues

### After (Simplified Version):
- ~350 lines code (lebih pendek 45%)
- Fokus pada happy path
- Simple error messages
- Single flow yang clear
- No more hanging issues

## 🚀 Flow Baru (Simplified)

```
1. Check root/user           → Must run as ubuntu user
2. Check application          → App must exist
3. Ask domain                 → Single domain input
4. Backup .env                → Auto backup
5. Update .env                → Update BASE_URL & PORT
6. Check PM2                  → App must exist in PM2
7. Sync PM2 env               → Restart with --update-env
8. Save PM2                   → pm2 save
9. Cloudflared setup          → Manual token input
10. Enable & start service    → systemctl
11. Final validation          → Check everything
```

## 📋 Key Simplifications

### 1. ✅ Single Domain Input
**Before:**
```bash
# Complex dengan Y/N untuk base domain vs custom domain
# Multiple input fields
# Validation di banyak tempat
```

**After:**
```bash
# Single input
read -r -p "Masukkan DOMAIN yang akan digunakan: " DOMAIN

# Simple validation
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%/}"
```

### 2. ✅ Hardcoded Defaults
**Before:**
```bash
# User input untuk semua
read -rp "Port aplikasi [7575]: " APP_PORT
read -rp "Folder aplikasi [/home/ubuntu/ozanglive]: " APP_DIR
read -rp "Nama aplikasi PM2 [ozanglive]: " PM2_APP
```

**After:**
```bash
# Hardcoded untuk simplicity
APP_DIR="/home/ubuntu/ozanglive"
APP_NAME="ozanglive"
APP_PORT="7575"
```

### 3. ✅ Manual Tunnel Token
**Before:**
```bash
# Automatic tunnel creation via cloudflared tunnel create
# Browser login required
# Complex cert.pem handling
# DNS route automation attempts
```

**After:**
```bash
# User paste token dari Cloudflare Dashboard
read -r -s -p "Paste Tunnel Token: " TUNNEL_TOKEN

# Simple service install
sudo cloudflared service install "$TUNNEL_TOKEN"
```

### 4. ✅ No Auto DNS Route
**Before:**
```bash
# Trying to auto-route DNS
# Complex fallback jika gagal
# Skip options
# Manual command instructions
```

**After:**
```bash
# User setup DNS route manual di Cloudflare Dashboard
# Installer fokus pada app & tunnel saja
# Simpler dan lebih reliable
```

### 5. ✅ Clear Error Messages
**Before:**
```bash
[[ -d "$APP_DIR" ]] || die "Folder aplikasi tidak ditemukan: $APP_DIR"
# Multiple recovery options
# Try again prompts
```

**After:**
```bash
if [[ ! -d "$APP_DIR" ]]; then
    echo ""
    echo "ERROR: Folder aplikasi tidak ditemukan:"
    echo "$APP_DIR"
    echo ""
    echo "Pastikan aplikasi sudah di-install terlebih dahulu."
    exit 1
fi
```

## 🎓 Cara Pakai (Simplified)

### Step 1: Install Aplikasi
```bash
bash install.sh
```

### Step 2: Buat Tunnel di Cloudflare Dashboard
1. Login ke Cloudflare Dashboard
2. Pilih domain Anda
3. Networking → Tunnels → Create Tunnel
4. Beri nama tunnel (contoh: `live-user-01`)
5. Pilih environment: **Cloudflared**
6. Pilih OS: **Linux**
7. **COPY TUNNEL TOKEN** (jangan install via command di dashboard)
8. Di Public Hostname:
   - **Subdomain**: live1 (atau sesuai keinginan)
   - **Domain**: monsterlive.my.id (atau domain Anda)
   - **Type**: HTTP
   - **URL**: localhost:7575
   - **Save**

### Step 3: Jalankan Installer
```bash
cd ~/ozanglive
bash ozanglive-universal-multidomain-quick-installer-v3.sh
```

**Input yang diminta:**
1. **Domain**: live1.monsterlive.my.id
2. **Confirm**: Y
3. **Tunnel Token**: (paste token dari step 2)

**Done!** Aplikasi ready di `https://live1.monsterlive.my.id`

## ✅ Kenapa Versi Ini Lebih Baik?

### 1. **Lebih Reliable**
- No more hanging issues
- No more pipefail problems
- Clear error messages
- Predictable flow

### 2. **Lebih Mudah Debug**
- Simpler code
- Clear step numbers [1/9], [2/9], etc.
- Easy to find where it fails

### 3. **Lebih Cepat**
- No browser popup untuk login
- No waiting untuk DNS propagation check
- Straight to the point

### 4. **Lebih Flexible**
- User control DNS di dashboard
- User control tunnel creation
- No assumption tentang domain structure

### 5. **Production Proven**
- Sudah tested di production
- Terbukti work tanpa masalah
- User-friendly flow

## 📊 Comparison

| Aspect | V3 Complex | V3 Simplified |
|--------|------------|---------------|
| **Lines of Code** | 600+ | ~350 |
| **User Inputs** | 6-8 inputs | 2 inputs |
| **Browser Required** | Yes (login) | No |
| **DNS Automation** | Attempted | Manual |
| **Error Recovery** | Complex | Clear exit |
| **Tunnel Creation** | Auto | Manual (token) |
| **Hanging Issues** | Yes | No |
| **Production Ready** | ⚠️ | ✅ |

## 🚀 One-Liner Install

```bash
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v3.sh -o domain-setup.sh
bash domain-setup.sh
```

## 💡 Tips

### Jika Tunnel Sudah Ada:
```bash
# Installer akan tanya
Apakah ingin mengganti tunnel/service yang ada? [y/N]:

# Pilih N jika ingin keep tunnel lama
# Pilih Y jika ingin ganti dengan tunnel baru
```

### Check Status:
```bash
# Cloudflared
sudo systemctl status cloudflared

# PM2
pm2 status

# Local app
curl http://127.0.0.1:7575

# Public domain
curl -I https://your-domain.com
```

### Troubleshooting:
```bash
# Cloudflared logs
sudo journalctl -u cloudflared -f

# PM2 logs
pm2 logs ozanglive

# Check PM2 environment
pm2 env ozanglive | grep BASE_URL
```

## 🎯 Best Practices

1. **Install aplikasi dulu** dengan `bash install.sh`
2. **Buat tunnel** di Cloudflare Dashboard dulu
3. **Setup public hostname** di dashboard (subdomain + domain)
4. **Copy token** sebelum jalankan installer
5. **Paste token** saat installer minta
6. **Verify** dengan curl setelah selesai

## ✅ Verification

Setelah installer selesai, cek:

```bash
# 1. PM2 running?
pm2 status
# Should show "ozanglive" online

# 2. BASE_URL correct?
pm2 env ozanglive | grep BASE_URL
# Should show: BASE_URL=https://your-domain.com

# 3. Local app responding?
curl http://127.0.0.1:7575
# Should return HTML

# 4. Cloudflared running?
sudo systemctl status cloudflared
# Should be active (running)

# 5. Public HTTPS working?
curl -I https://your-domain.com
# Should return HTTP 200
```

## 📞 Support

Jika ada masalah:
1. Cek section mana yang gagal (lihat [X/9])
2. Baca error message dengan teliti
3. Follow instruksi troubleshooting di atas
4. Hubungi support dengan:
   - Screenshot error
   - Output dari: `pm2 status`
   - Output dari: `sudo systemctl status cloudflared`

**Developer**: WhatsApp 089621453431

---

**Version**: V3 Simplified
**Status**: ✅ Production Ready & Tested
**Date**: 2024
**File**: ozanglive-universal-multidomain-quick-installer-v3.sh
