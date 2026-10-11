# 🧪 Test Control Room Stream Key Auto-Load

## 🚨 PENTING: Hard Refresh Browser!

Sebelum test, **WAJIB** hard refresh browser untuk memastikan JavaScript terbaru ter-load:

```
Windows: Ctrl + Shift + R
Mac: Cmd + Shift + R

ATAU

F12 → Right-click refresh button → "Empty Cache and Hard Reload"
```

---

## ✅ Test Step-by-Step

### Test 1: Verify Functions Loaded

1. **Buka browser console** (F12)
2. **Ketik command ini:**
   ```javascript
   console.log({
     onAccountChange: typeof window.onControlRoomAccountChange,
     fetchStreamKeys: typeof window.fetchControlRoomStreamKeys,
     onStreamKeyChange: typeof window.onControlRoomStreamKeyChange
   });
   ```
3. **Expected output:**
   ```javascript
   {
     onAccountChange: "function",
     fetchStreamKeys: "function",
     onStreamKeyChange: "function"
   }
   ```
4. **Jika semua "function"** ✅ Lanjut Test 2
5. **Jika ada "undefined"** ❌ Hard refresh lagi!

---

### Test 2: Manual Trigger Stream Key Load

1. **Dengan console masih terbuka**
2. **Navigate ke**: Studio → Control Room
3. **Click**: "Create New Stream"
4. **Di console, ketik** (ganti `1` dengan ID account "NeuralWork"):
   ```javascript
   // Cek account ID dulu
   const select = document.getElementById('controlRoomAccountSelect');
   console.log('Available accounts:');
   Array.from(select.options).forEach(opt => {
     console.log(`ID: ${opt.value}, Name: ${opt.text}`);
   });
   
   // Trigger auto-load (ganti 1 dengan ID yang sesuai)
   window.onControlRoomAccountChange(1);
   ```
5. **Watch console & UI**

**Expected Console Output:**
```
[Control Room] Account changed to: 1
[Control Room] Switching to AUTO mode
[Control Room] fetchControlRoomStreamKeys called with accountId: 1
[Control Room] Fetching stream keys from: /api/youtube/streams?accountId=1
[Control Room] Stream keys response: {success: true, streams: [...]}
[Control Room] Found X stream keys
[Control Room] Added stream key option: ...
```

**Expected UI Changes:**
- ❌ Manual input (paste) should HIDE
- ✅ Dropdown should APPEAR
- ✅ Dropdown should populate with stream keys

---

### Test 3: Test via Dropdown Change

1. **Close modal** (if open)
2. **Reopen**: Click "Create New Stream"
3. **In console, watch for auto-trigger log:**
   ```
   [Control Room] Modal opened with account pre-selected, triggering auto-load...
   ```
4. **Manually change account**: Select different channel
5. **Watch console for logs**

---

### Test 4: Compare with YouTube Studio (Working Example)

1. **Go to YouTube Studio tab**
2. **Click "Create Broadcast"**
3. **Select account** → Watch stream keys load ✅
4. **Open console** → See similar logs

**YouTube Studio logs look like:**
```
[fetchStreams] Fetching from: /api/youtube/streams?accountId=1
[fetchStreams] Response: {success: true, streams: [...]}
[fetchStreams] Found X stream keys
```

**Control Room should have similar logs:**
```
[Control Room] Fetching stream keys from: /api/youtube/streams?accountId=1
[Control Room] Stream keys response: {success: true, streams: [...]}
[Control Room] Found X stream keys
```

---

## 🔍 Debugging Commands

### Check if Elements Exist:
```javascript
const elements = {
  accountSelect: document.getElementById('controlRoomAccountSelect'),
  streamKeyManual: document.getElementById('controlRoomStreamKeyManual'),
  streamKeySelector: document.getElementById('controlRoomStreamKeySelector'),
  streamKeySelect: document.getElementById('controlRoomStreamKeySelect'),
  streamKeyValue: document.getElementById('controlRoomStreamKeyValue')
};

Object.entries(elements).forEach(([name, el]) => {
  console.log(`${name}: ${el ? '✅ Found' : '❌ Missing'}`);
});
```

### Check Current State:
```javascript
const accountSelect = document.getElementById('controlRoomAccountSelect');
const manual = document.getElementById('controlRoomStreamKeyManual');
const selector = document.getElementById('controlRoomStreamKeySelector');

console.log({
  selectedAccount: accountSelect?.value,
  selectedAccountName: accountSelect?.options[accountSelect.selectedIndex]?.text,
  manualHidden: manual?.classList.contains('hidden'),
  selectorHidden: selector?.classList.contains('hidden')
});
```

**Expected when account selected:**
```javascript
{
  selectedAccount: "1",
  selectedAccountName: "NeuralWork",
  manualHidden: true,     // ← Should be TRUE
  selectorHidden: false   // ← Should be FALSE
}
```

### Test API Directly:
```javascript
// Get account ID first
const accountId = document.getElementById('controlRoomAccountSelect').value;
console.log('Testing with account ID:', accountId);

// Test API
fetch(`/api/youtube/streams?accountId=${accountId}`, {
  headers: {
    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
  }
})
.then(r => r.json())
.then(data => {
  console.log('API Success:', data.success);
  console.log('Stream count:', data.streams?.length || 0);
  console.log('Streams:', data.streams);
})
.catch(err => console.error('API Error:', err));
```

---

## 🐛 Common Issues & Fixes

### Issue 1: Functions are "undefined"
**Cause**: JavaScript file not refreshed

**Fix:**
```
1. Hard refresh: Ctrl + Shift + R
2. Clear browser cache completely
3. Restart browser
4. Try again
```

### Issue 2: No console logs appear
**Cause**: Function not being called

**Fix:**
```javascript
// Manual trigger in console:
window.onControlRoomAccountChange(1);  // Replace 1 with your account ID

// If error "onControlRoomAccountChange is not defined":
// → File not loaded, hard refresh browser
```

### Issue 3: API returns empty streams
**Cause**: Account might not have stream keys yet

**Check:**
```
1. Go to YouTube Studio tab
2. Click "Create Broadcast"
3. Select same account
4. Does stream keys load there? 
   - YES → Control Room has bug
   - NO → Account has no streams yet
```

### Issue 4: UI doesn't switch modes
**Cause**: Element IDs mismatch or CSS issue

**Debug:**
```javascript
// Check elements
const manual = document.getElementById('controlRoomStreamKeyManual');
const selector = document.getElementById('controlRoomStreamKeySelector');

console.log('Manual element:', manual);
console.log('Selector element:', selector);

// Manually toggle
if (manual && selector) {
  manual.classList.add('hidden');
  selector.classList.remove('hidden');
  console.log('✅ Manual toggle successful');
} else {
  console.error('❌ Elements not found');
}
```

---

## 📊 Success Checklist

Mark ✅ when working:

- [ ] Functions show as "function" type in console
- [ ] Console logs appear when account changed
- [ ] API request visible in Network tab
- [ ] API returns streams successfully
- [ ] Manual input section hides
- [ ] Dropdown section appears
- [ ] Dropdown populates with stream keys
- [ ] Toast notification appears
- [ ] Can select stream key from dropdown

---

## 🎯 If Still Not Working

### Capture Debug Info:

1. **Open console** (F12)
2. **Run this:**
   ```javascript
   // Collect all debug info
   const debugInfo = {
     functions: {
       onAccountChange: typeof window.onControlRoomAccountChange,
       fetchStreamKeys: typeof window.fetchControlRoomStreamKeys,
       onStreamKeyChange: typeof window.onControlRoomStreamKeyChange
     },
     elements: {
       accountSelect: !!document.getElementById('controlRoomAccountSelect'),
       streamKeyManual: !!document.getElementById('controlRoomStreamKeyManual'),
       streamKeySelector: !!document.getElementById('controlRoomStreamKeySelector'),
       streamKeySelect: !!document.getElementById('controlRoomStreamKeySelect')
     },
     state: {
       selectedAccount: document.getElementById('controlRoomAccountSelect')?.value,
       manualHidden: document.getElementById('controlRoomStreamKeyManual')?.classList.contains('hidden'),
       selectorHidden: document.getElementById('controlRoomStreamKeySelector')?.classList.contains('hidden')
     }
   };
   console.log('DEBUG INFO:', JSON.stringify(debugInfo, null, 2));
   ```
3. **Copy output** and share it

### Check Network Tab:

1. **F12 → Network tab**
2. **Filter**: "streams"
3. **Change account in dropdown**
4. **Look for**: Request to `/api/youtube/streams?accountId=X`
5. **Click request** → **Response tab**
6. **Check if streams returned**

---

## 🔄 Force Reload Everything

If nothing works:

### Step 1: Clear Everything
```
1. Ctrl + Shift + Delete
2. Select "All time"
3. Check all boxes
4. Click "Clear data"
```

### Step 2: Restart Server
```bash
pm2 restart ozanglive
# OR
npm start
```

### Step 3: Restart Browser
```
Close browser completely
Open again
```

### Step 4: Test Again
Follow Test 1-4 above

---

## ✅ Expected Final Result

**When working correctly:**

1. Open Control Room → "Create New Stream"
2. Account "NeuralWork" already selected
3. **Immediately see in console:**
   ```
   [Control Room] Modal opened with account pre-selected, triggering auto-load...
   [Control Room] Account changed to: X
   [Control Room] Fetching stream keys...
   [Control Room] Found X stream keys
   ```
4. **UI shows:**
   - ✅ Dropdown with stream keys (not manual input)
   - ✅ Options numbered: 1. Stream Name (resolution @ fps)
   - ✅ Toast: "✓ Loaded X stream keys"
5. **Can select stream key** from dropdown
6. **Submit form** successfully

---

**File to test**: d:\streamflow-ozanglive\public\js\stream-modal.js  
**Expected behavior**: Same as YouTube Studio tab  
**Key**: HARD REFRESH browser first!
