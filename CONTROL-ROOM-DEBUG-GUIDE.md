# 🔍 Control Room - Debugging Guide

## 🎯 Issue: Stream Keys Tidak Auto-Load

### ✅ Fixed Changes:

1. **Exposed functions to window object**
   - `window.onControlRoomAccountChange`
   - `window.fetchControlRoomStreamKeys`
   - `window.onControlRoomStreamKeyChange`

2. **Added extensive console logging**
   - Account change events
   - API fetch requests
   - Stream key loading
   - Mode switching
   - Error tracking

---

## 🧪 How to Test

### Step 1: Open Browser Console
```
Press F12 → Console tab
```

### Step 2: Navigate to Control Room
```
1. Open aplikasi
2. Navigate to Studio → Control Room
3. Click "Create New Stream"
```

### Step 3: Select YouTube Account
```
1. Di dropdown "YouTube Account"
2. Pilih salah satu channel (bukan "-- Manual Stream Key --")
3. Monitor console output
```

### Expected Console Output:
```javascript
[Control Room] Account changed to: 1
[Control Room] Switching to AUTO mode
[Control Room] fetchControlRoomStreamKeys called with accountId: 1
[Control Room] Fetching stream keys from: /api/youtube/streams?accountId=1
[Control Room] Stream keys response: {success: true, streams: [...]}
[Control Room] Found 3 stream keys
[Control Room] Added stream key option: {id: "...", title: "...", hasKey: true}
[Control Room] Added stream key option: {id: "...", title: "...", hasKey: true}
[Control Room] Added stream key option: {id: "...", title: "...", hasKey: true}
```

### Expected UI Changes:
```
1. ✅ Manual input field HIDDEN
2. ✅ Stream Key dropdown VISIBLE
3. ✅ Loading spinner appears briefly
4. ✅ Dropdown populates with numbered options:
   - 🔑 Create new stream key
   - ─────────────────────
   - 📋 Reuse Existing Stream Keys:
   - 1. My Stream (1920x1080 @ 30fps)
   - 2. Gaming Stream (1280x720 @ 60fps)
5. ✅ Success toast appears
6. ✅ Green checkmark indicator (3 seconds)
```

---

## 🔍 Debugging Checklist

### If Account Dropdown Doesn't Appear:
```javascript
// Check in console:
console.log(document.getElementById('controlRoomAccountSelect'));
// Should return: <select id="controlRoomAccountSelect">...</select>

// If NULL:
// → Clear browser cache
// → Hard refresh (Ctrl+Shift+R)
// → Restart server
```

### If Function Not Defined Error:
```javascript
// Check if functions are exposed:
console.log(typeof window.onControlRoomAccountChange);
// Should return: "function"

// If "undefined":
// → Check if stream-modal.js is loaded
// → Check console for script errors
// → Hard refresh browser
```

### If API Returns 404:
```javascript
// Check API endpoint:
fetch('/api/youtube/streams?accountId=1', {
  headers: {'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content}
})
.then(r => r.json())
.then(d => console.log(d));

// Should return: {success: true, streams: [...]}

// If 404:
// → Check server is running
// → Check routes in app.js
// → Verify accountId exists
```

### If Stream Keys Empty:
```javascript
// Check YouTube account has streams:
// 1. Go to YouTube Studio tab
// 2. Click "Create Broadcast"
// 3. Check if stream keys load there
// 4. If YES in YouTube Studio but NO in Control Room:
//    → Check API response in Network tab
//    → Verify streams array in response
//    → Check console for errors
```

### If Dropdown Doesn't Switch:
```javascript
// Check elements exist:
console.log(document.getElementById('controlRoomStreamKeyManual'));
console.log(document.getElementById('controlRoomStreamKeySelector'));
// Both should return DOM elements

// Check classes:
const manual = document.getElementById('controlRoomStreamKeyManual');
const selector = document.getElementById('controlRoomStreamKeySelector');
console.log('Manual hidden?', manual.classList.contains('hidden'));
console.log('Selector hidden?', selector.classList.contains('hidden'));

// Expected after selecting account:
// Manual hidden? true
// Selector hidden? false
```

---

## 🛠️ Common Issues & Solutions

### Issue 1: "onControlRoomAccountChange is not defined"
**Solution:**
```bash
# Clear browser cache
Ctrl + Shift + Delete → Clear cache

# Hard refresh
Ctrl + Shift + R

# Or restart server
pm2 restart ozanglive
```

### Issue 2: Dropdown doesn't populate
**Possible Causes:**
1. API endpoint not returning data
2. CSRF token missing
3. Account doesn't have stream keys
4. Token expired

**Debug:**
```javascript
// 1. Check API manually
fetch('/api/youtube/streams?accountId=1', {
  headers: {'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content}
})
.then(r => r.json())
.then(d => console.log(d));

// 2. Check token
console.log(document.querySelector('meta[name="csrf-token"]').content);

// 3. Try in YouTube Studio tab
// If works there but not in Control Room → check console errors
```

### Issue 3: Mode doesn't switch
**Solution:**
```javascript
// Check IDs match:
// In HTML: id="controlRoomStreamKeyManual"
// In JS: getElementById('controlRoomStreamKeyManual')

// Verify in console:
const manual = document.getElementById('controlRoomStreamKeyManual');
const selector = document.getElementById('controlRoomStreamKeySelector');

if (!manual) console.error('Manual section not found');
if (!selector) console.error('Selector section not found');
```

### Issue 4: Stream key not filling form
**Solution:**
```javascript
// Check hidden input exists:
const valueInput = document.getElementById('controlRoomStreamKeyValue');
console.log('Value input exists?', !!valueInput);

// After selecting stream key, check value:
console.log('Stream key value:', valueInput.value);

// Should contain actual stream key like: "xxxx-xxxx-xxxx-xxxx"
```

---

## 📊 Console Log Meanings

### Success Flow:
```
[Control Room] Account changed to: 1
  → User selected account ID 1

[Control Room] Switching to AUTO mode
  → UI switching from manual to dropdown

[Control Room] fetchControlRoomStreamKeys called with accountId: 1
  → Starting API fetch

[Control Room] Fetching stream keys from: /api/youtube/streams?accountId=1
  → Making HTTP request

[Control Room] Stream keys response: {...}
  → API responded successfully

[Control Room] Found 3 stream keys
  → Processing stream keys

[Control Room] Added stream key option: {id: "...", title: "...", hasKey: true}
  → Stream key added to dropdown
```

### Error Flow:
```
[Control Room] Error fetching stream keys: Error: ...
  → API request failed

[Control Room] Required elements not found
  → DOM elements missing (HTML issue)

[Control Room] Stream key select element not found
  → Dropdown element missing

[Control Room] Required inputs not found
  → Hidden inputs missing
```

---

## 🎯 Quick Test Commands

### Test 1: Check if functions exist
```javascript
console.log({
  onAccountChange: typeof window.onControlRoomAccountChange,
  fetchStreamKeys: typeof window.fetchControlRoomStreamKeys,
  onStreamKeyChange: typeof window.onControlRoomStreamKeyChange
});
// All should be "function"
```

### Test 2: Manual trigger account change
```javascript
// Simulate account selection
window.onControlRoomAccountChange(1); // Replace 1 with actual account ID

// Should see console logs and UI change
```

### Test 3: Check API directly
```javascript
// Test API endpoint
fetch('/api/youtube/streams?accountId=1', {
  headers: {
    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
  }
})
.then(r => r.json())
.then(data => {
  console.log('Success:', data.success);
  console.log('Stream count:', data.streams ? data.streams.length : 0);
  console.log('Streams:', data.streams);
});
```

### Test 4: Check elements
```javascript
// Check all required elements exist
const elements = {
  accountSelect: document.getElementById('controlRoomAccountSelect'),
  streamKeySelect: document.getElementById('controlRoomStreamKeySelect'),
  streamKeyManual: document.getElementById('controlRoomStreamKeyManual'),
  streamKeySelector: document.getElementById('controlRoomStreamKeySelector'),
  streamKeyValue: document.getElementById('controlRoomStreamKeyValue'),
  streamKeyLoading: document.getElementById('controlRoomStreamKeyLoading'),
  streamKeyIndicator: document.getElementById('controlRoomStreamKeyAutoFillIndicator')
};

Object.entries(elements).forEach(([name, el]) => {
  console.log(name + ':', el ? '✅ Found' : '❌ Missing');
});
```

---

## 🔄 Reset & Retry

If all else fails:

### 1. Clear Everything
```bash
# Stop server
pm2 stop ozanglive

# Clear browser completely
Ctrl + Shift + Delete → Clear everything

# Restart browser

# Start server
pm2 start ozanglive
```

### 2. Check File Changes Applied
```bash
# Verify files updated
git diff public/js/stream-modal.js

# Should show window.function changes
```

### 3. Force Browser Refresh
```
1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"
4. Test again
```

---

## ✅ Success Indicators

Everything working when you see:

1. ✅ **Console**: No errors
2. ✅ **Console**: All log messages appear
3. ✅ **UI**: Manual input hides when account selected
4. ✅ **UI**: Dropdown appears with stream keys
5. ✅ **UI**: Options numbered (1, 2, 3...)
6. ✅ **UI**: Icons visible (🔑, 📋)
7. ✅ **UI**: Toast notification appears
8. ✅ **UI**: Green checkmark indicator (3s)

---

## 📞 Support

If still not working after all checks:

1. **Take screenshot** of console errors
2. **Copy console output** (all [Control Room] logs)
3. **Check Network tab** (F12 → Network → filter "streams")
4. **Note which step fails** (account change? API fetch? UI update?)

---

**File Updated**: `public/js/stream-modal.js`  
**Changes**: Exposed functions to window object + added logging  
**Next Step**: Test in browser with console open
