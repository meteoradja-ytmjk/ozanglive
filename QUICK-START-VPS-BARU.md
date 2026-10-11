# 🚀 Quick Start - VPS Baru dengan Installer V3 Simplified

## 📋 Prerequisites

- VPS baru (Ubuntu 20.04/22.04)
- Domain sudah ditambahkan ke Cloudflare
- Akses SSH ke VPS

## ⚡ Step-by-Step (Super Cepat)

### 1️⃣ Install Aplikasi MonsterLive

SSH ke VPS baru:
```bash
ssh ubuntu@YOUR_VPS_IP
```

Jalankan installer aplikasi:
```bash
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/install.sh -o install.sh
chmod +x install.sh
bash install.sh
```

**Input yang diminta:**
- Password instalasi: `1988`
- Saat ditanya "Apakah Anda ingin setup domain sekarang? [Y/n]": Ketik **N** (kita akan setup manual)

**Tunggu sampai selesai**. Aplikasi akan berjalan di `http://YOUR_VPS_IP:7575`

---

### 2️⃣ Buat Cloudflare Tunnel

Buka browser, login ke Cloudflare Dashboard:

1. **Pilih Domain** yang akan digunakan
2. **Klik**: Networking → Tunnels
3. **Klik**: Create Tunnel
4. **Nama Tunnel**: `live-user-01` (atau nama unik lainnya)
5. **Klik**: Next
6. **Choose Environment**: Pilih **Cloudflared**
7. **Choose your OS**: Pilih **Linux**
8. **COPY TUNNEL TOKEN** (string panjang yang dimulai dengan `eyJ...`)
   - ⚠️ JANGAN jalankan command di dashboard
   - Cukup COPY token saja
9. **Klik**: Next
10. **Setup Public Hostname**:
    - **Subdomain**: `live1` (atau sesuai keinginan)
    - **Domain**: `monsterlive.my.id` (atau domain Anda)
    - **Path**: (kosongkan)
    - **Type**: HTTP
    - **URL**: `localhost:7575`
11. **Klik**: Save tunnel

**SIMPAN TUNNEL TOKEN** untuk step berikutnya!

---

### 3️⃣ Jalankan Domain Installer

Kembali ke SSH VPS:

```bash
cd ~/ozanglive
bash ozanglive-universal-multidomain-quick-installer-v3.sh
```

**Input yang diminta:**

1. **Masukkan DOMAIN yang akan digunakan:**
   ```
   live1.monsterlive.my.id
   ```
   (atau domain yang Anda setup di Cloudflare)

2. **Benar? [Y/n]:**
   ```
   Y
   ```

3. **Paste Tunnel Token:**
   ```
   (paste token yang sudah di-copy dari Cloudflare Dashboard)
   ```
   ⚠️ Token tidak akan terlihat saat paste (normal)

**Tunggu sampai installer selesai!**

---

### 4️⃣ Verifikasi

Setelah installer selesai, cek:

```bash
# 1. PM2 status
pm2 status
# Should show: ozanglive | online

# 2. Cloudflared status
sudo systemctl status cloudflared
# Should show: active (running)

# 3. Test local
curl http://127.0.0.1:7575
# Should return HTML

# 4. Test public HTTPS
curl -I https://live1.monsterlive.my.id
# Should return: HTTP/2 200
```

**Buka browser**: https://live1.monsterlive.my.id

✅ **SELESAI!** Aplikasi sudah running!

---

## 🎯 Quick Commands Reference

### Check Status
```bash
# PM2
pm2 status
pm2 logs ozanglive

# Cloudflared
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 50

# Environment
pm2 env ozanglive | grep BASE_URL
cat ~/ozanglive/.env | grep BASE_URL
```

### Restart Services
```bash
# Restart aplikasi
pm2 restart ozanglive --update-env
pm2 save

# Restart tunnel
sudo systemctl restart cloudflared
```

### Test Connectivity
```bash
# Local
curl http://127.0.0.1:7575

# Public
curl -I https://your-domain.com
```

---

## 🔧 Troubleshooting

### Masalah 1: Aplikasi tidak merespons lokal

```bash
# Check PM2
pm2 logs ozanglive --lines 50

# Restart PM2
cd ~/ozanglive
pm2 restart ozanglive --update-env
pm2 save
```

### Masalah 2: Domain tidak bisa diakses

```bash
# Check cloudflared
sudo systemctl status cloudflared

# Check logs
sudo journalctl -u cloudflared -n 50

# Restart cloudflared
sudo systemctl restart cloudflared
```

### Masalah 3: BASE_URL tidak sync

```bash
# Check current BASE_URL
pm2 env ozanglive | grep BASE_URL

# If wrong, run installer lagi atau manual:
cd ~/ozanglive
export BASE_URL="https://your-domain.com"
pm2 restart ozanglive --update-env
pm2 save
```

### Masalah 4: Tunnel tidak connect

Cek di Cloudflare Dashboard:
- Tunnels → Your Tunnel → Should show "HEALTHY"
- Jika "DOWN", cek `sudo journalctl -u cloudflared -f`

---

## 📝 Complete Example (Copy-Paste Ready)

```bash
# ============================================
# VPS BARU - COMPLETE SETUP
# ============================================

# Step 1: Install aplikasi
cd ~
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/install.sh -o install.sh
chmod +x install.sh
bash install.sh
# Input password: 1988
# Domain setup? N

# Step 2: Buat tunnel di Cloudflare Dashboard
# - Copy tunnel token

# Step 3: Setup domain
cd ~/ozanglive
bash ozanglive-universal-multidomain-quick-installer-v3.sh
# Input domain: live1.monsterlive.my.id
# Input token: (paste)

# Step 4: Verify
pm2 status
sudo systemctl status cloudflared
curl -I https://live1.monsterlive.my.id

# ============================================
# DONE!
# ============================================
```

---

## 🎓 Tips untuk Multiple Domains

Jika Anda ingin setup **banyak domain** di VPS yang sama:

### Option 1: Multiple Subdomains (Recommended)

Gunakan satu tunnel dengan multiple hostnames:

1. Buat satu tunnel di Cloudflare
2. Tambah multiple public hostnames:
   - `live1.monsterlive.my.id` → `localhost:7575`
   - `live2.monsterlive.my.id` → `localhost:7575`
   - `live3.monsterlive.my.id` → `localhost:7575`

Semua subdomain akan route ke aplikasi yang sama.

### Option 2: Separate VPS (Production)

Untuk production dengan banyak user:
- 1 VPS = 1 User = 1 Domain
- Lebih isolated dan secure
- Easier troubleshooting

---

## 🔐 Security Checklist

Setelah setup:

- [ ] Ganti password default VPS
- [ ] Setup firewall (UFW)
  ```bash
  sudo ufw allow ssh
  sudo ufw allow 7575
  sudo ufw enable
  ```
- [ ] JANGAN share tunnel token
- [ ] JANGAN share .env file
- [ ] Setup backup reguler
  ```bash
  # Backup database
  cp -r ~/ozanglive/db ~/backup-db-$(date +%Y%m%d)
  ```

---

## 📞 Support

Jika ada masalah:

1. **Check logs** dulu dengan commands di atas
2. **Screenshot** error message
3. **Copy output** dari:
   - `pm2 status`
   - `sudo systemctl status cloudflared`
   - `pm2 logs ozanglive --lines 50`
4. **Hubungi support** dengan informasi di atas

**Developer**: WhatsApp 089621453431

---

## ✅ Success Indicators

Anda berhasil jika:

- ✅ `pm2 status` → ozanglive **online**
- ✅ `sudo systemctl status cloudflared` → **active (running)**
- ✅ `curl http://127.0.0.1:7575` → return **HTML**
- ✅ `curl -I https://your-domain.com` → return **HTTP/2 200**
- ✅ Browser bisa akses **https://your-domain.com**

**SELAMAT!** 🎉 Aplikasi MonsterLive sudah LIVE!

---

**Version**: V3 Simplified
**Last Updated**: 2024
**Installer**: ozanglive-universal-multidomain-quick-installer-v3.sh
