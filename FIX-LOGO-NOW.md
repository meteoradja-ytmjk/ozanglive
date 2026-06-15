# 🚨 FIX LOGO SEKARANG - Step by Step

## Masalah:
- Logo masih menampilkan OzangLive
- Database belum dibuat/diupdate
- Logo Monster Live belum tersimpan

## ✅ Solusi Cepat (3 Langkah):

### LANGKAH 1: Fix Database

```bash
# Jalankan script ini untuk fix database
node fix-branding-table.js
```

**Output yang diharapkan:**
```
🔧 Fixing branding_settings table...
1️⃣ Dropping old branding_settings table...
✅ Old table dropped
2️⃣ Creating new branding_settings table with MonsterLive defaults...
✅ New table created
3️⃣ Inserting MonsterLive default values...
✅ Default values inserted
4️⃣ Verifying...
✅ Verification successful!
```

### LANGKAH 2: Upload Logo Monster Live via UI

1. **Start aplikasi** (jika belum running):
   ```bash
   npm start
   ```

2. **Login sebagai admin**

3. **Go to Settings → Branding tab**

4. **Upload Logo Monster Live**:
   - Click "Upload Logo" button
   - Pilih gambar Monster Live yang Anda punya
   - Wait for success message

5. **Upload Favicon** (optional):
   - Click "Upload Favicon" button
   - Pilih gambar Monster Live (resize ke 64x64 jika perlu)
   - Wait for success message

6. **Click "Save Branding"**

### LANGKAH 3: Set as Default

```bash
# Jalankan script ini untuk menjadikan logo yang diupload sebagai default
node set-uploaded-as-default.js
```

**Output yang diharapkan:**
```
🔍 Looking for uploaded branding files...
✅ Found 1 uploaded file(s):
   1. monster-logo-xxxxx.png
📌 Using: monster-logo-xxxxx.png
📋 Copying to default locations...
   ✅ Copied to: logo-default.png
   ✅ Copied to: favicon-default.png
💾 Updating database...
   ✅ Database updated
🎉 Done! MonsterLive logo is now the default!
```

### LANGKAH 4: Restart & Verify

```bash
# Stop aplikasi (Ctrl+C)
# Start lagi
npm start
```

**Verify:**
1. Open browser
2. Clear cache (Ctrl+F5)
3. ✅ Logo Monster Live muncul
4. Go to Settings → Branding
5. Click "Reset to Default"
6. ✅ Logo tetap Monster Live (bukan OzangLive)

---

## 🎯 Alternatif: Manual Method

Jika Anda sudah punya file gambar Monster Live di komputer:

### Step 1: Save Logo Manually

```bash
# Copy logo Monster Live ke folder images
copy "C:\path\to\your\monster-logo.png" "public\images\logo-default.png"

# Copy favicon (resize dulu ke 64x64)
copy "C:\path\to\your\monster-favicon.png" "public\images\favicon-default.png"
```

### Step 2: Fix Database

```bash
node fix-branding-table.js
```

### Step 3: Restart

```bash
npm start
```

---

## 🔍 Troubleshooting

### Logo masih OzangLive setelah restart

**Cek 1: Apakah file logo-default.png ada?**
```bash
dir public\images\logo-default.png
```

Jika file size sangat kecil (< 1KB), itu placeholder. Anda perlu upload logo asli.

**Cek 2: Apakah database sudah diupdate?**
```bash
sqlite3 db\streamflow.db "SELECT app_name, logo_path FROM branding_settings;"
```

Harus menampilkan:
```
MonsterLive|/images/logo-default.png
```

**Cek 3: Clear browser cache**
```
Ctrl + F5 (hard refresh)
atau
Ctrl + Shift + Delete → Clear cache
```

### Script error: "no such table"

Database belum dibuat. Jalankan:
```bash
node fix-branding-table.js
```

### Script error: "file not found"

Pastikan Anda di folder project yang benar:
```bash
cd c:\Users\KANTIN\OneDrive\Dokumen\OZANG\ozanglive-main\ozanglive
```

---

## 📋 Quick Checklist

- [ ] Run: `node fix-branding-table.js`
- [ ] Start aplikasi
- [ ] Login as admin
- [ ] Upload Monster Live logo via Settings → Branding
- [ ] Run: `node set-uploaded-as-default.js`
- [ ] Restart aplikasi
- [ ] Clear browser cache (Ctrl+F5)
- [ ] Verify logo shows Monster Live
- [ ] Test reset button

---

## 🎉 Expected Result

**Before:**
```
Logo: OzangLive
App Name: OzangLive
Reset → OzangLive
```

**After:**
```
Logo: Monster Live ✅
App Name: MonsterLive ✅
Reset → Monster Live ✅
```

---

## 📞 Still Not Working?

Jika masih belum berhasil, beritahu saya dan saya akan troubleshoot lebih lanjut!

**Info yang perlu:**
1. Output dari `node fix-branding-table.js`
2. Screenshot logo yang muncul
3. Output dari: `sqlite3 db\streamflow.db "SELECT * FROM branding_settings;"`
