# Panduan Instal Ulang Ozanglive dengan Installer V3

## Masalah yang Diperbaiki

Installer V3 sekarang dapat menangani situasi berikut:

1. **DNS Route Gagal**: Installer tidak akan berhenti jika DNS route gagal
2. **Domain Belum di Cloudflare**: Ada opsi untuk skip DNS setup dan setup manual nanti
3. **Instalasi Bisa Dilanjutkan**: Meskipun ada error di DNS route, instalasi tetap berlanjut

## Cara Instal Ulang

### 1. Download Installer Terbaru

```bash
cd ~
wget https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v3.sh
chmod +x ozanglive-universal-multidomain-quick-installer-v3.sh
```

### 2. Jalankan Installer

```bash
bash ozanglive-universal-multidomain-quick-installer-v3.sh
```

### 3. Jawab Pertanyaan Installer

**Nama tunnel**: Gunakan nama unik untuk setiap VPS
```
live-user-01
```

**Gunakan base domain yang sama?**
- `Y` = Gunakan base domain yang sama (misalnya: monsterlive.my.id)
- `N` = Gunakan domain berbeda milik user

**Domain sudah ditambahkan ke Cloudflare?**
- `Y` = Domain sudah aktif di Cloudflare
- `N` = Domain belum ditambahkan (installer akan memberi opsi skip DNS route)

**Jika domain belum siap**, installer akan bertanya:
```
Tetap lanjutkan setup DNS route sekarang? [Y/n]
```
- `Y` = Coba setup DNS route (mungkin gagal tapi tidak masalah)
- `N` = Skip DNS route, setup manual nanti

### 4. Jika DNS Route Dilewati

Setup manual DNS route setelah domain siap:

```bash
cloudflared tunnel route dns NAMA-TUNNEL DOMAIN-ANDA
```

Contoh:
```bash
cloudflared tunnel route dns live-user-01 live2.monsterlive.my.id
```

## Troubleshooting

### Instalasi Stuck di DNS Route

**SEBELUMNYA**: Installer akan error dan berhenti
**SEKARANG**: Installer akan melanjutkan dan memberi instruksi setup manual

### HTTPS Belum Berfungsi Setelah Instalasi

Ini **NORMAL** jika:
1. Domain baru saja di-route (tunggu 10-60 detik)
2. DNS route dilewati (setup manual diperlukan)

**Langkah perbaikan:**

1. Cek status cloudflared:
```bash
sudo systemctl status cloudflared
```

2. Cek log cloudflared:
```bash
sudo journalctl -u cloudflared -n 50 --no-pager
```

3. Cek tunnel info:
```bash
cloudflared tunnel info NAMA-TUNNEL
```

4. Setup DNS route manual (jika dilewati):
```bash
cloudflared tunnel route dns NAMA-TUNNEL DOMAIN-ANDA
```

5. Test origin local:
```bash
curl http://127.0.0.1:7575
```

6. Test public HTTPS:
```bash
curl -I https://DOMAIN-ANDA
```

7. Restart cloudflared jika perlu:
```bash
sudo systemctl restart cloudflared
```

8. Cek PM2 app:
```bash
pm2 list
pm2 logs ozanglive --lines 50
```

### PM2 Not Updating BASE_URL

Jika PM2 masih menggunakan BASE_URL lama:

```bash
cd /home/ubuntu/ozanglive
pm2 restart ozanglive --update-env
pm2 save
```

Verifikasi BASE_URL:
```bash
pm2 env ozanglive | grep BASE_URL
```

### Domain Tidak Resolve ke Cloudflare

1. Pastikan domain sudah ditambahkan ke Cloudflare account Anda
2. Pastikan nameserver domain mengarah ke Cloudflare
3. Tunggu DNS propagation (bisa sampai 24 jam)
4. Cek dengan: `dig DOMAIN-ANDA` atau `nslookup DOMAIN-ANDA`

### Cloudflared Service Tidak Start

1. Cek error:
```bash
sudo journalctl -u cloudflared -n 100 --no-pager
```

2. Validasi config:
```bash
cloudflared --config ~/.cloudflared/config.yml tunnel ingress validate
```

3. Test manual:
```bash
cloudflared --config ~/.cloudflared/config.yml tunnel run
```

Jika sukses, restart service:
```bash
sudo systemctl restart cloudflared
```

## Tips Auto-Start Reboot

Pastikan cloudflared dan PM2 auto-start saat server reboot:

```bash
# Cloudflared (sudah otomatis jika pakai installer)
sudo systemctl enable cloudflared

# PM2
pm2 startup
pm2 save
```

## PERINTAH PENTING

### Status Aplikasi
```bash
pm2 status                          # Status aplikasi
pm2 logs ozanglive                  # Monitoring log real-time
pm2 restart ozanglive              # Restart aplikasi
pm2 monit                          # Dashboard performa RAM/CPU
```

### Status Cloudflared
```bash
sudo systemctl status cloudflared   # Status service
sudo journalctl -u cloudflared      # Log cloudflared
cloudflared tunnel info TUNNEL-NAME # Info tunnel
cloudflared tunnel list             # List semua tunnel
```

### Manual DNS Route
```bash
cloudflared tunnel route dns TUNNEL-NAME DOMAIN
```

### Test Koneksi
```bash
curl http://127.0.0.1:7575         # Test local
curl -I https://DOMAIN-ANDA        # Test HTTPS public
```

## Kontak

Jika masih ada masalah, hubungi support dengan informasi:
1. Output dari: `sudo systemctl status cloudflared`
2. Output dari: `pm2 list`
3. Output dari: `curl http://127.0.0.1:7575`
4. Screenshot error yang muncul
