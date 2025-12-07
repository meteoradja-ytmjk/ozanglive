# 🎬 Ozang - Cloud Streaming Solution

<p align="center">
  <img src="public/images/logo.png" alt="StreamFlow Logo" width="200">
</p>

<p align="center">
  <strong>Solusi streaming cloud dengan FFmpeg untuk live streaming ke berbagai platform</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.1.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License">
</p>

---

## ✨ Fitur Utama

- 🎥 **Multi-Platform Streaming** - YouTube, Facebook, Twitch, TikTok, Instagram, Shopee Live, Restream.io
- 📅 **Scheduled Streaming** - Jadwalkan streaming sekali, harian, atau mingguan
- 🔄 **Loop Video** - Putar video secara berulang
- 🎵 **Audio Overlay** - Tambahkan audio background ke stream
- 📁 **Playlist Support** - Buat playlist video untuk streaming
- 👥 **Multi-User** - Dukungan multiple user dengan role Admin/Member
- 📊 **Dashboard Monitoring** - Monitor status streaming real-time
- 📜 **Stream History** - Riwayat streaming lengkap
- 🔒 **Secure** - Session management & rate limiting

---

## 🚀 Quick Install (VPS Ubuntu/Debian)

### One-Line Installer

```bash
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/install.sh | bash
```

### Untuk reset VPS jika Sebelumnya sudah ada

```bash
curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/uninstall.sh | bash
```

> 💡 **Installer otomatis mendeteksi** jika sudah ada instalasi sebelumnya dan memberikan pilihan:
> - **Install ulang** - Hapus instalasi lama dan install fresh
> - **Update saja** - Pertahankan data, update kode terbaru
> - **Batalkan** - Tidak melakukan apa-apa

### Manual Installation

```bash
# 1. Update sistem
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install FFmpeg dan Git
sudo apt install ffmpeg git -y

# 4. Clone repository
git clone https://github.com/meteoradja-ytmjk/ozanglive
cd ozanglive

# 5. Install dependencies
npm install

# 6. Generate session secret
npm run generate-secret

# 7. Setup timezone (opsional)
sudo timedatectl set-timezone Asia/Jakarta

# 8. Setup firewall
sudo ufw allow ssh
sudo ufw allow 7575
sudo ufw --force enable

# 9. Install PM2 untuk process manager
sudo npm install -g pm2

# 10. Start aplikasi
pm2 start app.js --name streamflow
pm2 save
pm2 startup
```

---

##   DUpdate Aplikasi (Tanpa Install Ulang)

Jika aplikasi sudah terinstall di VPS dan ingin update ke versi terbaru:

### Quick Update (One-Line)

```bash
cd ~/ozanglive && git pull && pm2 restart streamflow
```

### Update Step-by-Step

```bash
# 1. Masuk ke folder aplikasi
cd ~/ozanglive

# 2. Backup database (opsional tapi recommended)
cp db/streamflow.db db/streamflow.db.backup

# 3. Pull perubahan terbaru dari GitHub
git pull origin main

# 4. Install dependencies baru (jika ada)
npm install

# 5. Restart aplikasi
pm2 restart streamflow

# 6. Cek status
pm2 status
```

### Jika Ada Conflict saat Git Pull

```bash
# Reset local changes dan ambil versi terbaru
cd ~/ozanglive
git fetch origin
git reset --hard origin/main
npm install
pm2 restart streamflow
```

### Update dengan Docker

```bash
cd ~/ozanglive
git pull origin main
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 🔥 Fresh Install / Replace Total (VPS)

Jika ingin install ulang dengan menimpa semua file (database tetap aman):

```bash
# One-Line Command
cd ~/ozanglive && git fetch origin && git reset --hard origin/main && npm install && pm2 restart streamflow
```

**Step-by-Step:**

```bash
# 1. Masuk folder aplikasi
cd ~/ozanglive

# 2. Backup database dulu (PENTING!)
cp db/streamflow.db db/streamflow.db.backup

# 3. Fetch dan replace semua file dengan versi GitHub
git fetch origin
git reset --hard origin/main

# 4. Install dependencies
npm install

# 5. Restart aplikasi
pm2 restart streamflow

# 6. Verifikasi
pm2 status
pm2 logs streamflow --lines 20
```

> ⚠️ **Catatan:** Perintah `git reset --hard` akan menimpa SEMUA file local dengan versi dari GitHub. Pastikan backup database sebelum menjalankan!

---

## 🐳 Docker Installation

### Menggunakan Docker Compose (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/meteoradja-ytmjk/ozanglive
cd ozanglive

# 2. Copy environment file
cp .env.example .env

# 3. Generate session secret
node generate-secret.js

# 4. Build dan jalankan
docker-compose up -d
```

### Docker Manual

```bash
# Build image
docker build -t streamflow .

# Run container
docker run -d \
  --name streamflow \
  -p 7575:7575 \
  -v $(pwd)/db:/app/db \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/public/uploads:/app/public/uploads \
  --restart unless-stopped \
  streamflow
```

---

## ⚙️ Konfigurasi

### Environment Variables (.env)

```env
# Port aplikasi (default: 7575)
PORT=7575

# Session secret (auto-generated)
SESSION_SECRET=your-secret-key

# Environment
NODE_ENV=production
```

### Generate Session Secret

```bash
npm run generate-secret
# atau
node generate-secret.js
```

---

## 📋 PM2 Commands (Process Manager)

```bash
# Cek status aplikasi
pm2 status

# Lihat logs real-time
pm2 logs streamflow

# Restart aplikasi
pm2 restart streamflow

# Stop aplikasi
pm2 stop streamflow

# Delete dari PM2
pm2 delete streamflow

# Monitor resource usage
pm2 monit
```

---

## 🔧 Troubleshooting

### Reset Password Admin

```bash
node reset-password.js
```

### Cek FFmpeg Installation

```bash
ffmpeg -version
```

### Cek Port yang Digunakan

```bash
sudo lsof -i :7575
# atau
sudo netstat -tlnp | grep 7575
```

### Restart Aplikasi

```bash
# Dengan PM2
pm2 restart streamflow

# Dengan Docker
docker-compose restart
```

### Lihat Logs

```bash
# PM2 logs
pm2 logs streamflow --lines 100

# Docker logs
docker-compose logs -f --tail=100

# File logs
tail -f logs/app.log
```

---

## 📁 Struktur Folder

```
streamflow/
├── app.js              # Main application
├── db/                 # SQLite database
│   └── streamflow.db
├── logs/               # Application logs
├── middleware/         # Express middlewares
├── models/             # Database models
├── public/             # Static files
│   ├── css/
│   ├── js/
│   ├── images/
│   └── uploads/        # User uploads
│       ├── avatars/
│       ├── videos/
│       └── thumbnails/
├── services/           # Business logic services
├── utils/              # Utility functions
├── views/              # EJS templates
├── .env                # Environment config
├── docker-compose.yml  # Docker compose config
├── Dockerfile          # Docker build config
└── package.json        # Node.js dependencies
```

---

## 🌐 Akses Aplikasi

Setelah instalasi selesai:

1. Buka browser dan akses: `http://IP_SERVER:7575`
2. Buat akun admin pertama (username & password)
3. Login dan mulai streaming!

---

## 🔐 Keamanan

### Rekomendasi untuk Production

1. **Gunakan HTTPS** - Setup reverse proxy dengan Nginx + SSL
2. **Ganti Port Default** - Ubah port 7575 ke port lain
3. **Firewall** - Batasi akses hanya dari IP tertentu
4. **Update Reguler** - Selalu update dependencies

### Setup Nginx Reverse Proxy (Opsional)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:7575;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Untuk upload file besar
        client_max_body_size 10G;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

---

## 📊 System Requirements

### Minimum

- **OS**: Ubuntu 20.04+ / Debian 11+
- **CPU**: 2 Core
- **RAM**: 2 GB
- **Storage**: 20 GB SSD
- **Network**: 10 Mbps upload

### Recommended

- **OS**: Ubuntu 22.04 LTS
- **CPU**: 4 Core
- **RAM**: 4 GB
- **Storage**: 50 GB SSD
- **Network**: 50 Mbps upload

---

## 🆘 Support

Jika mengalami masalah:

1. Cek logs: `pm2 logs streamflow`
2. Restart aplikasi: `pm2 restart streamflow`
3. Buka issue di GitHub

---

## 📄 License

MIT License - Lihat [LICENSE.md](LICENSE.md)

---

<p align="center">
  Made with ❤️ by Bang Tutorial
</p>
