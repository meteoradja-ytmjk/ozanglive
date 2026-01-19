# Fix Thumbnail Folder - Deployment Guide

## Masalah
Ketika broadcast dijadwalkan ulang (edit), folder thumbnail menampilkan "Root" padahal template menggunakan folder lain.

## Solusi
API sekarang akan:
1. Cek `youtube_broadcast_settings` untuk `thumbnailFolder`
2. Jika tidak ada, cek template berdasarkan `template_id`
3. Jika masih tidak ada, cek template berdasarkan `account_id` broadcast
4. Jika masih tidak ada, gunakan template yang paling baru digunakan

## File yang Perlu Di-deploy ke VPS

```
app.js
public/js/youtube.js
services/scheduleService.js
models/YouTubeBroadcastSettings.js
db/database.js
scripts/migrate-thumbnail-folder.js
```

## Langkah Deploy

### 1. Upload file ke VPS
```bash
scp app.js user@vps:/path/to/streamflow/
scp public/js/youtube.js user@vps:/path/to/streamflow/public/js/
scp services/scheduleService.js user@vps:/path/to/streamflow/services/
scp models/YouTubeBroadcastSettings.js user@vps:/path/to/streamflow/models/
scp db/database.js user@vps:/path/to/streamflow/db/
scp scripts/migrate-thumbnail-folder.js user@vps:/path/to/streamflow/scripts/
```

### 2. Di VPS, jalankan migrasi (opsional, untuk debug)
```bash
cd /path/to/streamflow
node scripts/migrate-thumbnail-folder.js
```

### 3. Restart aplikasi
```bash
pm2 restart streamflow
```

### 4. Clear browser cache dan test
- Buka browser, clear cache (Ctrl+Shift+R)
- Edit broadcast yang sudah ada
- Folder thumbnail seharusnya sesuai dengan template

## Cara Kerja
- Ketika edit broadcast, frontend mengirim `accountId` ke API
- API mencari `thumbnailFolder` dari:
  1. `youtube_broadcast_settings` (jika ada)
  2. Template berdasarkan `template_id` (jika ada)
  3. Template berdasarkan `account_id` (untuk broadcast lama)
  4. Template yang paling baru digunakan (fallback terakhir)
- Folder yang ditemukan akan ditampilkan di dropdown
