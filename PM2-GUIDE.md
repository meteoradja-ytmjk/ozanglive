# PM2 Process Manager Guide for StreamFlow

PM2 adalah process manager untuk Node.js yang menyediakan fitur auto-restart, monitoring, dan log management.

## Instalasi PM2

```bash
npm install -g pm2
```

## Cara Penggunaan

### Menjalankan Aplikasi dengan PM2

```bash
# Menggunakan npm script
npm run pm2:start

# Atau langsung dengan PM2
pm2 start ecosystem.config.js

# Atau menggunakan script helper
./pm2-start.sh start    # Linux/Mac
pm2-start.bat start     # Windows
```

### Perintah PM2 Umum

| Perintah | Deskripsi |
|----------|-----------|
| `npm run pm2:start` | Menjalankan aplikasi |
| `npm run pm2:stop` | Menghentikan aplikasi |
| `npm run pm2:restart` | Restart aplikasi |
| `npm run pm2:reload` | Zero-downtime reload |
| `npm run pm2:logs` | Melihat log aplikasi |
| `npm run pm2:status` | Melihat status proses |
| `npm run pm2:monit` | Membuka dashboard monitoring |

### Auto-Start saat Boot

Untuk menjalankan StreamFlow otomatis saat server/komputer dinyalakan:

```bash
# Generate startup script
pm2 startup

# Simpan konfigurasi saat ini
pm2 save
```

## Fitur PM2 yang Dikonfigurasi

### Auto-Restart
- Aplikasi akan otomatis restart jika crash
- Maksimal 10 restart dalam waktu singkat
- Delay 4 detik sebelum restart

### Memory Management
- Restart otomatis jika memory melebihi 1GB
- Heap size dibatasi 1GB

### Logging
- Log disimpan di folder `logs/`
- `pm2-combined.log` - Semua log
- `pm2-out.log` - Output log
- `pm2-error.log` - Error log

### Graceful Shutdown
- Timeout 30 detik untuk graceful shutdown
- Memastikan semua stream dihentikan dengan benar

## Monitoring

### Dashboard Real-time
```bash
pm2 monit
```

### Status Proses
```bash
pm2 status
```

### Log Real-time
```bash
pm2 logs streamflow --lines 100
```

## Troubleshooting

### Aplikasi Terus Restart
Cek log untuk melihat penyebab crash:
```bash
pm2 logs streamflow --err --lines 200
```

### Memory Tinggi
Restart manual untuk membersihkan memory:
```bash
pm2 restart streamflow
```

### Menghapus dari PM2
```bash
pm2 delete streamflow
```

## Konfigurasi Lanjutan

File konfigurasi: `ecosystem.config.js`

Opsi yang bisa diubah:
- `max_memory_restart` - Batas memory untuk restart
- `max_restarts` - Maksimal restart
- `restart_delay` - Delay sebelum restart
- `cron_restart` - Jadwal restart berkala (uncomment untuk mengaktifkan)
