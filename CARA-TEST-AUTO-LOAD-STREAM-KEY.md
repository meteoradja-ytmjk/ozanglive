# 🚀 Cara Test Auto-Load Stream Key di Control Room

## ⚡ Quick Test (30 detik)

### Step 1: Buka Control Room
1. Login ke aplikasi
2. Klik tab **"Control Room"**
3. Klik tombol **"+ New Stream"** (tombol hijau)

### Step 2: Pilih YouTube Account
1. Di modal yang muncul, lihat dropdown **"YouTube Account"**
2. Pilih salah satu YouTube channel yang sudah connected
3. **Tunggu 1-2 detik...**

### Step 3: Verify Auto-Load ✅
**Harus terjadi secara OTOMATIS:**
- ✅ Dropdown "Stream Key" langsung terisi dengan list stream keys
- ✅ Stream key pertama otomatis ter-select (tidak perlu klik lagi!)
- ✅ Muncul indicator hijau: **"✓ Stream key loaded"**
- ✅ Toast notification: "✓ Auto-loaded stream key from your channel"

### Step 4: Verify Hidden Input
```javascript
// Buka browser console (F12), paste ini:
console.log(document.getElementById('controlRoomStreamKeyValue').value);
// Harus muncul stream key value (panjang ~30-40 karakter)
```

### Step 5: Test Create Stream
1. Pilih Video
2. Isi Stream Title
3. Klik **"Start Stream"**
4. ✅ Stream harus berhasil dibuat!

---

## 🎯 Expected Results

### ✅ Success Indicators:
1. **Visual:** Indicator "✓ Stream key loaded" (warna hijau)
2. **Notification:** Toast message muncul di kanan atas
3. **Dropdown:** Stream key sudah ter-select (tidak "Create new")
4. **Hidden Input:** Value terisi (check via console)
5. **Console Logs:** Banyak log dengan prefix `[Control Room]`

### ❌ Jika Ada Masalah:

#### Problem 1: Stream key tidak auto-load
**Debug:**
```javascript
// Check function availability
console.log(typeof window.onControlRoomAccountChange); // harus "function"
console.log(typeof window.fetchControlRoomStreamKeys); // harus "function"
```

#### Problem 2: Dropdown kosong
**Debug:**
```javascript
// Test API manually
fetch('/api/youtube/streams?accountId=1')
  .then(r => r.json())
  .then(d => console.log('API Response:', d));
```

#### Problem 3: Error di console
**Check:**
- Browser console untuk error messages (warna merah)
- Network tab untuk failed API calls
- Pastikan YouTube account masih connected

---

## 📊 Test Checklist

**Copy checklist ini untuk testing:**

```
□ Modal opens successfully
□ YouTube Account dropdown shows connected accounts
□ Select account → loading indicator appears
□ Stream keys dropdown populated (1-2 seconds)
□ First stream key automatically selected
□ Green indicator "✓ Stream key loaded" appears
□ Toast notification shows success message
□ Hidden input has value (check console)
□ Can select different stream key if needed
□ Can switch to manual mode
□ Can create new stream successfully
```

---

## 🔄 Test Different Scenarios

### Scenario A: Account dengan Stream Keys
```
1. Pilih account yang sudah punya stream keys
2. Expected: Auto-load stream key pertama ✅
```

### Scenario B: Account Tanpa Stream Keys
```
1. Pilih account yang belum punya stream keys
2. Expected: Show "Create new stream key" + info toast ✅
```

### Scenario C: Switch Between Accounts
```
1. Pilih Account A → verify auto-load
2. Pilih Account B → verify auto-load
3. Expected: Smooth transition, stream keys update ✅
```

### Scenario D: Manual Mode
```
1. Pilih "-- Manual Stream Key --"
2. Expected: Show manual text input ✅
```

---

## 💡 Tips

### Tip 1: Lihat Console Logs
Browser console (F12) akan menampilkan detailed logs:
```
[Control Room] Account changed to: 1
[Control Room] Switching to AUTO mode
[Control Room] fetchControlRoomStreamKeys called with accountId: 1
[Control Room] Fetching stream keys from: /api/youtube/streams?accountId=1
[Control Room] Found 3 stream keys
[Control Room] Auto-selected first stream key: My Gaming Stream
[Control Room] Stream key changed to: abc123
[Control Room] Selected stream key: SET
```

### Tip 2: Check Network Tab
Di Developer Tools → Network:
- Look for: `GET /api/youtube/streams?accountId=1`
- Status: Should be `200 OK`
- Response: Should contain `{success: true, streams: [...]}`

### Tip 3: Verify Elements
```javascript
// Quick element check
console.log({
  accountSelect: !!document.getElementById('controlRoomAccountSelect'),
  streamKeySelect: !!document.getElementById('controlRoomStreamKeySelect'),
  streamKeyValue: !!document.getElementById('controlRoomStreamKeyValue'),
  indicator: !!document.getElementById('controlRoomStreamKeyAutoFillIndicator')
});
// All should be true
```

---

## 🎬 Video Test Script

**For screen recording:**

1. **Intro** (5 sec)
   - "Testing Control Room auto-load stream key"

2. **Before** (10 sec)
   - Show modal opening
   - Show empty state

3. **Action** (5 sec)
   - Select YouTube account from dropdown
   - Wait for auto-load

4. **Result** (10 sec)
   - Point to auto-selected stream key
   - Point to green indicator
   - Show toast notification

5. **Outro** (5 sec)
   - "Auto-load successful! ✅"

**Total: 30 seconds**

---

## 📱 Mobile Testing

If applicable, test on mobile:
1. Open on mobile browser
2. Navigate to Control Room
3. Verify auto-load works
4. Check touch interactions
5. Verify responsive design

---

## ⚙️ Advanced Testing

### Test API Endpoint Directly:
```bash
# With curl (if have access)
curl -X GET "http://localhost:3000/api/youtube/streams?accountId=1" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

### Test Multiple Accounts:
```javascript
// Simulate rapid account switching
['1', '2', '3'].forEach((id, index) => {
  setTimeout(() => {
    console.log(`\n=== Testing Account ${id} ===`);
    window.onControlRoomAccountChange(id);
  }, index * 3000);
});
```

### Stress Test:
```javascript
// Rapidly switch accounts
for (let i = 0; i < 10; i++) {
  setTimeout(() => {
    const accountId = (i % 3) + 1; // Cycle through accounts 1, 2, 3
    window.onControlRoomAccountChange(accountId.toString());
  }, i * 500);
}
```

---

## 📞 Get Help

**If auto-load doesn't work:**

1. Check documentation:
   - `CONTROL-ROOM-STREAM-KEY-AUTO-LOAD-FIX.md` (technical)
   - `TEST-CONTROL-ROOM-AUTO-LOAD.md` (detailed testing)
   - `STREAM-KEY-AUTO-LOAD-SUMMARY.md` (overview)

2. Debug steps:
   - Clear browser cache
   - Hard refresh (Ctrl+Shift+R)
   - Check console for errors
   - Verify YouTube account connection
   - Test API endpoint manually

3. Common issues:
   - Expired YouTube token → Reconnect account
   - Browser cache → Clear and refresh
   - API error → Check server logs
   - Network issue → Check internet connection

---

## ✅ Success!

**If semua checklist passed:**

🎉 **CONGRATULATIONS!** 🎉

Control Room stream key auto-load sudah bekerja sempurna!

User sekarang bisa:
1. Pilih channel → Stream key ready!
2. Klik "Start Stream" → Done!

**No more copy-paste! No more manual selection!** 🚀

---

*Last Updated: 2026-08-14*  
*Quick Test Duration: ~30 seconds*  
*Detailed Test Duration: ~5 minutes*
