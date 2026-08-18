# ⚡ Quick Fix - Control Room Stream Keys

## ✅ Code Already Fixed & Pushed!

Functions sudah exposed ke `window` object dan sudah di-push ke GitHub.

---

## 🚨 ACTION REQUIRED:

### Method 1: Restart Server (FASTEST)

```bash
# Stop dan start ulang server
pm2 restart ozanglive

# ATAU jika pakai npm
npm start
```

### Method 2: Hard Refresh Browser

```
Windows: Ctrl + Shift + R
Mac: Cmd + Shift + R

ATAU

1. F12 (buka DevTools)
2. Right-click tombol refresh
3. Select "Empty Cache and Hard Reload"
```

### Method 3: Clear Cache Completely

```
1. Ctrl + Shift + Delete
2. Time range: "All time"
3. Check: "Cached images and files"
4. Click "Clear data"
5. Restart browser
```

---

## 🧪 Quick Test

Setelah restart server / clear cache:

### Step 1: Test Functions
```javascript
// Buka console (F12), paste ini:
console.log({
  onAccountChange: typeof window.onControlRoomAccountChange,
  fetchStreamKeys: typeof window.fetchControlRoomStreamKeys,
  onStreamKeyChange: typeof window.onControlRoomStreamKeyChange
});

// Harus return semua "function"
```

### Step 2: Test Auto-Load
```
1. Navigate: Studio → Control Room
2. Click: "Create New Stream"
3. Account "NeuralWork" sudah terpilih
4. Lihat console → should see:
   [Control Room] Modal opened with account pre-selected...
   [Control Room] Fetching stream keys...
   [Control Room] Found X stream keys

5. UI should show:
   ✅ Dropdown (bukan manual input)
   ✅ Stream keys ter-list
   ✅ Toast notification
```

### Step 3: Test Manual Select
```
1. Dengan modal terbuka
2. Ganti account ke yang lain
3. Ganti kembali ke "NeuralWork"
4. Should trigger auto-load again
```

---

## 🎯 Expected Result:

**BEFORE (Current issue):**
```
[Screenshot menunjukkan manual input field]
```

**AFTER (Should be):**
```
YouTube Account
[NeuralWork                       ▼]

Stream Key * ✓ Auto-loaded
[🔑 Create new stream key         ▼]
[─────────────────────────────────  ]
[📋 Reuse Existing Stream Keys:    ]
[1. Stream Name (1920x1080 @ 30fps)]
[2. Stream Name (1280x720 @ 60fps) ]
```

---

## 🔍 If Still Not Working:

### Debug Command:
```javascript
// Paste di console:
const accountId = document.getElementById('controlRoomAccountSelect')?.value;
console.log('Selected Account ID:', accountId);

if (accountId) {
  console.log('Manually triggering...');
  window.onControlRoomAccountChange(accountId);
} else {
  console.log('No account selected');
}
```

### Check API:
```javascript
// Test API endpoint:
fetch('/api/youtube/streams?accountId=1', {
  headers: {'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content}
})
.then(r => r.json())
.then(d => console.log('API Response:', d));
```

---

## 📝 Verification Checklist:

- [ ] Server restarted
- [ ] Browser cache cleared
- [ ] Hard refresh done (Ctrl+Shift+R)
- [ ] Functions type = "function" in console
- [ ] Console shows [Control Room] logs
- [ ] UI switches from manual to dropdown
- [ ] Dropdown populates with stream keys
- [ ] Toast notification appears
- [ ] Can select stream key

---

## ✅ Summary:

**Problem**: Stream keys tidak auto-load di Control Room

**Root Cause**: 
1. Functions tidak exposed ke window (FIXED ✅)
2. Browser cache belum refresh (⏳ ACTION NEEDED)

**Solution**:
1. ✅ Code fixed & pushed to GitHub
2. ⏳ Restart server / clear browser cache
3. ⏳ Hard refresh browser
4. ✅ Test with console open

**Files Changed**:
- public/js/stream-modal.js (functions exposed)

**Commit**: ac326f9

**Status**: ✅ CODE READY, ⏳ NEEDS BROWSER REFRESH

---

**⚡ JUST RESTART SERVER & HARD REFRESH BROWSER!** ⚡
