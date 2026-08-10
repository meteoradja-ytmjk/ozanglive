# 🌐 Ozanglive Domain Setup - Panduan Lengkap

## 📚 Daftar Dokumentasi

Repository ini menyediakan beberapa file panduan untuk setup domain:

### 1. **CARA-SETUP-DOMAIN.md** 
📖 **Dokumentasi lengkap dan detail**
- Panduan step-by-step
- Troubleshooting lengkap
- Multiple cara setup
- Contoh-contoh kasus

```bash
cat ~/ozanglive/CARA-SETUP-DOMAIN.md
```

### 2. **SETUP-DOMAIN-QUICKSTART.txt**
⚡ **Quick reference untuk copy-paste**
- Command siap pakai
- Format ASCII art mudah dibaca
- Perfect untuk bookmark

```bash
cat ~/ozanglive/SETUP-DOMAIN-QUICKSTART.txt
```

### 3. **ozanglive-universal-multidomain-quick-installer-v2.sh**
🚀 **Installer script utama**
- Auto-configure Cloudflare Tunnel
- Support multi-domain
- Systemd service setup

```bash
bash ~/ozanglive/ozanglive-universal-multidomain-quick-installer-v2.sh
```

---

## 🎯 Skenario Penggunaan

### **Skenario 1: Baru Install, Langsung Setup Domain**

Installer utama (`install.sh`) sudah otomatis menanyakan apakah ingin setup domain.
Pilih **"Y"** saat diminta, dan installer domain akan berjalan otomatis.

---

### **Skenario 2: Sudah Install, Skip Domain, Mau Setup Kemudian**

Jika Anda skip setup domain saat instalasi, berikut cara setup di kemudian hari:

#### **Cara Paling Cepat:**
```bash
cd ~ && bash ozanglive-universal-multidomain-quick-installer-v2.sh
```

#### **Jika Installer Tidak Ada:**
```bash
cd ~ && \
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v2.sh -o domain-setup.sh && \
chmod +x domain-setup.sh && \
bash domain-setup.sh
```

---

### **Skenario 3: Multiple Domain untuk Multiple User**

Script ini support **multi-user/multi-domain**. Setiap VPS bisa host berbagai domain:

**User A:**
```
Domain: https://stream.domainA.com
Port: 7575
Tunnel: live-userA
```

**User B:**
```
Domain: https://panel.domainB.com  
Port: 7575
Tunnel: live-userB
```

**User C:**
```
Domain: https://live.domainC.com
Port: 7575
Tunnel: live-userC
```

Semuanya bisa di VPS yang sama, cukup jalankan installer berkali-kali dengan:
- Nama tunnel yang berbeda
- Domain yang berbeda
- Port aplikasi yang sama (karena routing via Cloudflare)

---

## ✅ Checklist Pre-Installation

Sebelum menjalankan domain setup, pastikan:

- [ ] **Aplikasi Ozanglive** sudah terinstal dan berjalan
- [ ] **Test lokal** berhasil: `curl http://localhost:7575`
- [ ] **Domain sudah registered** dan ditambahkan ke Cloudflare
- [ ] **Cloudflare account** punya akses manage domain tersebut
- [ ] **Port aplikasi** sudah diketahui (default: 7575)
- [ ] **Path aplikasi** sudah diketahui (default: /home/ubuntu/ozanglive)

---

## 🔧 Troubleshooting Common Issues

### **Issue: "Tunnel name already exists"**

**Penyebab:** Nama tunnel sudah digunakan.

**Solusi:** 
```bash
# List tunnel yang ada
cloudflared tunnel list

# Gunakan nama tunnel yang berbeda
# Contoh: live-user-01, live-user-02, dst
```

---

### **Issue: "Zone not found / Permission denied"**

**Penyebab:** Domain belum ditambahkan ke Cloudflare atau account tidak punya akses.

**Solusi:**
1. Login ke Cloudflare dashboard
2. Pastikan domain sudah ditambahkan sebagai zone
3. Pastikan nameserver domain sudah pointing ke Cloudflare
4. Gunakan account yang punya akses manage zone tersebut

---

### **Issue: "Application not responding on port"**

**Penyebab:** Aplikasi tidak berjalan atau port salah.

**Solusi:**
```bash
# Cek aplikasi berjalan
pm2 status

# Restart aplikasi
pm2 restart all

# Cek port yang digunakan
cat ~/ozanglive/.env | grep PORT

# Test local
curl http://localhost:7575
```

---

### **Issue: "Domain tidak bisa diakses setelah setup"**

**Penyebab:** DNS belum propagate atau cloudflared belum running.

**Solusi:**
```bash
# Cek cloudflared service
sudo systemctl status cloudflared

# Restart cloudflared
sudo systemctl restart cloudflared

# Cek log
sudo journalctl -u cloudflared -n 100

# Tunggu 1-5 menit untuk DNS propagation
# Lalu test lagi
curl -I https://yourdomain.com
```

---

## 📞 Support & Contact

### **Developer Contact:**
- 📱 WhatsApp: **089621453431**
- 🌐 GitHub: https://github.com/meteoradja-ytmjk/ozanglive

### **Useful Links:**
- 📖 Cloudflare Tunnel Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- 🔧 PM2 Documentation: https://pm2.keymetrics.io/docs/usage/quick-start/
- 🌐 Node.js Docs: https://nodejs.org/docs/

---

## 🔐 Security Best Practices

**NEVER share these files publicly:**

```
~/.cloudflared/cert.pem           → Cloudflare auth certificate
~/.cloudflared/XXXXXX.json        → Tunnel credentials
~/ozanglive/.env                  → Application secrets
Google OAuth Client Secret        → OAuth credentials
```

**Safe to share:**
- Public domain name
- Application features/screenshots
- Non-sensitive configuration

---

## 📝 Version History

- **v2.0** - Universal Multi-Domain Support
  - Support berbagai domain (tidak terikat monsterlive.my.id)
  - Auto-detection mode (base domain sama/berbeda)
  - Improved error handling
  - Better user experience

- **v1.0** - Initial Release
  - Basic Cloudflare Tunnel setup
  - Single domain support

---

## 🎉 Success Indicators

Setup berhasil jika:

✅ Command `sudo systemctl status cloudflared` menunjukkan **active (running)**
✅ Command `pm2 status` menunjukkan aplikasi **online**
✅ Domain dapat diakses via **HTTPS** di browser
✅ OAuth callback berfungsi normal
✅ File `.env` terupdate dengan `BASE_URL` yang benar

---

## 🚀 Next Steps After Domain Setup

Setelah domain berhasil di-setup:

1. **Update Google OAuth Console**
   - Tambahkan authorized redirect URI: `https://yourdomain.com/api/youtube/oauth/callback`
   - Update authorized domains

2. **Test aplikasi lengkap**
   - Login dengan akun YouTube
   - Test streaming features
   - Verify database working

3. **Setup monitoring (optional)**
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   ```

4. **Backup credentials**
   - Simpan tunnel UUID
   - Backup `.env` file
   - Backup `~/.cloudflared/` directory

---

## 📊 Architecture Overview

```
User Browser
    ↓ HTTPS
Cloudflare Edge Network
    ↓ Encrypted Tunnel
cloudflared (VPS)
    ↓ localhost:7575
Ozanglive App (PM2)
    ↓
SQLite Database
```

**Benefits:**
- 🔒 End-to-end encryption
- 🚀 Cloudflare CDN & caching
- 🛡️ DDoS protection
- 📊 Analytics & logs
- 🌍 Global availability

---

**Dibuat dengan ❤️ untuk Ozanglive Community**

Last Updated: 2024
