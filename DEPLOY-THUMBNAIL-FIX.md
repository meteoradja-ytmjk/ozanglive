# Fix Thumbnail Folder - Deployment Guide

## Masalah
Ketika broadcast dijadwalkan ulang (edit), folder thumbnail menampilkan "Root" padahal template menggunakan folder lain seperti "DAVINA" atau "tez".

## Penyebab
Template di database mungkin memiliki `thumbnail_folder = NULL` karena tidak pernah di-set saat template dibuat.

## Langkah Fix di VPS

### 1. Upload semua file yang diubah
```bash
scp app.js user@vps:/path/to/streamflow/
scp public/js/youtube.js user@vps:/path/to/streamflow/public/js/
scp services/scheduleService.js user@vps:/path/to/streamflow/services/
scp models/YouTubeBroadcastSettings.js user@vps:/path/to/streamflow/models/
scp db/database.js user@vps:/path/to/streamflow/db/
scp scripts/fix-template-folder.js user@vps:/path/to/streamflow/scripts/
scp scripts/check-template-folder.js user@vps:/path/to/streamflow/scripts/
```

### 2. SSH ke VPS dan cek status template
```bash
cd /path/to/streamflow
node scripts/check-template-folder.js
```

Ini akan menampilkan semua template dan `thumbnail_folder` mereka.

### 3. Update template dengan folder yang benar
Jika template memiliki `thumbnail_folder = NULL`, update dengan:

```bash
# Contoh: Update template "La Davina Melodia" dengan folder "DAVINA"
node scripts/fix-template-folder.js "La Davina Melodia" "DAVINA"

# Atau untuk folder lain
node scripts/fix-template-folder.js "NAMA_TEMPLATE" "tez"
```

### 4. Restart aplikasi
```bash
pm2 restart streamflow
```

### 5. Clear browser cache dan test
- Buka browser, clear cache (Ctrl+Shift+R)
- Edit broadcast yang sudah ada
- Folder thumbnail seharusnya sesuai dengan template

## File yang Diubah
- `app.js` - API broadcast-settings dengan logging dan fallback ke template
- `public/js/youtube.js` - Frontend mengirim accountId
- `services/scheduleService.js` - Menyimpan thumbnailFolder saat broadcast dibuat
- `models/YouTubeBroadcastSettings.js` - Support templateId
- `db/database.js` - Kolom template_id
- `scripts/fix-template-folder.js` - Script untuk update template
- `scripts/check-template-folder.js` - Script untuk cek status
