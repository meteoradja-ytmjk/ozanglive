# Fix Thumbnail Folder - Deployment Guide

## Perubahan
- **HAPUS opsi "Root"** dari dropdown folder saat edit broadcast
- Otomatis pilih folder pertama jika tidak ada folder tersimpan
- Folder yang dipilih user akan ditampilkan saat penjadwalan ulang

## File yang Perlu Di-deploy ke VPS

```bash
scp app.js user@vps:/path/to/streamflow/
scp public/js/youtube.js user@vps:/path/to/streamflow/public/js/
scp views/youtube.ejs user@vps:/path/to/streamflow/views/
scp services/scheduleService.js user@vps:/path/to/streamflow/services/
scp models/YouTubeBroadcastSettings.js user@vps:/path/to/streamflow/models/
scp db/database.js user@vps:/path/to/streamflow/db/
scp scripts/fix-template-folder.js user@vps:/path/to/streamflow/scripts/
```

## Langkah Deploy

### 1. Upload file ke VPS
```bash
scp app.js public/js/youtube.js views/youtube.ejs services/scheduleService.js models/YouTubeBroadcastSettings.js db/database.js scripts/fix-template-folder.js user@vps:/path/to/streamflow/
```

### 2. Update template dengan folder yang benar (jika perlu)
```bash
cd /path/to/streamflow
node scripts/fix-template-folder.js "NAMA_TEMPLATE" "NAMA_FOLDER"
```

### 3. Restart aplikasi
```bash
pm2 restart streamflow
```

### 4. Clear browser cache dan test
- Ctrl+Shift+R untuk clear cache
- Edit broadcast
- Dropdown folder tidak ada "Root" lagi
- Folder otomatis sesuai pilihan user atau folder pertama
