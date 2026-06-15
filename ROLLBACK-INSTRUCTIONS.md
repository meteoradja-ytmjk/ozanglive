# 🔄 Rollback Instructions - Performance Optimization

## ⚠️ Jika Anda Ingin Mengembalikan ke Kondisi Sebelumnya

### 🎯 Quick Rollback (Recommended)

Jika Anda menggunakan Git:

```bash
# Lihat perubahan
git status
git diff

# Rollback semua perubahan
git checkout app.js
git checkout views/gallery.ejs
git checkout views/dashboard.ejs
git checkout views/playlist.ejs

# Uninstall compression package
npm uninstall compression

# Restart aplikasi
pm2 restart ozanglive
```

---

## 📝 Manual Rollback (Step by Step)

### 1. Rollback Gzip Compression

**File:** `app.js`

#### A. Uninstall package:
```bash
npm uninstall compression
```

#### B. Hapus import di app.js (line ~16):
```javascript
// HAPUS BARIS INI:
const compression = require('compression'); // Performance: Gzip compression
```

#### C. Hapus middleware (sekitar line 750-760):
```javascript
// HAPUS BLOCK INI:
// ============================================
// PERFORMANCE OPTIMIZATION
// ============================================

// 1. Gzip Compression - Compress all responses (5x smaller files)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Compression level (0-9, 6 is balanced)
}));
```

---

### 2. Rollback Static Asset Caching

**File:** `app.js`

#### Ganti block caching dengan yang lama:

**HAPUS:**
```javascript
// 2. Static Asset Caching - Cache CSS, JS, Images in browser
app.use('/css', express.static(path.join(__dirname, 'public/css'), {
  maxAge: '7d', // Cache CSS for 7 days
  immutable: true
}));

app.use('/js', express.static(path.join(__dirname, 'public/js'), {
  maxAge: '7d', // Cache JS for 7 days
  immutable: true
}));

app.use('/images', express.static(path.join(__dirname, 'public/images'), {
  maxAge: '30d', // Cache images for 30 days
  immutable: true
}));

// Other static files (fonts, etc)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d' // Cache other files for 1 day
}));
```

**GANTI DENGAN:**
```javascript
app.use(express.static(path.join(__dirname, 'public')));
```

---

### 3. Rollback Image Lazy Loading

#### A. File: `views/gallery.ejs`

**Cari dan ganti:**
```html
<!-- DARI: -->
<img src="<%= video.thumbnail_path %>" alt="<%= video.title %>" class="w-full h-full object-cover" loading="lazy">

<!-- KE: -->
<img src="<%= video.thumbnail_path %>" alt="<%= video.title %>" class="w-full h-full object-cover">
```

#### B. File: `views/dashboard.ejs`

**Cari dan ganti (2 tempat):**
```html
<!-- DARI: -->
loading="lazy"

<!-- KE: -->
(hapus attribute loading="lazy")
```

#### C. File: `views/playlist.ejs`

**Cari dan ganti (5 tempat):**
```html
<!-- DARI: -->
loading="lazy"

<!-- KE: -->
(hapus attribute loading="lazy")
```

---

## 🔍 Cara Cepat: Find & Replace

### Untuk Lazy Loading:

1. Buka file di editor
2. Find: `loading="lazy"`
3. Replace with: (kosong)
4. Replace All

**Files:**
- `views/gallery.ejs`
- `views/dashboard.ejs`
- `views/playlist.ejs`

---

## ✅ Verifikasi Rollback

Setelah rollback, test:

```bash
# 1. Check syntax
node -c app.js

# 2. Restart aplikasi
pm2 restart ozanglive

# 3. Check logs
pm2 logs ozanglive --lines 50

# 4. Test di browser
# Buka http://your-server:7575
```

---

## 🆘 Emergency Rollback (Nuclear Option)

Jika semua cara di atas gagal:

### Option 1: Git Reset (Jika menggunakan Git)
```bash
# Lihat commit terakhir sebelum optimization
git log --oneline

# Reset ke commit sebelumnya
git reset --hard HEAD~1

# Reinstall dependencies
npm install

# Restart
pm2 restart ozanglive
```

### Option 2: Restore dari Backup
```bash
# Jika Anda punya backup database
cp db/streamflow.db.backup db/streamflow.db

# Reinstall fresh
rm -rf node_modules
npm install

# Restart
pm2 restart ozanglive
```

### Option 3: Fresh Install
```bash
# Backup data dulu!
cp -r db db.backup
cp -r public/uploads uploads.backup

# Clone fresh dari repo
cd ..
git clone https://github.com/meteoradja-ytmjk/ozanglive ozanglive-fresh
cd ozanglive-fresh

# Restore data
cp -r ../ozanglive/db .
cp -r ../ozanglive/public/uploads public/

# Install & run
npm install
pm2 start ecosystem.config.js
```

---

## 📞 Troubleshooting

### Issue: npm uninstall compression error
```bash
rm -rf node_modules
rm package-lock.json
npm install
```

### Issue: Aplikasi tidak mau start
```bash
# Check logs
pm2 logs ozanglive --lines 100

# Check syntax
node -c app.js

# Force restart
pm2 delete ozanglive
pm2 start ecosystem.config.js
```

### Issue: Masih ada cache di browser
```bash
# Clear browser cache:
# Chrome: Ctrl+Shift+Delete
# Firefox: Ctrl+Shift+Delete
# Safari: Cmd+Option+E
```

---

## 💾 Backup Sebelum Rollback

**PENTING:** Backup dulu sebelum rollback!

```bash
# Backup files
cp app.js app.js.optimized
cp views/gallery.ejs views/gallery.ejs.optimized
cp views/dashboard.ejs views/dashboard.ejs.optimized
cp views/playlist.ejs views/playlist.ejs.optimized

# Backup database
cp db/streamflow.db db/streamflow.db.backup
```

---

## 📋 Checklist Rollback

- [ ] Backup files penting
- [ ] Uninstall compression package
- [ ] Hapus compression import di app.js
- [ ] Hapus compression middleware di app.js
- [ ] Ganti static caching ke default
- [ ] Hapus loading="lazy" dari gallery.ejs
- [ ] Hapus loading="lazy" dari dashboard.ejs
- [ ] Hapus loading="lazy" dari playlist.ejs
- [ ] Test syntax: `node -c app.js`
- [ ] Restart: `pm2 restart ozanglive`
- [ ] Check logs: `pm2 logs ozanglive`
- [ ] Test di browser
- [ ] Clear browser cache
- [ ] Verify aplikasi berjalan normal

---

## ✨ Re-apply Optimization

Jika Anda ingin apply optimization lagi setelah rollback:

1. Pastikan backup masih ada:
   - `app.js.optimized`
   - `views/*.ejs.optimized`

2. Copy kembali:
   ```bash
   cp app.js.optimized app.js
   cp views/gallery.ejs.optimized views/gallery.ejs
   cp views/dashboard.ejs.optimized views/dashboard.ejs
   cp views/playlist.ejs.optimized views/playlist.ejs
   ```

3. Install compression:
   ```bash
   npm install compression
   ```

4. Restart:
   ```bash
   pm2 restart ozanglive
   ```

---

**Semoga tidak perlu rollback! 😊**

Tapi jika perlu, instruksi di atas akan membantu Anda kembali ke kondisi semula dengan aman.
