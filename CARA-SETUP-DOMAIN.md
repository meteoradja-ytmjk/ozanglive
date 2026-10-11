# 🌐 CARA SETUP DOMAIN UNTUK OZANGLIVE

## Jika Anda Melewati Setup Domain Saat Instalasi

Tenang! Anda bisa setup domain **kapan saja** setelah aplikasi terinstal.

---

## 📋 PERSYARATAN

Sebelum mulai, pastikan:

1. ✅ Aplikasi Ozanglive sudah terinstal dan berjalan
2. ✅ Domain Anda sudah ditambahkan ke **Cloudflare**
3. ✅ Cloudflare account Anda punya akses ke zone/domain tersebut
4. ✅ Anda tahu port aplikasi (default: `7575`)

---

## 🚀 CARA 1: JALANKAN SCRIPT INSTALLER (PALING MUDAH)

### Copy & Paste Command Ini:

```bash
cd ~/ozanglive && bash ozanglive-universal-multidomain-quick-installer-v2.sh
```

**Atau jika installer ada di home directory:**

```bash
cd ~ && bash ozanglive-universal-multidomain-quick-installer-v2.sh
```

### Langkah-Langkah:

1. **Login ke VPS** via SSH
2. **Copy command di atas** dan paste di terminal
3. **Ikuti prompt** yang muncul:
   - Masukkan nama tunnel (contoh: `live-user-01`)
   - Pilih mode domain (base domain sama atau domain berbeda)
   - Masukkan domain yang akan digunakan
   - Konfirmasi domain sudah di Cloudflare
   - Masukkan port aplikasi (default: `7575`)
   - Masukkan folder aplikasi (default: `/home/ubuntu/ozanglive`)

4. **Login Cloudflare** akan terbuka di browser
5. **Tunggu proses selesai** (5-10 menit)
6. **Akses domain Anda** di browser!

---

## 🔧 CARA 2: DOWNLOAD INSTALLER JIKA TIDAK ADA

Jika installer tidak ditemukan, download terlebih dahulu:

```bash
# Masuk ke home directory
cd ~

# Download installer dari GitHub
wget https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v2.sh

# Atau gunakan curl jika wget tidak tersedia
curl -O https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v2.sh

# Beri permission executable
chmod +x ozanglive-universal-multidomain-quick-installer-v2.sh

# Jalankan installer
bash ozanglive-universal-multidomain-quick-installer-v2.sh
```

---

## 🎯 CARA 3: ONE-LINER (COPY PASTE LANGSUNG)

**Copy seluruh command ini dan paste di terminal VPS:**

```bash
cd ~ && \
if [ ! -f "ozanglive-universal-multidomain-quick-installer-v2.sh" ]; then \
    echo "📥 Downloading installer..." && \
    curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v2.sh -o ozanglive-universal-multidomain-quick-installer-v2.sh && \
    chmod +x ozanglive-universal-multidomain-quick-installer-v2.sh; \
fi && \
echo "🚀 Starting domain setup..." && \
bash ozanglive-universal-multidomain-quick-installer-v2.sh
```

Command ini akan:
- ✅ Otomatis download installer jika belum ada
- ✅ Beri permission executable
- ✅ Langsung jalankan setup domain

---

## 📝 CONTOH INPUT SAAT SETUP

### **Contoh 1: Menggunakan Base Domain yang Sama**

```
Nama tunnel unik: live-user-01
Gunakan base domain yang sama? Y
Base domain: monsterlive.my.id
Subdomain/alias user: live2
```
**Hasil:** `https://live2.monsterlive.my.id`

---

### **Contoh 2: Menggunakan Domain Berbeda**

```
Nama tunnel unik: budilive-main
Gunakan base domain yang sama? N
Domain publik user: stream.budilive.com
```
**Hasil:** `https://stream.budilive.com`

---

### **Contoh 3: Custom Port**

```
Nama tunnel unik: user-panel
Gunakan base domain yang sama? Y
Base domain: monsterlive.my.id
Subdomain/alias user: panel
Port aplikasi: 8080
Folder aplikasi: /home/ubuntu/ozanglive
```
**Hasil:** `https://panel.monsterlive.my.id` → `http://127.0.0.1:8080`

---

## ⚠️ TROUBLESHOOTING

### **Problem: Domain installer tidak ditemukan**

**Solusi:**
```bash
cd ~/ozanglive
ls -la ozanglive-universal-multidomain-quick-installer-v2.sh
```

Jika tidak ada, gunakan **CARA 2** atau **CARA 3** di atas.

---

### **Problem: Domain belum bisa diakses setelah setup**

**Solusi:**
```bash
# Cek status cloudflared
sudo systemctl status cloudflared

# Cek log cloudflared
sudo journalctl -u cloudflared -n 50 --no-pager

# Restart cloudflared
sudo systemctl restart cloudflared

# Tunggu 1-2 menit, lalu coba akses domain lagi
```

---

### **Problem: Aplikasi tidak berjalan di port yang benar**

**Solusi:**
```bash
# Cek aplikasi berjalan di port berapa
pm2 status

# Cek .env file
cd ~/ozanglive
cat .env | grep PORT

# Restart aplikasi
pm2 restart all
```

---

## 🔐 KEAMANAN

**JANGAN PERNAH** membagikan file-file ini:

```
~/.cloudflared/cert.pem
~/.cloudflared/XXXXXX.json (tunnel credentials)
~/ozanglive/.env
Google OAuth Client Secret
```

---

## 📞 BANTUAN

Jika ada masalah, hubungi developer:

- 📱 WhatsApp: **089621453431**
- 📧 Email: Contact via WhatsApp
- 🐛 GitHub Issues: https://github.com/meteoradja-ytmjk/ozanglive/issues

---

## ✅ CHECKLIST SETUP DOMAIN

Sebelum mulai, pastikan:

- [ ] Aplikasi Ozanglive sudah terinstal
- [ ] Aplikasi berjalan normal di `http://IP:7575`
- [ ] Domain sudah ditambahkan ke Cloudflare
- [ ] Punya akses login Cloudflare account
- [ ] Tahu port aplikasi yang digunakan
- [ ] Sudah backup data penting (opsional)

Setelah setup:

- [ ] Domain bisa diakses via HTTPS
- [ ] Cloudflared service berjalan: `sudo systemctl status cloudflared`
- [ ] Aplikasi masih berjalan: `pm2 status`
- [ ] File `.env` sudah terupdate dengan BASE_URL baru

---

## 🎉 SELESAI!

Setelah setup domain berhasil, aplikasi Anda akan dapat diakses via:

- ✅ **HTTPS** dengan SSL otomatis
- ✅ **Domain kustom** milik Anda
- ✅ **Tanpa exposed port** (aman dari scan)
- ✅ **Protected by Cloudflare** (DDoS protection, caching, CDN)

---

**Last Updated:** 2024
**Version:** 2.0
**Compatible with:** Ozanglive Universal Multi-Domain Quick Installer v2
