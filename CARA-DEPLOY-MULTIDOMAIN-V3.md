# 🚀 Cara Deploy Multi-Domain V3 - Step by Step

## 📋 Ringkasan Singkat

Script V3 ini digunakan untuk **deploy Ozanglive ke VPS baru** dengan domain custom setiap pelanggan.

**Contoh Use Case:**
- Pelanggan A: `https://live1.monsterlive.my.id`
- Pelanggan B: `https://live2.monsterlive.my.id`
- Pelanggan C: `https://stream.domainlain.com`

---

## ⚡ Quick Start (Untuk Subdomain Sama)

Jika pelanggan menggunakan subdomain dari domain yang sama (contoh: `*.monsterlive.my.id`):

### Di VPS/Server:

```bash
# 1. Masuk ke folder aplikasi
cd ~/ozanglive

# 2. Pull update terbaru dari GitHub
git pull origin main

# 3. Jalankan installer V3
bash ozanglive-universal-multidomain-quick-installer-v3.sh
```

### Input yang Diminta:

```
Nama tunnel unik: live-user-01
Gunakan base domain yang sama? Y
Base domain: monsterlive.my.id
Subdomain/alias: live1
Domain sudah di Cloudflare? Y
Port aplikasi: 7575
Folder aplikasi: /home/ubuntu/ozanglive
```

**Hasil:**
- Domain: `https://live1.monsterlive.my.id`
- OAuth Redirect: `https://live1.monsterlive.my.id/api/youtube/oauth/callback`

---

## 📖 Panduan Lengkap

### **A. Persiapan Sebelum Deploy**

#### 1. Pastikan Aplikasi Sudah Terinstall

```bash
# Cek apakah folder aplikasi ada
ls -la ~/ozanglive/package.json

# Cek apakah aplikasi berjalan
curl http://localhost:7575

# Atau cek PM2
pm2 list
```

#### 2. Persiapan Domain di Cloudflare

**Option A: Subdomain Sama (Rekomendasi)**
- Domain: `monsterlive.my.id` sudah di Cloudflare
- Akan create subdomain: `live1.monsterlive.my.id`, `live2.monsterlive.my.id`, dst

**Option B: Domain Berbeda**
- Setiap pelanggan punya domain sendiri
- Contoh: `pelanggan1.com`, `pelanggan2.net`
- **Wajib** sudah ditambahkan ke Cloudflare terlebih dahulu

---

### **B. Proses Deployment**

#### Step 1: Login ke VPS

```bash
ssh ubuntu@your-vps-ip
# atau
ssh root@your-vps-ip
```

#### Step 2: Masuk ke Folder Aplikasi

```bash
cd ~/ozanglive
# atau
cd /home/ubuntu/ozanglive
```

#### Step 3: Pull Update dari GitHub

```bash
git pull origin main
```

Pastikan file V3 sudah ada:
```bash
ls -la ozanglive-universal-multidomain-quick-installer-v3.sh
```

#### Step 4: Jalankan Installer V3

```bash
bash ozanglive-universal-multidomain-quick-installer-v3.sh
```

#### Step 5: Input Data

**1. Nama Tunnel Unik:**
```
Nama tunnel unik [live-user-01]: live1
```
💡 Tips: Gunakan nama yang mudah diingat, contoh:
- `live1`, `live2`, `live3`
- `pelanggan-john`
- `stream-user01`

**2. Mode Domain:**
```
Gunakan base domain yang sama? [Y/n]: Y
```
- Ketik `Y` jika subdomain sama (contoh: `*.monsterlive.my.id`)
- Ketik `N` jika domain berbeda (contoh: `pelanggan.com`)

**3a. Jika Mode Base Domain Sama:**
```
Base domain yang digunakan: monsterlive.my.id
Subdomain/alias user: live1
```
Hasil: `https://live1.monsterlive.my.id`

**3b. Jika Mode Domain Berbeda:**
```
Domain publik user: stream.pelanggan.com
```
Hasil: `https://stream.pelanggan.com`

**4. Konfirmasi Domain:**
```
Apakah domain tersebut SUDAH ditambahkan ke Cloudflare? [Y/n]: Y
```
- Ketik `Y` jika domain/zone sudah ada di Cloudflare
- Ketik `N` jika belum (installer tetap lanjut tapi DNS route mungkin gagal)

**5. Port & Folder:**
```
Port aplikasi [7575]: 7575
Folder aplikasi [/home/ubuntu/ozanglive]: /home/ubuntu/ozanglive
```
Biasanya pakai default saja (tekan Enter)

**6. Konfirmasi Final:**
```
Apakah konfigurasi sudah benar? [Y/n]: Y
```

#### Step 6: Login Cloudflare (Jika Pertama Kali)

Jika belum pernah login Cloudflare di VPS ini:

```
Browser akan meminta login Cloudflare.
```

1. Browser akan terbuka otomatis (atau copy link yang muncul)
2. Login dengan akun Cloudflare yang punya akses ke domain
3. Klik "Authorize"
4. Kembali ke terminal

⚠️ **PENTING**: Login dengan akun Cloudflare yang mempunyai akses ke zone/domain yang akan digunakan!

#### Step 7: Proses Instalasi Berjalan

Installer akan:
```
1/9 - Memeriksa cloudflared... ✅
2/9 - Login Cloudflare... ✅
3/9 - Membuat tunnel baru... ✅
4/9 - Membuat config.yml... ✅
5/9 - Membuat DNS route... ✅
6/9 - Mengatur .env... ✅
7/9 - Mengecek aplikasi lokal... ✅
8/9 - Memasang cloudflared sebagai service... ✅
9/9 - Finalisasi aplikasi... ✅
```

#### Step 8: Verifikasi

Installer akan test otomatis:
```
✓ Local origin OK: http://127.0.0.1:7575
✓ Public HTTPS OK: https://live1.monsterlive.my.id
```

---

### **C. Setelah Deployment**

#### 1. Test Akses Domain

```bash
# Test dari VPS
curl -I https://live1.monsterlive.my.id

# Test dari komputer Anda
# Buka browser: https://live1.monsterlive.my.id
```

#### 2. Update Google OAuth Console

**WAJIB** tambahkan redirect URI baru di Google Cloud Console:

1. Buka: https://console.cloud.google.com/apis/credentials
2. Pilih OAuth 2.0 Client ID yang digunakan
3. Di **Authorized redirect URIs**, tambahkan:
   ```
   https://live1.monsterlive.my.id/api/youtube/oauth/callback
   ```
4. Klik **SAVE**

#### 3. Test OAuth Flow

1. Login ke aplikasi: `https://live1.monsterlive.my.id`
2. Masuk ke menu **YouTube Sync**
3. Lihat "Authorized Redirect URI" - harus otomatis menampilkan domain yang benar
4. Connect dengan Google untuk test OAuth

#### 4. Test Fitur Aplikasi

- ✅ Login/logout
- ✅ Upload video
- ✅ YouTube connect
- ✅ Stream scheduling
- ✅ Semua fitur utama

---

## 🔄 Deploy Pelanggan Kedua, Ketiga, dst

Untuk deploy pelanggan berikutnya di VPS yang sama atau VPS berbeda:

### **VPS Yang Sama:**

```bash
cd ~/ozanglive
bash ozanglive-universal-multidomain-quick-installer-v3.sh
```

Input:
```
Nama tunnel: live2  ← HARUS BEDA dari live1
Base domain: monsterlive.my.id  ← SAMA
Subdomain: live2  ← BEDA
```

Hasil:
- Tunnel 1: `live1` → `https://live1.monsterlive.my.id`
- Tunnel 2: `live2` → `https://live2.monsterlive.my.id`

⚠️ **CATATAN**: Satu VPS hanya bisa jalan 1 aplikasi/port. Untuk multiple user, perlu VPS terpisah untuk setiap user.

### **VPS Berbeda:**

Setiap pelanggan dapat VPS sendiri, ulangi proses deployment dari awal.

---

## 🛠️ Troubleshooting

### ❌ Error: Tunnel sudah ada

```
❌ Tunnel 'live1' sudah ada. Gunakan nama unik.
```

**Solusi:**
- Gunakan nama tunnel yang berbeda: `live2`, `live3`, dst
- ATAU hapus tunnel lama: `cloudflared tunnel delete live1`

### ❌ Error: Domain belum di Cloudflare

```
⚠️  DNS route belum dapat dipastikan.
```

**Solusi:**
1. Login Cloudflare dashboard: https://dash.cloudflare.com
2. Tambahkan domain/zone ke Cloudflare
3. Jalankan ulang installer

### ❌ Error: Local origin tidak merespons

```
⚠️  Aplikasi belum merespons di port 7575
```

**Solusi:**
```bash
# Cek PM2
pm2 list

# Start aplikasi jika belum jalan
pm2 start ecosystem.config.js

# Atau
npm start
```

### ❌ Error: HTTPS belum OK

```
⚠️  Public HTTPS belum OK
```

**Solusi:**
- Tunggu 1-2 menit (DNS propagation)
- Test manual: `curl -I https://live1.monsterlive.my.id`
- Cek service: `sudo systemctl status cloudflared`
- Cek logs: `sudo journalctl -u cloudflared -n 50`

### ❌ OAuth Callback Error

```
redirect_uri_mismatch
```

**Solusi:**
Pastikan redirect URI sudah ditambahkan di Google Cloud Console:
```
https://live1.monsterlive.my.id/api/youtube/oauth/callback
```

---

## 📝 Checklist Deployment

**Sebelum Deploy:**
- [ ] VPS sudah siap
- [ ] Aplikasi Ozanglive sudah terinstall
- [ ] Domain sudah ditambahkan ke Cloudflare
- [ ] Git pull untuk dapat V3 script

**Proses Deploy:**
- [ ] Jalankan installer V3
- [ ] Input data dengan benar
- [ ] Login Cloudflare
- [ ] Verifikasi tunnel created
- [ ] Test local origin OK
- [ ] Test HTTPS OK

**Setelah Deploy:**
- [ ] Browser bisa akses domain
- [ ] Login aplikasi berhasil
- [ ] Update Google OAuth Console
- [ ] Test OAuth flow
- [ ] Test semua fitur

---

## 🎯 Tips & Best Practices

### 1. Naming Convention

**Tunnel Names:**
```
✅ BAIK: live1, live2, stream-user01
❌ JELEK: test, temp, abc123
```

**Subdomain:**
```
✅ BAIK: live1, live2, stream1
❌ JELEK: test, aaa, xxx
```

### 2. Security

⚠️ **JANGAN PERNAH SHARE:**
- `~/.cloudflared/cert.pem`
- `~/.cloudflared/[UUID].json`
- `.env` file
- OAuth Client Secret

### 3. Backup

Sebelum deploy, backup:
```bash
# Backup .env
cp .env .env.backup-$(date +%Y%m%d)

# Backup config
cp ~/.cloudflared/config.yml ~/.cloudflared/config.yml.backup
```

Installer V3 otomatis membuat backup dengan timestamp.

### 4. Multiple Domains

Untuk manage banyak pelanggan:
```
VPS 1: live1.monsterlive.my.id (Pelanggan A)
VPS 2: live2.monsterlive.my.id (Pelanggan B)
VPS 3: stream.domainlain.com (Pelanggan C)
```

### 5. Monitoring

```bash
# Cek service status
sudo systemctl status cloudflared

# Cek tunnel
cloudflared tunnel list

# Cek logs
sudo journalctl -u cloudflared -f

# Cek aplikasi
pm2 logs
```

---

## 📞 Bantuan Lebih Lanjut

**Logs untuk debugging:**
```bash
# Cloudflare logs
sudo journalctl -u cloudflared -n 100 --no-pager

# PM2 logs
pm2 logs --lines 100

# Check tunnel
cloudflared tunnel info [tunnel-name]
```

**Command berguna:**
```bash
# List semua tunnel
cloudflared tunnel list

# Info tunnel spesifik
cloudflared tunnel info live1

# Test config
cloudflared --config ~/.cloudflared/config.yml tunnel ingress validate

# Restart service
sudo systemctl restart cloudflared
```

---

## ✅ Kesimpulan

V3 Installer membuat deployment multi-domain **sangat mudah**:

1. ⚡ **Quick**: 5-10 menit per deployment
2. 🔒 **Secure**: Auto-generate credentials
3. ✨ **Simple**: Wizard step-by-step
4. 🎯 **Reliable**: Auto-verification
5. 📊 **Flexible**: Support subdomain atau domain berbeda

**Happy Deploying!** 🚀
