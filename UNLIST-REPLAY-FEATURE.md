# Fitur Unlist Live Replay

## Deskripsi
Fitur "Unlist replay when stream ends" memungkinkan video replay otomatis berubah menjadi unlisted setelah live stream selesai. Fitur ini mirip dengan opsi "Unlist live replay once stream ends" yang ada di YouTube Studio Dashboard.

## Cara Kerja

### 1. UI (User Interface)
- Opsi toggle switch tersedia di form Create Broadcast
- Lokasi: Section "Stream Settings" di bawah Tags
- Default: **Aktif (ON)**
- User dapat mengaktifkan/menonaktifkan sesuai kebutuhan

### 2. Backend Process
Saat stream selesai, sistem akan:
1. Cek apakah broadcast memiliki setting `unlistReplayOnEnd = true`
2. Jika ya, panggil YouTube API untuk update privacy status menjadi "unlisted"
3. Log hasil operasi (success/error)

### 3. Implementasi Teknis

**File yang terlibat:**
- `views/youtube.ejs` - UI toggle switch
- `public/js/youtube.js` - Handle form submission
- `services/youtubeService.js` - Method `unlistBroadcast()`
- `services/streamingService.js` - Method `handleUnlistReplayOnEnd()`
- `models/YouTubeBroadcastSettings.js` - Simpan setting per broadcast
- `db/database.js` - Field `unlist_replay_on_end` di tabel

**Flow:**
```
User Create Broadcast (dengan unlist ON)
  ↓
Setting disimpan ke database (youtube_broadcast_settings)
  ↓
Stream dimulai dan berjalan
  ↓
Stream selesai (stopStream)
  ↓
handleUnlistReplayOnEnd() dipanggil
  ↓
Cek setting unlistReplayOnEnd
  ↓
Jika true → panggil youtubeService.unlistBroadcast()
  ↓
YouTube API update privacy status → unlisted
```

## Keuntungan
1. **Privasi otomatis** - Replay tidak langsung public setelah stream
2. **Kontrol penuh** - User bisa review/edit replay sebelum dipublikasikan
3. **Fleksibel** - Bisa diaktifkan/nonaktifkan per broadcast
4. **Sesuai YouTube** - Mengikuti fitur yang sudah ada di YouTube Studio

## Catatan
- Fitur ini hanya bekerja untuk broadcast yang dibuat melalui aplikasi
- Memerlukan YouTube API credentials yang valid
- Privacy status hanya berubah setelah stream benar-benar selesai
- Jika API call gagal, akan di-log tapi tidak mengganggu proses stop stream
