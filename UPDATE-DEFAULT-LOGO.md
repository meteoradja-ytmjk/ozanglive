# Update Default Logo & Favicon - Monster Live

## 📋 Instruksi

Untuk menjadikan logo Monster Live sebagai default baru, ikuti langkah berikut:

### 1. Simpan Logo Monster Live

**Gambar Logo (Square - untuk icon):**
- Simpan gambar pertama (Monster dengan text "MONSTER LIVE" vertikal) sebagai:
  - `public/images/logo-default.png`
  - `public/images/favicon-default.png` (resize ke 64x64px untuk favicon)

**Gambar Logo (Horizontal - untuk header):**
- Simpan gambar kedua (Monster + "MONSTERLIVE" horizontal) sebagai:
  - `public/images/logo-default.png` (atau gunakan ini sebagai logo utama)

### 2. Cara Menyimpan Gambar

#### Opsi A: Manual (Recommended)
1. Buka folder: `public/images/`
2. Copy gambar Monster Live yang sudah Anda download
3. Rename menjadi: `logo-default.png`
4. Untuk favicon, resize gambar ke 64x64px atau 32x32px
5. Save sebagai: `favicon-default.png`

#### Opsi B: Via Upload Interface
1. Login sebagai admin
2. Go to Settings → Branding
3. Upload logo Monster Live
4. Upload favicon Monster Live
5. Kemudian jalankan script update (lihat step 3)

### 3. Update Database Default

Jalankan script Node.js untuk update default values di database:

```bash
node update-default-branding.js
```

Script ini akan:
- Update semua default values ke MonsterLive
- Set logo_path ke `/images/logo-default.png`
- Set favicon_path ke `/images/favicon-default.png`
- Update app_name ke "MonsterLive"
- Update company_name ke "MonsterLive Team"
- Update support_email ke "support@monsterlive.com"

### 4. Restart Aplikasi

```bash
# Stop aplikasi
# Kemudian start lagi
npm start
```

### 5. Test Reset Function

1. Login sebagai admin
2. Go to Settings → Branding
3. Ubah beberapa settings (logo, colors, text)
4. Click "Reset to Default"
5. ✅ Verify: Logo kembali ke Monster Live
6. ✅ Verify: Favicon kembali ke Monster Live
7. ✅ Verify: App name = "MonsterLive"
8. ✅ Verify: Company name = "MonsterLive Team"

---

## 📁 File Locations

```
public/images/
├── logo-default.png          ← Logo Monster Live (main)
├── favicon-default.png       ← Favicon Monster Live (32x32 or 64x64)
├── logo.svg                  ← Old OzangLive logo (keep for reference)
└── ...
```

---

## 🔄 Rollback ke OzangLive

Jika ingin kembali ke OzangLive sebagai default:

1. Edit `models/BrandingSettings.js`
2. Change default values:
   - `app_name: 'OzangLive'`
   - `logo_path: '/images/logo.png'`
   - `favicon_path: '/images/favicon.ico'`
3. Run: `node update-default-branding.js`
4. Restart aplikasi

---

## ✅ Verification Checklist

- [ ] Logo Monster Live saved as `logo-default.png`
- [ ] Favicon Monster Live saved as `favicon-default.png`
- [ ] Database updated with new defaults
- [ ] Application restarted
- [ ] Reset function tested
- [ ] Logo persists after reset
- [ ] Favicon persists after reset
- [ ] App name shows "MonsterLive"

---

## 📝 Notes

- Logo default akan digunakan untuk semua instalasi baru
- Reset akan mengembalikan ke logo Monster Live, bukan OzangLive
- Logo lama (OzangLive) tetap tersimpan untuk referensi
- User masih bisa upload logo custom mereka sendiri
