# 🧪 Test Guide - Control Room Stream Key Auto-Load

## 📋 Pre-requisites
- ✅ User account sudah login
- ✅ Minimal 1 YouTube account sudah connected
- ✅ YouTube account sudah punya stream keys (atau bisa create new)

## 🔍 Test Scenarios

### Test 1: Auto-Load Stream Key (Happy Path)

**Steps:**
1. Login ke aplikasi
2. Buka tab **Control Room**
3. Klik tombol **"+ New Stream"**
4. Di modal, pilih YouTube Account dari dropdown

**Expected Result:**
- ✅ Loading indicator muncul sebentar
- ✅ Dropdown "Stream Key" ter-populate dengan list stream keys
- ✅ **Stream key pertama otomatis ter-select**
- ✅ Indicator "✓ Stream key loaded" muncul (warna hijau)
- ✅ Toast notification: "✓ Auto-loaded stream key from your channel"
- ✅ Hidden input `controlRoomStreamKeyValue` sudah terisi

**Console Logs to Check:**
```
[Control Room] Account changed to: [account-id]
[Control Room] Switching to AUTO mode
[Control Room] fetchControlRoomStreamKeys called with accountId: [account-id]
[Control Room] Fetching stream keys from: /api/youtube/streams?accountId=[account-id]
[Control Room] Stream keys response: {success: true, streams: [...], accountId: [id]}
[Control Room] Found [X] stream keys
[Control Room] Auto-selected first stream key: [stream-title]
[Control Room] Stream key changed to: [stream-id]
[Control Room] Selected stream key: SET
```

---

### Test 2: Switch Between Accounts

**Steps:**
1. Pilih YouTube Account A
2. Tunggu stream key ter-load
3. Ganti ke YouTube Account B
4. Tunggu stream key ter-load

**Expected Result:**
- ✅ Account A: Stream key A ter-load otomatis
- ✅ Account B: Stream key B ter-load otomatis
- ✅ Setiap switch, dropdown ter-update dengan stream keys yang sesuai
- ✅ Indicator dan toast muncul setiap kali switch
- ✅ Previous stream key value ter-clear saat switch

---

### Test 3: Account Tanpa Stream Keys

**Steps:**
1. Pilih YouTube Account yang belum punya stream keys
2. Atau gunakan account baru yang fresh

**Expected Result:**
- ✅ Dropdown hanya show "🔑 Create new stream key"
- ✅ Toast notification: "No existing stream keys found. A new one will be created automatically."
- ✅ Indicator tetap hidden (karena belum ada stream key)
- ✅ Bisa proceed untuk create stream baru

---

### Test 4: Manual Mode Fallback

**Steps:**
1. Pilih option **"-- Manual Stream Key --"** (first option)

**Expected Result:**
- ✅ Dropdown stream key selector hilang
- ✅ Manual text input muncul
- ✅ Indicator "✓ Stream key loaded" hilang
- ✅ User bisa paste stream key manual
- ✅ Input field marked as `required`

**Console Logs:**
```
[Control Room] Account changed to: (empty string)
[Control Room] Switching to MANUAL mode
```

---

### Test 5: Select Different Stream Key

**Steps:**
1. Pilih YouTube Account (auto-load first stream key)
2. Buka dropdown stream key selector
3. Pilih stream key yang berbeda (option ke-2 atau ke-3)

**Expected Result:**
- ✅ Stream key value ter-update dengan yang dipilih
- ✅ Indicator "✓ Stream key loaded" tetap visible
- ✅ Console log menunjukkan stream key yang baru

**Console Logs:**
```
[Control Room] Stream key changed to: [new-stream-id]
[Control Room] Selected stream key: SET
[Control Room] RTMP URL: [rtmp-url]
```

---

### Test 6: Create New Stream Key Option

**Steps:**
1. Pilih YouTube Account
2. Dari dropdown stream key, pilih **"🔑 Create new stream key"**

**Expected Result:**
- ✅ Hidden input `controlRoomStreamKeyValue` ter-clear (empty)
- ✅ Indicator hilang
- ✅ Console log: "Will create new stream key"

---

### Test 7: Complete Stream Creation Flow

**Steps:**
1. Pilih YouTube Account → auto-load stream key
2. Pilih Video
3. (Optional) Pilih Audio
4. Isi Stream Title
5. Verify stream key sudah terisi
6. Klik "Start Stream"

**Expected Result:**
- ✅ Form submit berhasil
- ✅ Stream mulai broadcasting
- ✅ Stream key yang digunakan adalah yang ter-select
- ✅ Stream muncul di dashboard

---

## 🐛 Debug Checklist

If auto-load tidak bekerja, check:

### 1. Check Function Availability
```javascript
// Open browser console
console.log(typeof window.onControlRoomAccountChange);
console.log(typeof window.fetchControlRoomStreamKeys);
console.log(typeof window.onControlRoomStreamKeyChange);
// All should return "function"
```

### 2. Check DOM Elements
```javascript
// Check if required elements exist
console.log({
  accountSelect: document.getElementById('controlRoomAccountSelect'),
  streamKeySelect: document.getElementById('controlRoomStreamKeySelect'),
  streamKeyManual: document.getElementById('controlRoomStreamKeyManual'),
  streamKeySelector: document.getElementById('controlRoomStreamKeySelector'),
  streamKeyValue: document.getElementById('controlRoomStreamKeyValue'),
  indicator: document.getElementById('controlRoomStreamKeyAutoFillIndicator')
});
// All should return element objects, not null
```

### 3. Test API Endpoint Manually
```javascript
// Test if API works
fetch('/api/youtube/streams?accountId=1', {
  headers: {
    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
  }
})
  .then(r => r.json())
  .then(data => console.log('API Response:', data));
```

### 4. Check YouTube Account Connection
- Pastikan user sudah connect YouTube account
- Check di database: `SELECT * FROM youtube_credentials WHERE userId = [user-id]`
- Pastikan `refreshToken` valid dan tidak expired

### 5. Check Console for Errors
- Buka Developer Tools → Console
- Look for any red error messages
- Check Network tab untuk API calls

---

## ✅ Success Criteria

**All these should work:**
1. ✅ Pilih channel → stream key langsung ter-load
2. ✅ Tidak perlu klik dropdown lagi untuk pilih stream key
3. ✅ Visual indicator muncul
4. ✅ Toast notification informatif
5. ✅ Bisa switch between accounts dengan smooth
6. ✅ Manual mode masih berfungsi sebagai fallback
7. ✅ Form submission berhasil dengan stream key yang benar

---

## 🎯 Performance Check

**Loading Time:**
- API call: < 2 seconds
- UI update: instant
- Auto-selection: instant

**Console Logs Should Show:**
```
[Control Room] Account changed to: [id]
[Control Room] Switching to AUTO mode
[Control Room] fetchControlRoomStreamKeys called with accountId: [id]
[Control Room] Fetching stream keys from: /api/youtube/streams?accountId=[id]
[Control Room] Found [X] stream keys
[Control Room] Auto-selected first stream key: [title]
[Control Room] Stream key changed to: [stream-id]
[Control Room] Selected stream key: SET
```

---

## 📊 Comparison Test

**Compare Control Room vs YouTube Studio:**
1. Test YouTube Studio tab (tab ketiga) → should auto-load
2. Test Control Room tab → should **also auto-load** (like Studio)
3. Both should have same UX and speed

---

## 🚀 Manual Testing Commands

### Test dari Console:
```javascript
// 1. Simulate account selection
window.onControlRoomAccountChange(1); // Replace 1 with actual account ID

// 2. Check if stream keys loaded
setTimeout(() => {
  const select = document.getElementById('controlRoomStreamKeySelect');
  console.log('Stream keys loaded:', select.options.length);
  console.log('Selected value:', select.value);
  console.log('Hidden input value:', document.getElementById('controlRoomStreamKeyValue').value);
}, 2000);

// 3. Simulate switching to manual mode
window.onControlRoomAccountChange('');
```

---

## 📝 Test Results Template

```
Date: [DATE]
Tester: [NAME]

Test 1: Auto-Load Stream Key
- Status: [ ] Pass [ ] Fail
- Notes: 

Test 2: Switch Between Accounts
- Status: [ ] Pass [ ] Fail
- Notes: 

Test 3: Account Tanpa Stream Keys
- Status: [ ] Pass [ ] Fail
- Notes: 

Test 4: Manual Mode Fallback
- Status: [ ] Pass [ ] Fail
- Notes: 

Test 5: Select Different Stream Key
- Status: [ ] Pass [ ] Fail
- Notes: 

Test 6: Create New Stream Key Option
- Status: [ ] Pass [ ] Fail
- Notes: 

Test 7: Complete Stream Creation Flow
- Status: [ ] Pass [ ] Fail
- Notes: 

Overall: [ ] All Passed [ ] Some Failed

Issues Found:
1. 
2. 
3. 
```

---

## 🎉 Expected Final Behavior

**User Experience:**
1. User buka modal
2. User pilih channel
3. ✨ **BOOM! Stream key sudah ready!**
4. User klik "Start Stream"
5. Done! 🚀

**That's it! No more copy-paste!** 🎊
