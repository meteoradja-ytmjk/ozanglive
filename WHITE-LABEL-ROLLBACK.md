# 🔄 White Label Rollback Instructions

## ⚠️ **Jika Anda Ingin Menghapus Fitur White Label**

Jika fitur White Label tidak cocok atau menyebabkan masalah, ikuti instruksi ini untuk rollback.

---

## 🎯 **Quick Rollback (Recommended)**

Jika Anda menggunakan Git:

```bash
# Lihat perubahan
git status
git log --oneline -5

# Rollback ke commit sebelum white label
git revert HEAD
# atau
git reset --hard <commit-id-sebelum-white-label>

# Restart aplikasi
pm2 restart ozanglive
```

---

## 📝 **Manual Rollback (Step by Step)**

### **Step 1: Hapus Files Baru**

```bash
# Hapus model
rm models/BrandingSettings.js

# Hapus middleware
rm middleware/brandingMiddleware.js

# Hapus partial view
rm views/partials/branding-settings.ejs

# Hapus dokumentasi
rm WHITE-LABEL-GUIDE.md
rm WHITE-LABEL-ROLLBACK.md

# Hapus folder upload branding
rm -rf public/uploads/branding
```

---

### **Step 2: Rollback Database**

#### **Option A: Drop Table (Recommended)**
```bash
# Masuk ke database
sqlite3 db/streamflow.db

# Drop branding table
DROP TABLE IF EXISTS branding_settings;

# Exit
.exit
```

#### **Option B: Keep Table, Reset Data**
```bash
sqlite3 db/streamflow.db
DELETE FROM branding_settings WHERE id = 1;
.exit
```

---

### **Step 3: Rollback app.js**

#### **A. Remove Imports**

**Cari dan hapus baris ini (sekitar line 18-19):**
```javascript
const BrandingSettings = require('./models/BrandingSettings'); // White Label
const { loadBrandingSettings, clearBrandingCache } = require('./middleware/brandingMiddleware'); // White Label
```

#### **B. Remove Middleware**

**Cari dan hapus baris ini (sekitar line 743):**
```javascript
// White Label: Load branding settings for all views
app.use(loadBrandingSettings);
```

#### **C. Remove API Endpoints**

**Cari dan hapus block ini (sekitar line 1605-1730):**
```javascript
// ============================================
// WHITE LABEL API ENDPOINTS
// ============================================

// Get current branding settings
app.get('/api/branding', isAdmin, async (req, res) => {
  // ... semua code sampai ...
});

// ... semua branding endpoints ...

// ============================================
// END WHITE LABEL API ENDPOINTS
// ============================================
```

**⚠️ Note:** Mungkin ada duplikat API endpoints, hapus semua yang berhubungan dengan `/api/branding`

---

### **Step 4: Rollback database.js**

#### **A. Remove from REQUIRED_TABLES**

**File:** `db/database.js` (sekitar line 14-18)

**Dari:**
```javascript
const REQUIRED_TABLES = [
  'users', 'videos', 'streams', 'stream_history',
  'playlists', 'playlist_videos', 'playlist_audios', 'audios',
  'system_settings', 'stream_templates', 'youtube_credentials',
  'broadcast_templates', 'recurring_schedules', 'branding_settings'
];
```

**Ke:**
```javascript
const REQUIRED_TABLES = [
  'users', 'videos', 'streams', 'stream_history',
  'playlists', 'playlist_videos', 'playlist_audios', 'audios',
  'system_settings', 'stream_templates', 'youtube_credentials',
  'broadcast_templates', 'recurring_schedules'
];
```

#### **B. Remove Table Creation**

**Cari dan hapus block ini (di akhir function createCoreTablesAsync):**
```javascript
// Create branding_settings table for white label customization
await runTableQuery(`CREATE TABLE IF NOT EXISTS branding_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_name TEXT DEFAULT 'OzangLive',
  company_name TEXT DEFAULT 'OzangLive Team',
  logo_path TEXT DEFAULT '/images/logo.png',
  favicon_path TEXT DEFAULT '/images/favicon.ico',
  primary_color TEXT DEFAULT '#8B5CF6',
  secondary_color TEXT DEFAULT '#7C3AED',
  accent_color TEXT DEFAULT '#6D28D9',
  login_background TEXT,
  custom_css TEXT,
  footer_text TEXT DEFAULT '© 2024 OzangLive. All rights reserved.',
  support_email TEXT DEFAULT 'support@ozanglive.com',
  support_url TEXT,
  show_powered_by INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, 'branding_settings');
```

---

### **Step 5: Rollback settings.ejs**

#### **A. Remove Branding Tab Button**

**Cari dan hapus button ini (sekitar line 40-45):**
```html
<button
  class="settings-tab mr-2 py-2 px-4 text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-700 font-medium"
  data-tab="branding">
  <i class="ti ti-palette mr-2"></i>Branding
</button>
```

**Dan di mobile tabs juga (sekitar line 85-90):**
```html
<button
  class="settings-tab py-3 flex flex-col items-center justify-center text-gray-400 border-b-2 border-transparent"
  data-tab="branding">
  <i class="ti ti-palette text-lg mb-1"></i>
  <span class="text-xs font-medium">Brand</span>
</button>
```

#### **B. Remove Branding Content**

**Cari dan hapus baris ini:**
```html
<%- include('partials/branding-settings') %>
```

---

### **Step 6: Rollback layout.ejs**

#### **A. Revert Title**

**Dari:**
```html
<title>
  <%= title %> - <%= typeof branding !== 'undefined' ? branding.app_name : 'StreamFlow' %>
</title>
```

**Ke:**
```html
<title><%= title %> - StreamFlow</title>
```

#### **B. Revert Favicon**

**Dari:**
```html
<link rel="icon" href="<%= typeof branding !== 'undefined' ? branding.favicon_path : '/images/logo.svg' %>" type="image/x-icon">
```

**Ke:**
```html
<link rel="icon" href="/images/logo.svg" type="image/x-icon">
```

#### **C. Revert Colors**

**Dari:**
```javascript
colors: {
  'primary': '<%= typeof branding !== "undefined" ? branding.primary_color : "#8B5CF6" %>',
  'secondary': '<%= typeof branding !== "undefined" ? branding.secondary_color : "#7C3AED" %>',
  'accent': '<%= typeof branding !== "undefined" ? branding.accent_color : "#A78BFA" %>',
```

**Ke:**
```javascript
colors: {
  'primary': '#8B5CF6',
  'secondary': '#7C3AED',
  'accent': '#A78BFA',
```

#### **D. Revert Logo**

**Cari semua logo image tags dan ganti:**

**Dari:**
```html
<img src="<%= typeof branding !== 'undefined' ? branding.logo_path : '/images/logo_mobile.svg' %>" alt="<%= typeof branding !== 'undefined' ? branding.app_name : 'StreamFlow' %> Logo" class="h-8">
```

**Ke:**
```html
<img src="/images/logo_mobile.svg" alt="StreamFlow Logo" class="h-8">
```

#### **E. Remove Custom CSS**

**Cari dan hapus block ini:**
```html
<!-- White Label: Custom CSS -->
<% if (typeof branding !== 'undefined' && branding.custom_css) { %>
<style>
  <%= branding.custom_css %>
</style>
<% } %>
```

---

### **Step 7: Restart Application**

```bash
# Restart dengan PM2
pm2 restart ozanglive

# Atau jika tidak pakai PM2
npm start
```

---

### **Step 8: Verify Rollback**

1. ✅ Buka aplikasi di browser
2. ✅ Check Settings → Branding tab hilang
3. ✅ Check logo kembali ke default
4. ✅ Check warna kembali ke ungu default
5. ✅ Check browser console tidak ada error
6. ✅ Check server logs: `pm2 logs ozanglive`

---

## 🆘 **Emergency Rollback (Nuclear Option)**

Jika manual rollback terlalu kompleks:

### **Option 1: Git Reset**
```bash
# Lihat commit sebelum white label
git log --oneline

# Reset ke commit tersebut
git reset --hard <commit-id>

# Force push (jika sudah push ke remote)
git push -f origin main

# Reinstall dependencies
npm install

# Restart
pm2 restart ozanglive
```

### **Option 2: Fresh Install**
```bash
# Backup data
cp -r db db.backup
cp -r public/uploads uploads.backup

# Clone fresh
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

## 📋 **Rollback Checklist**

- [ ] Backup database: `cp db/streamflow.db db/streamflow.db.backup`
- [ ] Backup uploads: `cp -r public/uploads uploads.backup`
- [ ] Remove BrandingSettings.js
- [ ] Remove brandingMiddleware.js
- [ ] Remove branding-settings.ejs
- [ ] Remove documentation files
- [ ] Drop branding_settings table
- [ ] Remove imports from app.js
- [ ] Remove middleware from app.js
- [ ] Remove API endpoints from app.js
- [ ] Remove from REQUIRED_TABLES in database.js
- [ ] Remove table creation in database.js
- [ ] Remove branding tab from settings.ejs
- [ ] Remove branding include from settings.ejs
- [ ] Revert title in layout.ejs
- [ ] Revert favicon in layout.ejs
- [ ] Revert colors in layout.ejs
- [ ] Revert logo in layout.ejs
- [ ] Remove custom CSS in layout.ejs
- [ ] Restart application
- [ ] Test aplikasi
- [ ] Verify no errors in logs

---

## 🐛 **Troubleshooting Rollback**

### **Issue: Database error after rollback**
```bash
# Reset database completely
rm db/streamflow.db
npm start
# Database akan recreate otomatis
```

### **Issue: Application won't start**
```bash
# Check syntax errors
node -c app.js

# Check logs
pm2 logs ozanglive --lines 100

# Force restart
pm2 delete ozanglive
pm2 start ecosystem.config.js
```

### **Issue: Still seeing branding UI**
```bash
# Clear browser cache
# Hard refresh: Ctrl+Shift+R

# Clear server cache
pm2 restart ozanglive --update-env
```

---

## 💾 **Backup Before Rollback**

**PENTING:** Selalu backup sebelum rollback!

```bash
# Backup database
cp db/streamflow.db db/streamflow.db.before-rollback

# Backup uploads
tar -czf uploads-backup.tar.gz public/uploads/

# Backup code (jika tidak pakai git)
tar -czf ozanglive-backup.tar.gz .
```

---

## 📞 **Need Help?**

Jika Anda kesulitan rollback:

1. Check error logs: `pm2 logs ozanglive`
2. Check browser console for errors
3. Try emergency rollback (git reset)
4. Contact support with error details

---

**Good luck with rollback! 🔄**

Semoga tidak perlu rollback, tapi jika perlu, instruksi ini akan membantu! 😊
