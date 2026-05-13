# 🎨 Cara Menyimpan Logo Monster Live sebagai Default

## 📥 Gambar yang Anda Upload

Anda telah mengupload 2 gambar Monster Live:

1. **Gambar 1 (Square)**: Monster merah dengan text "MONSTER LIVE" vertikal
2. **Gambar 2 (Horizontal)**: Monster merah + text "MONSTERLIVE" horizontal

## 🎯 Pilihan Logo

### Opsi A: Gunakan Gambar Horizontal (Recommended)
**Untuk Header/Navbar** - Lebih cocok untuk layout horizontal

```
Simpan sebagai: public/images/logo-default.png
Ukuran: Original (sudah pas untuk header)
```

### Opsi B: Gunakan Gambar Square
**Untuk Icon/Square Layout** - Lebih cocok untuk icon

```
Simpan sebagai: public/images/logo-default.png
Ukuran: Original atau resize ke 200x200px
```

## 📋 Langkah-langkah Detail

### Step 1: Download Gambar dari Chat
1. Klik kanan pada gambar Monster Live di chat
2. Pilih "Save image as..."
3. Simpan dengan nama sementara (misal: `monster-logo.png`)

### Step 2: Simpan ke Folder Project

#### Untuk Logo Utama:
```bash
# Copy gambar ke folder project
# Dari: Downloads/monster-logo.png
# Ke: public/images/logo-default.png

# Windows Command:
copy "%USERPROFILE%\Downloads\monster-logo.png" "public\images\logo-default.png"
```

#### Untuk Favicon:
Anda perlu resize gambar ke ukuran kecil (32x32 atau 64x64 pixels)

**Cara Resize:**
1. Buka gambar dengan Paint atau aplikasi image editor
2. Resize ke 64x64 pixels (atau 32x32)
3. Save as: `public/images/favicon-default.png`

**Atau gunakan online tool:**
- https://www.iloveimg.com/resize-image
- Upload gambar Monster
- Resize ke 64x64 pixels
- Download dan save sebagai `favicon-default.png`

### Step 3: Verifikasi File

Pastikan file ada di lokasi yang benar:

```
ozanglive/
└── public/
    └── images/
        ├── logo-default.png       ← Logo Monster Live (main)
        └── favicon-default.png    ← Favicon Monster Live (64x64)
```

### Step 4: Update Database

Jalankan script update:

```bash
node update-default-branding.js
```

Output yang diharapkan:
```
🔄 Updating default branding to MonsterLive...

📊 Current Settings:
   App Name: OzangLive
   Company: OzangLive Team
   Logo: /images/logo.png
   Favicon: /images/favicon.ico

✅ Default branding updated successfully!

📊 New Default Settings:
   App Name: MonsterLive
   Company: MonsterLive Team
   Logo: /images/logo-default.png
   Favicon: /images/favicon-default.png

🎉 Done! Please restart the application.
```

### Step 5: Restart Aplikasi

```bash
# Stop aplikasi (Ctrl+C jika running)
# Kemudian start lagi:
npm start
```

### Step 6: Test

1. Buka aplikasi di browser
2. ✅ Logo Monster Live muncul di header
3. ✅ Favicon Monster Live muncul di browser tab
4. Go to Settings → Branding
5. Upload logo lain (test)
6. Click "Reset to Default"
7. ✅ Logo kembali ke Monster Live
8. ✅ Favicon kembali ke Monster Live

---

## 🚀 Quick Method (Jika Sudah Ada File)

Jika Anda sudah punya file gambar Monster Live di komputer:

```bash
# Masuk ke folder project
cd c:\Users\KANTIN\OneDrive\Dokumen\OZANG\ozanglive-main\ozanglive

# Copy logo
copy "path\to\your\monster-logo.png" "public\images\logo-default.png"

# Copy favicon (yang sudah di-resize)
copy "path\to\your\monster-favicon.png" "public\images\favicon-default.png"

# Update database
node update-default-branding.js

# Restart
npm start
```

---

## 🎨 Rekomendasi Ukuran

| File | Ukuran Recommended | Format |
|------|-------------------|--------|
| Logo (Header) | 200x60px atau 300x90px | PNG, SVG |
| Logo (Square) | 200x200px | PNG |
| Favicon | 64x64px atau 32x32px | PNG, ICO |

---

## ❓ Troubleshooting

### Logo tidak muncul setelah restart
- Cek apakah file `logo-default.png` ada di `public/images/`
- Cek permission file (harus readable)
- Clear browser cache (Ctrl+F5)

### Favicon tidak berubah
- Clear browser cache
- Close dan buka browser lagi
- Cek file `favicon-default.png` ada dan ukurannya benar

### Error saat run update script
- Pastikan database tidak sedang digunakan
- Stop aplikasi dulu sebelum run script
- Cek koneksi database

---

## 📞 Need Help?

Jika ada masalah, beritahu saya dan saya akan bantu troubleshoot!

**Files yang perlu ada:**
- ✅ `public/images/logo-default.png`
- ✅ `public/images/favicon-default.png`
- ✅ `models/BrandingSettings.js` (sudah updated)
- ✅ `update-default-branding.js` (script update)
