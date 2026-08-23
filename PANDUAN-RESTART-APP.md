# 🔄 Panduan Restart Aplikasi - Untuk Mendapatkan Perubahan Terbaru

## 🎯 Masalah: Aplikasi Belum Ada Perubahan

Jika setelah commit ke GitHub, aplikasi masih belum berubah, ikuti panduan ini.

---

## ⚡ CARA TERCEPAT (Recommended)

### Option 1: Double-Click Script
```
1. Cari file: RESTART-APP-WITH-LATEST.bat
2. Double-click file tersebut
3. Tunggu proses selesai
4. Aplikasi akan restart otomatis
```

**Script ini akan:**
- ✅ Stop aplikasi yang sedang running
- ✅ Pull latest changes dari GitHub
- ✅ Clear npm cache
- ✅ Install dependencies baru (jika ada)
- ✅ Start aplikasi

---

## 🚀 3 SCRIPT YANG TERSEDIA

### 1. **RESTART-APP-WITH-LATEST.bat** ⭐ RECOMMENDED
```
Fungsi:
- Stop app
- Pull dari GitHub
- Clear cache
- Install dependencies
- Start app

Kapan Pakai:
- Setelah ada commit baru di GitHub
- Untuk mendapat perubahan terbaru

Cara Pakai:
Double-click file RESTART-APP-WITH-LATEST.bat
```

### 2. **QUICK-RESTART.bat** ⚡ FASTEST
```
Fungsi:
- Stop app
- Start app (tanpa pull)

Kapan Pakai:
- Sudah pull manual sebelumnya
- Cuma perlu restart cepat

Cara Pakai:
Double-click file QUICK-RESTART.bat
```

### 3. **FULL-CLEAN-RESTART.bat** 🔧 FULL CLEAN
```
Fungsi:
- Stop app
- Pull dari GitHub
- Clear cache TOTAL
- Install ulang dependencies
- Start app

Kapan Pakai:
- Perubahan masih belum muncul
- Ada masalah cache persistent
- Setelah update besar

Cara Pakai:
Double-click file FULL-CLEAN-RESTART.bat
(Lebih lama tapi lebih thorough)
```

---

## 📝 CARA MANUAL (Jika Script Tidak Berfungsi)

### Step 1: Stop Aplikasi
```cmd
# Buka Command Prompt atau PowerShell
# Tekan Ctrl+C di terminal yang menjalankan app
# ATAU jalankan command ini:
taskkill /F /IM node.exe
```

### Step 2: Pull Latest Changes
```cmd
cd d:\streamflow-ozanglive
git pull origin feature/professional-stream-key-selector
```

**Expected Output:**
```
Updating ddfdeb1..9aea6a7
Fast-forward
 public/js/stream-modal.js  | 20 ++++++++++++++++++++
 views/dashboard.ejs        |  1 +
 3 files changed, 403 insertions(+)
```

### Step 3: Clear Cache (Optional tapi Recommended)
```cmd
npm cache clean --force
```

### Step 4: Install Dependencies
```cmd
npm install
```

### Step 5: Start Aplikasi
```cmd
npm start
```

**Expected Output:**
```
Server running on port 3000
atau sesuai port aplikasi
```

---

## 🌐 PENTING: Clear Browser Cache!

**Setelah restart app, HARUS clear browser cache:**

### Chrome / Edge:
```
1. Tekan Ctrl + Shift + Delete
2. Pilih "Cached images and files"
3. Click "Clear data"

ATAU Hard Refresh:
Ctrl + Shift + R (di halaman aplikasi)
```

### Firefox:
```
1. Tekan Ctrl + Shift + Delete
2. Pilih "Cache"
3. Click "Clear Now"

ATAU Hard Refresh:
Ctrl + F5
```

---

## ✅ CHECKLIST SETELAH RESTART

Setelah app restart & browser cache di-clear, check:

```
□ Git pull berhasil (lihat commit 9aea6a7)
□ App starting tanpa error
□ Browser cache cleared (Ctrl+Shift+R)
□ Buka aplikasi di browser
□ Login (jika perlu)
□ Buka tab Control Room
□ Klik "+ New Stream"
□ Pilih YouTube Account

EXPECTED RESULT:
□ Manual input "Paste your YouTube stream key..." HILANG
□ Dropdown stream key selector MUNCUL
□ Stream key pertama AUTO-SELECTED
□ Green indicator: "✓ Stream key loaded"
□ Toast notification muncul
```

---

## 🐛 TROUBLESHOOTING

### Problem 1: Script Tidak Jalan / Error

**Solution:**
```cmd
# Jalankan manual di Command Prompt:
cd d:\streamflow-ozanglive
taskkill /F /IM node.exe
git pull origin feature/professional-stream-key-selector
npm install
npm start
```

---

### Problem 2: Git Pull Error "Your local changes..."

**Solution:**
```cmd
# Stash local changes dulu
git stash
git pull origin feature/professional-stream-key-selector
git stash pop
```

---

### Problem 3: Port Already in Use

**Solution:**
```cmd
# Kill process di port 3000 (atau port yang dipakai)
netstat -ano | findstr :3000
# Cari PID di kolom terakhir, lalu:
taskkill /F /PID <PID_NUMBER>

# Atau kill semua node
taskkill /F /IM node.exe
```

---

### Problem 4: Perubahan Masih Belum Muncul

**Solution:**
```
1. Stop app (Ctrl+C atau taskkill)
2. Close browser COMPLETELY
3. Pull lagi: git pull origin feature/professional-stream-key-selector
4. Verify latest commit: git log --oneline -1
   Should show: 9aea6a7
5. Start app: npm start
6. Open browser (NEW WINDOW)
7. Clear cache: Ctrl+Shift+Delete
8. Hard refresh: Ctrl+Shift+R
9. Test Control Room
```

---

### Problem 5: npm start Error

**Check:**
```cmd
# Check node version
node -v
# Should be v14+ or compatible

# Check npm version  
npm -v

# Check if dependencies installed
dir node_modules
# Should have many folders

# Reinstall if needed
rmdir /S /Q node_modules
npm install
```

---

## 🔍 VERIFY CHANGES LOADED

**Check di Browser Console (F12):**

```javascript
// Should return "function" not "undefined"
typeof window.onControlRoomAccountChange
typeof window.fetchControlRoomStreamKeys
typeof window.onControlRoomStreamKeyChange

// Check if script loaded
document.querySelector('script[src*="stream-modal"]')
// Should return: <script src="/js/stream-modal.js?v=1.0.0">
```

**Check di Network Tab:**
```
1. F12 → Network tab
2. Refresh page (Ctrl+Shift+R)
3. Look for: stream-modal.js
4. Status should be: 200 OK
5. Size should NOT be "(disk cache)"
```

---

## 📊 COMPARISON

| Method | Speed | Thorough | When to Use |
|--------|-------|----------|-------------|
| **RESTART-APP-WITH-LATEST.bat** | ⭐⭐⭐ | ⭐⭐⭐⭐ | After GitHub commit |
| **QUICK-RESTART.bat** | ⭐⭐⭐⭐⭐ | ⭐⭐ | Quick restart only |
| **FULL-CLEAN-RESTART.bat** | ⭐⭐ | ⭐⭐⭐⭐⭐ | Changes not appearing |
| **Manual Steps** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Scripts not working |

---

## 🎯 QUICK REFERENCE

**Just Committed to GitHub? Use this:**
```
1. Double-click: RESTART-APP-WITH-LATEST.bat
2. Wait for app to start
3. Open browser
4. Ctrl + Shift + R (hard refresh)
5. Test Control Room
```

**Changes Still Not Showing? Try this:**
```
1. Double-click: FULL-CLEAN-RESTART.bat
2. Close ALL browser windows
3. Wait for app to start
4. Open NEW browser window
5. Clear cache (Ctrl+Shift+Delete)
6. Go to app & test
```

---

## 📞 Need Help?

**If still not working:**

1. Check git status:
   ```cmd
   git log --oneline -1
   ```
   Should show: `9aea6a7 fix: Include stream-modal.js...`

2. Check files exist:
   ```cmd
   dir views\dashboard.ejs
   dir public\js\stream-modal.js
   ```

3. Check browser console for errors (F12)

4. Take screenshots and share:
   - Terminal output
   - Browser console
   - Control Room modal

---

## ✅ SUCCESS!

**If you see this in Control Room:**
```
✅ Dropdown stream key selector (not manual input)
✅ Stream key auto-selected
✅ Green indicator: "✓ Stream key loaded"
✅ Toast: "Auto-loaded stream key from your channel"
```

**CONGRATULATIONS! IT WORKS!** 🎉

---

*Last Updated: August 14, 2026*  
*For Commit: 9aea6a7*  
*Status: Ready to Use*
