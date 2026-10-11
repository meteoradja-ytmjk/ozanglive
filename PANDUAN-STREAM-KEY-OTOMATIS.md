# 🎯 Panduan: Stream Key Otomatis di Control Room

## ✨ Fitur Baru yang Lebih Profesional!

Sekarang sistem **OTOMATIS** memilih stream key dari channel YouTube yang Anda tentukan. Tidak perlu input manual lagi! 🎉

## 🎬 Cara Menggunakan

### 1️⃣ Buka Control Room
- Klik tab **Studio** di navigation bar
- Klik button **Control Room** (icon broadcast)
- Klik button **"Create Broadcast"** (merah dengan icon +)

### 2️⃣ Modal Terbuka Otomatis
Modal akan terbuka dan **OTOMATIS**:
- ✅ Memuat stream keys dari channel Anda
- ✅ Menampilkan loading indicator
- ✅ Mengisi dropdown dengan stream keys yang tersedia

### 3️⃣ Pilih Stream Key
Anda akan melihat dropdown seperti ini:

```
Stream Key ✓ Auto-loaded
┌─────────────────────────────────────────────┐
│ 🔑 Create new stream key                    │ ← Default (buat baru)
│ ───────────────────────────────────────────│
│ 📋 Reuse Existing Stream Keys:              │
│ 1. My Live Stream (1920x1080 @ 30fps)      │ ← Pilih untuk reuse
│ 2. Gaming Stream (1280x720 @ 60fps)        │
│ 3. Test Broadcast (1920x1080 @ 60fps)      │
└─────────────────────────────────────────────┘

ℹ️ Reuse existing stream keys or create a new one for this broadcast
```

**Pilihan Anda:**
- **Biarkan default** "🔑 Create new stream key" → System buat stream key baru
- **Pilih nomor 1, 2, atau 3** → Pakai ulang stream key yang sudah ada

### 4️⃣ Ganti Channel (Opsional)
Jika Anda ingin pakai channel YouTube yang berbeda:

1. Klik dropdown **"YouTube Account"**
2. Pilih channel lain
3. System **OTOMATIS**:
   - Tampilkan "⏳ Loading stream keys..."
   - Fetch stream keys dari channel baru
   - Update dropdown dengan data terbaru
   - Tampilkan notifikasi sukses

## 🎨 Visual Feedback

### Loading State
Saat system sedang fetch data:
```
⏳ Loading stream keys...  [spinner berputar]
```

### Success
Saat berhasil memuat stream keys:
```
✅ Toast Notification: "✓ Loaded 3 stream keys from your channel"
✓ Auto-loaded indicator (muncul 3 detik)
```

### Tidak Ada Stream Keys
Jika channel belum punya stream key:
```
ℹ️ Toast: "No existing stream keys found. A new one will be created."
Dropdown hanya menampilkan: 🔑 Create new stream key
```

### Error
Jika terjadi error (misal: koneksi terputus):
```
❌ Toast: "Failed to load stream keys. You can still create a new one."
Form tetap bisa digunakan! System akan buat stream key baru otomatis.
```

## 🔑 Keuntungan Fitur Ini

### Sebelumnya:
❌ Harus manual input stream key ID
❌ Tidak tahu stream keys apa yang tersedia
❌ Tidak ada feedback saat loading
❌ Susah untuk reuse stream key yang sama

### Sekarang:
✅ **Otomatis** memuat semua stream keys
✅ **Mudah pilih** dari dropdown (dengan nomor)
✅ **Visual feedback** untuk semua aksi
✅ **Profesional** dengan icons dan separator
✅ **Smart** - auto-refresh saat ganti channel
✅ **Robust** - tetap jalan walau ada error

## 💡 Tips & Trik

### Tip 1: Reuse Stream Keys untuk Konsistensi
Jika Anda stream dengan jadwal tetap (misal: setiap hari jam 7 malam), **reuse stream key yang sama**:
- Select existing stream key dari dropdown
- RTMP URL tetap sama
- OBS/Streamlabs tidak perlu update settings

### Tip 2: Create New untuk Event Khusus
Untuk event special atau one-time broadcast:
- Biarkan default "🔑 Create new stream key"
- System akan buat key baru khusus untuk event tersebut

### Tip 3: Numbering untuk Quick Reference
Stream keys diberi nomor (1, 2, 3):
- Mudah komunikasi dengan tim: "Pakai stream key nomor 2"
- Cepat diingat untuk daily broadcast

### Tip 4: Multi-Channel Management
Jika punya banyak channel YouTube:
1. Pilih channel dari dropdown "YouTube Account"
2. System auto-load stream keys untuk channel tersebut
3. Setiap channel punya set stream keys sendiri

## 🔧 Technical Notes

### Auto-Loading Trigger
Stream keys otomatis di-load saat:
- ✅ Modal "Create Broadcast" dibuka
- ✅ User ganti YouTube Account
- ✅ Page di-refresh (restore last selected account)

### Data Source
Stream keys diambil dari:
- **YouTube API** - `liveStreams.list`
- **Per Channel** - sesuai account yang dipilih
- **Real-time** - data terbaru dari YouTube

### Fallback Behavior
Jika fetch gagal:
- Form tetap bisa disubmit
- System create stream key baru otomatis
- Tidak ada blocking error
- User tidak kehilangan pekerjaan mereka

## 🆘 Troubleshooting

### "Token YouTube sudah expired"
**Solusi:**
1. Klik tab **Settings** → **YouTube Accounts**
2. Reconnect account yang expired
3. Refresh page
4. Stream keys lama akan tetap bisa dipakai

### "No stream keys found"
**Normal jika:**
- Channel baru (belum pernah buat stream)
- Semua stream lama sudah dihapus

**Action:**
- Biarkan default "Create new stream key"
- System akan buat otomatis saat broadcast dibuat

### Dropdown tidak ter-populate
**Check:**
1. Pastikan YouTube Account sudah terpilih
2. Check koneksi internet
3. Lihat toast notification untuk error message
4. Jika error, tetap bisa submit form

### Stream key tidak muncul di dropdown
**Kemungkinan:**
- Stream key sudah di-delete di YouTube Studio
- Token expired (reconnect account)
- Account tidak punya permission

**Action:**
- Rekoneksi YouTube Account
- Atau buat stream key baru

## 📊 Status Messages

| Message | Meaning | Action Required |
|---------|---------|-----------------|
| ✓ Auto-loaded | Stream keys berhasil dimuat | ✅ None |
| ⏳ Loading... | Sedang fetch dari YouTube | ⏳ Wait |
| ✓ Loaded X keys | Berhasil load X stream keys | ✅ None |
| No keys found | Channel tidak punya stream key | ℹ️ System akan buat baru |
| Failed to load | Error saat fetch | ⚠️ Masih bisa submit form |
| Token expired | Access token sudah expired | 🔄 Reconnect account |

## 🎓 Best Practices

### 1. Naming Convention
Beri nama stream key yang jelas di YouTube Studio:
```
✅ Good: "Daily Stream - Main", "Event 2024", "Gaming Session"
❌ Bad: "stream1", "test", "aaa"
```

### 2. Resolution & Frame Rate
Pilih berdasarkan konten:
- **1920x1080 @ 60fps** - Gaming, action-heavy
- **1920x1080 @ 30fps** - Talk show, podcast
- **1280x720 @ 30fps** - Mobile streaming, lower bandwidth

### 3. Reuse vs Create New
**Reuse when:**
- Daily/regular broadcast
- Same content type
- Want consistent RTMP URL

**Create new when:**
- Special event
- Different content type
- Testing purposes

## 🚀 Next Steps

Setelah pilih stream key:
1. ✅ Isi form lengkap (title, description, schedule, dll)
2. ✅ Upload thumbnail (optional)
3. ✅ Set privacy status
4. ✅ Klik **"Create Broadcast"**
5. ✅ System akan:
   - Create broadcast di YouTube
   - Bind ke stream key yang dipilih (atau buat baru)
   - Return RTMP URL & Stream Key
   - Siap untuk streaming!

## 📞 Need Help?

Jika ada masalah atau pertanyaan:
1. Check console browser (F12) untuk error messages
2. Check toast notifications untuk hints
3. Pastikan YouTube Account terkoneksi dengan benar
4. Coba refresh page dan ulangi

---

**Selamat Streaming! 🎥🚀**

Sistem ini dirancang untuk membuat hidup Anda lebih mudah. Jika ada feedback atau saran improvement, silakan sampaikan! 😊
