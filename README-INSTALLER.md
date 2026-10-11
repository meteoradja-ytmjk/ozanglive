# 📦 MonsterLive - Panduan Instalasi

## 🚀 Quick Start

### Step 1: Install Aplikasi MonsterLive

```bash
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/install.sh -o install.sh
chmod +x install.sh
bash install.sh
```

**Apa yang dilakukan:**
- ✅ Install Node.js 22.x
- ✅ Install FFmpeg
- ✅ Install PM2 Process Manager
- ✅ Clone aplikasi MonsterLive
- ✅ Install dependencies
- ✅ Setup environment
- ✅ Start aplikasi via PM2

**Setelah selesai:**
Aplikasi berjalan di: `http://YOUR_IP:7575`

---

### Step 2: Setup Domain (Opsional - Direkomendasikan)

Setelah instalasi aplikasi selesai, installer akan bertanya:

```
🌐 SETUP DOMAIN DENGAN CLOUDFLARE

Apakah Anda ingin setup domain sekarang? [Y/n]:
```

**Pilih Y (Recommended):**
- Installer akan otomatis melanjutkan ke setup domain
- Aplikasi akan bisa diakses via HTTPS dengan domain kustom
- Cloudflare Tunnel dikonfigurasi otomatis

**Pilih N (Skip):**
- Aplikasi tetap berjalan di `http://YOUR_IP:7575`
- Anda akan diberikan **COMMAND YANG BISA DI-COPY** untuk setup domain nanti
- Command tersebut bisa dijalankan kapan saja

---

## 📋 Setup Domain Manual (Jika Dilewati)

Jika Anda skip setup domain saat instalasi, copy dan paste command ini:

```bash
cd ~/ozanglive && bash ozanglive-universal-multidomain-quick-installer-v3.sh
```

**Atau download manual:**

```bash
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v3.sh -o ~/domain-setup.sh
chmod +x ~/domain-setup.sh
bash ~/domain-setup.sh
```

---

## 🌐 Apa yang Dilakukan Domain Installer V3?

### Pre-Check:
- ✅ Cek apakah aplikasi MonsterLive sudah running
- ✅ Validasi PM2 dan port aplikasi

### Proses Setup:
1. **Install Cloudflared** (Cloudflare Tunnel client)
2. **Login Cloudflare** (browser akan terbuka untuk autentikasi)
3. **Buat Tunnel Unik** (setiap VPS dapat tunnel sendiri)
4. **Konfigurasi Domain**:
   - Input domain yang Anda inginkan
   - Bisa base domain yang sama: `subdomain.monsterlive.my.id`
   - Bisa domain berbeda: `stream.yourdomain.com`
5. **Setup DNS Route** (atau skip, setup manual nanti)
6. **Update Environment** (.env dengan BASE_URL baru)
7. **Install Systemd Service** (cloudflared auto-start on reboot)
8. **Restart PM2** dengan environment baru
9. **Test HTTPS** otomatis

### Jika DNS Route Gagal:
- ✅ Installer **TETAP LANJUT** (tidak stuck seperti versi lama)
- ✅ Anda akan diberikan command untuk setup DNS manual
- ✅ Semua komponen lain tetap dikonfigurasi

**Setup DNS Manual:**
```bash
cloudflared tunnel route dns TUNNEL_NAME YOUR_DOMAIN
```

---

## 🎯 Keuntungan Installer Terpisah

### ✅ Fleksibilitas
- Install aplikasi dulu, setup domain nanti
- Tidak perlu re-install aplikasi jika domain gagal
- Bisa test aplikasi dulu sebelum setup domain

### ✅ No More Stuck
- Jika domain belum di Cloudflare → Bisa skip DNS, setup manual nanti
- Jika DNS route gagal → Installer tetap lanjut
- Semua error ada solusi dan instruksi jelas

### ✅ Easy Command
- Satu command untuk setup domain
- Bisa di-copy dari output installer
- Bisa dijalankan ulang tanpa masalah

---

## 📖 Dokumentasi Lengkap

Setelah instalasi, baca dokumentasi di:

```bash
# Cara setup domain
cat ~/ozanglive/CARA-SETUP-DOMAIN.md

# Cara instal ulang
cat ~/ozanglive/CARA-INSTAL-ULANG-V3.md

# Cara deploy multi-domain
cat ~/ozanglive/CARA-DEPLOY-MULTIDOMAIN-V3.md
```

---

## 🔧 Troubleshooting

### Check Status Aplikasi

```bash
# Quick check dengan script otomatis
cd ~/ozanglive
bash check-installer-status.sh
```

Script ini akan mengecek:
- ✅ Status cloudflared
- ✅ Status PM2
- ✅ Status tunnel
- ✅ Test local origin
- ✅ Test public HTTPS
- ✅ Recent logs

### Manual Check

```bash
# Status PM2
pm2 status
pm2 logs ozanglive

# Status Cloudflared
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 50

# Test aplikasi
curl http://127.0.0.1:7575
curl -I https://YOUR_DOMAIN
```

---

## 🎓 Skenario Umum

### Skenario 1: Fresh Install (Aplikasi + Domain Langsung)
```bash
# Step 1: Install aplikasi
bash install.sh

# Saat ditanya setup domain → Jawab Y
# Ikuti instruksi domain installer
# Selesai! Aplikasi berjalan di https://YOUR_DOMAIN
```

### Skenario 2: Install Aplikasi Dulu, Domain Nanti
```bash
# Step 1: Install aplikasi
bash install.sh

# Saat ditanya setup domain → Jawab N
# Aplikasi berjalan di http://YOUR_IP:7575

# Step 2 (di kemudian hari): Setup domain
cd ~/ozanglive && bash ozanglive-universal-multidomain-quick-installer-v3.sh
```

### Skenario 3: Domain Belum di Cloudflare
```bash
# Step 1: Install aplikasi
bash install.sh

# Step 2: Coba setup domain (jawab Y)
# Saat installer tanya "Domain sudah di Cloudflare?" → Jawab N
# Saat installer tanya "Skip DNS route?" → Jawab Y (skip)
# Installer akan selesai dengan instruksi setup DNS manual

# Step 3: Tambahkan domain ke Cloudflare
# (via Cloudflare dashboard)

# Step 4: Setup DNS manual
cloudflared tunnel route dns YOUR_TUNNEL YOUR_DOMAIN

# Step 5: Test
curl -I https://YOUR_DOMAIN
```

### Skenario 4: Re-install / Update Aplikasi
```bash
# Update aplikasi (mode update - data aman)
bash install.sh --update

# Fresh install (hapus semua, backup otomatis)
bash install.sh --fresh

# Cloudflared tidak perlu di-setup ulang
# Domain masih berfungsi selama tunnel tidak dihapus
```

---

## 🔄 Update Installer

### Update Installer Aplikasi
```bash
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/install.sh -o install.sh
chmod +x install.sh
bash install.sh --update
```

### Update Domain Installer V3
```bash
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v3.sh -o ~/ozanglive/ozanglive-universal-multidomain-quick-installer-v3.sh
chmod +x ~/ozanglive/ozanglive-universal-multidomain-quick-installer-v3.sh
```

---

## 🆘 Support

### Jika Aplikasi Tidak Running
```bash
# Check PM2
pm2 list
pm2 logs ozanglive --lines 100

# Restart PM2
pm2 restart ozanglive --update-env
pm2 save

# Check port
curl http://127.0.0.1:7575
```

### Jika Domain Tidak Berfungsi
```bash
# Check status
bash ~/ozanglive/check-installer-status.sh

# Check cloudflared
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 50

# Restart cloudflared
sudo systemctl restart cloudflared

# Test
sleep 30
curl -I https://YOUR_DOMAIN
```

### Jika DNS Route Gagal
```bash
# List tunnel
cloudflared tunnel list

# Setup DNS manual
cloudflared tunnel route dns TUNNEL_NAME YOUR_DOMAIN

# Verify
cloudflared tunnel info TUNNEL_NAME
```

---

## 💡 Tips

### Auto-Start on Reboot
PM2 dan Cloudflared sudah dikonfigurasi untuk auto-start.

Verifikasi:
```bash
# PM2
pm2 startup
pm2 save

# Cloudflared
sudo systemctl is-enabled cloudflared
```

### Backup Manual
```bash
# Backup otomatis dibuat di: ~/ozanglive-backups/
ls -lah ~/ozanglive-backups/

# Restore backup
cp -a ~/ozanglive-backups/TIMESTAMP/db ~/ozanglive/
cp -a ~/ozanglive-backups/TIMESTAMP/.env ~/ozanglive/
pm2 restart ozanglive
```

### Multiple Domains (Advanced)
Satu aplikasi bisa diakses via multiple domains:

```bash
# Setup tunnel pertama
bash ozanglive-universal-multidomain-quick-installer-v3.sh
# Input: live1.example.com

# Setup tunnel kedua (di VPS yang sama)
cloudflared tunnel create tunnel-2
# Edit config.yml untuk hostname kedua
# Route domain kedua
cloudflared tunnel route dns tunnel-2 live2.example.com
```

---

## 📞 Contact

Jika ada masalah:
1. Jalankan: `bash ~/ozanglive/check-installer-status.sh`
2. Copy output lengkap
3. Hubungi developer dengan output tersebut

Developer: **WhatsApp 089621453431**

---

**Status**: ✅ Dokumentasi lengkap untuk installer terpisah
**Version**: V3 (2024)
