# Fix Thumbnail Folder - Deployment Guide

## Masalah
Ketika broadcast dijadwalkan ulang, folder thumbnail berubah ke "Root" padahal template menggunakan folder lain.

## Penyebab
1. `thumbnailFolder` tidak disimpan ke `youtube_broadcast_settings` saat broadcast dibuat dari template recurring
2. Tidak ada fallback ke template jika settings tidak ada

## File yang Diubah
1. `db/database.js` - Menambahkan kolom `template_id`
2. `models/YouTubeBroadcastSettings.js` - Support `templateId`
3. `services/scheduleService.js` - Menyimpan `thumbnailFolder` dan `templateId` saat broadcast dibuat
4. `app.js` - Multiple fixes:
   - API broadcast-settings dengan fallback ke template
   - Endpoint create-broadcast-from-template menyimpan `templateId`
   - Endpoint bulk-create menyimpan `templateId`
   - Endpoint PUT templates menyimpan `thumbnailFolder`, `pinnedThumbnail`, `streamKeyFolderMapping`
5. `public/js/youtube.js` - Handle fallback response
6. `scripts/migrate-thumbnail-folder.js` - Script migrasi untuk fix data lama

## Langkah Deploy ke VPS

### 1. Upload semua file yang diubah ke VPS
```bash
# Dari local, upload ke VPS
scp db/database.js user@vps:/path/to/app/db/
scp models/YouTubeBroadcastSettings.js user@vps:/path/to/app/models/
scp services/scheduleService.js user@vps:/path/to/app/services/
scp app.js user@vps:/path/to/app/
scp public/js/youtube.js user@vps:/path/to/app/public/js/
scp scripts/migrate-thumbnail-folder.js user@vps:/path/to/app/scripts/
```

### 2. SSH ke VPS dan jalankan migrasi
```bash
ssh user@vps
cd /path/to/app

# Jalankan script migrasi untuk melihat status dan fix data
node scripts/migrate-thumbnail-folder.js
```

### 3. Restart aplikasi
```bash
pm2 restart streamflow
# atau
pm2 restart all
```

### 4. Verifikasi
1. Buka aplikasi di browser
2. Edit broadcast yang sudah ada
3. Cek apakah folder thumbnail sudah benar (bukan Root)

## Catatan Penting
- Script migrasi akan menambahkan kolom `template_id` jika belum ada
- Script akan mencoba mencocokkan broadcast dengan template berdasarkan `user_id` dan `account_id`
- Untuk broadcast yang tidak bisa dicocokkan, API akan menggunakan template yang paling baru digunakan sebagai fallback
- Setelah user mengedit dan menyimpan broadcast, folder akan tersimpan permanen
