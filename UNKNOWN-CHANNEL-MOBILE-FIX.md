# Unknown Channel & Mobile Loading Stuck - FIX

## Masalah yang Dilaporkan
1. ❌ "Unknown Channel" muncul di scheduled broadcasts
2. ❌ Mode mobile stuck di "loading broadcast" (tidak muncul list)
3. ❌ Channel name tidak muncul meskipun sudah ada di database

## Root Cause Analysis

### 1. **Unknown Channel Issue**

#### Penyebab:
```javascript
// SEBELUM: Hanya menggunakan accountMap
const channelName = accountMap[broadcast.accountId] || 'Unknown Channel';
```

**Masalah:**
- Broadcast sudah punya `channelName` dari API
- Tapi kode mengabaikan `broadcast.channelName`
- Hanya pakai `accountMap` yang mungkin kosong
- Fallback ke 'Unknown Channel'

#### Solusi:
```javascript
// SESUDAH: Priority system
let channelName = broadcast.channelName || accountMap[broadcast.accountId];

if (!channelName) {
  channelName = `YouTube Account #${broadcast.accountId}`;
}
```

**Priority:**
1. ✅ `broadcast.channelName` (dari API response)
2. ✅ `accountMap[accountId]` (dari accounts array)
3. ✅ `YouTube Account #ID` (descriptive fallback)
4. ❌ NEVER 'Unknown Channel'

### 2. **Mobile Loading Stuck Issue**

#### Penyebab:
```javascript
// SEBELUM: Container visibility di-handle di finally block
try {
  // fetch and render
} finally {
  if (loadingContainer) loadingContainer.remove();
  if (broadcastsContainer) broadcastsContainer.classList.remove('hidden');
}
```

**Masalah di Mobile:**
- Error terjadi sebelum finally block
- Container tetap hidden
- Loading tidak di-remove
- User stuck di loading screen

#### Solusi:
```javascript
// SESUDAH: Force visibility SEBELUM rendering
// Hide loading
if (loadingContainer) {
  loadingContainer.style.display = 'none';
  loadingContainer.remove();
}

// Show container dengan 2 cara
if (broadcastsContainer) {
  broadcastsContainer.style.display = 'block';  // Force display
  broadcastsContainer.classList.remove('hidden'); // Remove Tailwind class
}

// THEN render
renderBroadcastsGrouped(data.broadcasts, data.accounts);
```

**Kenapa 2 cara?**
- `style.display = 'block'` → Inline style (highest priority)
- `classList.remove('hidden')` → Remove Tailwind class
- Ensures visibility di semua browser/device

## Perubahan Detail

### 1. ✅ **Channel Name Resolution**

```javascript
function renderBroadcastsGrouped(broadcasts, accounts) {
  // Create account map for fallback
  const accountMap = {};
  if (accounts && accounts.length > 0) {
    accounts.forEach(acc => {
      accountMap[acc.id] = acc.channelName || null;
    });
  }
  
  // Group broadcasts by channel
  const groupedBroadcasts = {};
  broadcasts.forEach(broadcast => {
    // PRIORITY: Use channelName from broadcast first
    let channelName = broadcast.channelName || accountMap[broadcast.accountId];
    
    // Descriptive fallback (never "Unknown")
    if (!channelName) {
      channelName = `YouTube Account #${broadcast.accountId}`;
      console.warn('[renderBroadcastsGrouped] No channel name for:', broadcast.id);
    }
    
    // Group by channel
    if (!groupedBroadcasts[channelName]) {
      groupedBroadcasts[channelName] = {
        accountId: broadcast.accountId,
        broadcasts: []
      };
    }
    groupedBroadcasts[channelName].broadcasts.push(broadcast);
  });
  
  // Render...
}
```

### 2. ✅ **Mobile Loading Fix**

```javascript
async function lazyLoadBroadcasts() {
  const loadingContainer = document.getElementById('broadcastsLoadingContainer');
  const broadcastsContainer = document.getElementById('broadcastsContainer');
  
  // Add mobile detection logging
  console.log('[Performance] User agent:', navigator.userAgent);
  console.log('[Performance] Is mobile:', /Mobile|Android|iPhone/i.test(navigator.userAgent));
  
  try {
    const response = await fetch('/api/youtube/broadcasts', {...});
    const data = await response.json();
    
    // CRITICAL: Hide loading and show container FIRST
    console.log('[Performance] Hiding loading container...');
    if (loadingContainer) {
      loadingContainer.style.display = 'none';
      loadingContainer.remove();
    }
    
    console.log('[Performance] Showing broadcasts container...');
    if (broadcastsContainer) {
      broadcastsContainer.style.display = 'block';  // Inline style
      broadcastsContainer.classList.remove('hidden'); // Remove class
    }
    
    // THEN render
    if (data.broadcasts.length > 0) {
      renderBroadcastsGrouped(data.broadcasts, data.accounts || []);
    } else {
      renderEmptyState();
    }
    
  } catch (error) {
    // CRITICAL: Always hide loading on error
    if (loadingContainer) {
      loadingContainer.style.display = 'none';
      loadingContainer.remove();
    }
    if (broadcastsContainer) {
      broadcastsContainer.style.display = 'block';
      broadcastsContainer.classList.remove('hidden');
    }
    
    showErrorState(error.message);
  }
}
```

### 3. ✅ **Enhanced Logging**

```javascript
// Detailed logging for debugging
console.log('[Performance] Starting lazy load of broadcasts...');
console.log('[Performance] User agent:', navigator.userAgent);
console.log('[Performance] Is mobile:', /Mobile|Android|iPhone/i.test(navigator.userAgent));
console.log('[Performance] Fetching broadcasts from API...');
console.log('[Performance] API response received, status:', response.status);
console.log('[Performance] API Response:', data);
console.log('[Performance] Broadcasts count:', data.broadcasts ? data.broadcasts.length : 0);
console.log('[Performance] Accounts count:', data.accounts ? data.accounts.length : 0);
console.log('[Performance] Hiding loading container...');
console.log('[Performance] Showing broadcasts container...');
console.log('[Performance] Rendering broadcasts...');
console.log('[Performance] Broadcasts rendered successfully');
```

### 4. ✅ **Empty Check**

```javascript
function renderBroadcastsGrouped(broadcasts, accounts) {
  // ... grouping logic ...
  
  const channelNames = Object.keys(groupedBroadcasts);
  
  // Check if no channels
  if (channelNames.length === 0) {
    console.warn('[renderBroadcastsGrouped] No channels to render');
    renderEmptyState();
    return;
  }
  
  // Render channels...
}
```

## Testing Guide

### Desktop Testing
1. Open YouTube tab
2. Check console logs
3. Verify channel names (no "Unknown Channel")
4. Verify broadcasts load
5. Check Network tab (API response has channelName)

### Mobile Testing (Critical)
1. Open Chrome DevTools
2. Toggle Device Toolbar (Ctrl+Shift+M)
3. Select mobile device (iPhone, Android)
4. Refresh page
5. Check console logs:
   ```
   [Performance] Starting lazy load...
   [Performance] User agent: Mozilla/5.0 (iPhone...)
   [Performance] Is mobile: true
   [Performance] Fetching broadcasts from API...
   [Performance] API response received, status: 200
   [Performance] Broadcasts count: 10
   [Performance] Hiding loading container...
   [Performance] Showing broadcasts container...
   [Performance] Rendering broadcasts...
   [Performance] Broadcasts rendered successfully
   ```
6. Verify broadcasts list appears
7. Verify channel names correct
8. Verify icons visible (✏️🔄🗑️)

### Error Testing
1. Disconnect network
2. Refresh page
3. Should show error message (not stuck)
4. Should have retry button
5. Click retry → reload page

## Before vs After

### Channel Names

**Before:**
```
📺 Unknown Channel (10 broadcasts) ▶
📺 Unknown Channel (5 broadcasts) ▶
```

**After:**
```
📺 Riviera Lounge (10 broadcasts) ▶
📺 La Davina Melodia (5 broadcasts) ▶
```

### Mobile Loading

**Before:**
```
Loading broadcasts...
Fetching data from YouTube API
[Progress bar]
(Stuck forever)
```

**After:**
```
Loading broadcasts...
Fetching data from YouTube API
[Progress bar]
(1-2 seconds)
📺 Riviera Lounge (10 broadcasts) ▶
📺 La Davina Melodia (5 broadcasts) ▶
```

## Console Logs Reference

### Successful Load
```
[Performance] Starting lazy load of broadcasts...
[Performance] User agent: Mozilla/5.0...
[Performance] Is mobile: true
[Performance] Fetching broadcasts from API...
[Performance] API response received, status: 200
[Performance] API Response: {success: true, broadcasts: [...], accounts: [...]}
[Performance] Broadcasts count: 10
[Performance] Accounts count: 2
[Performance] Hiding loading container...
[Performance] Showing broadcasts container...
[renderBroadcastsGrouped] Starting render with 10 broadcasts
[renderBroadcastsGrouped] Accounts: [{id: 1, channelName: "Riviera Lounge"}, ...]
[renderBroadcastsGrouped] Sample broadcast: {id: "...", channelName: "Riviera Lounge", ...}
[renderBroadcastsGrouped] Account map: {1: "Riviera Lounge", 2: "La Davina Melodia"}
[renderBroadcastsGrouped] Grouped broadcasts: ["Riviera Lounge", "La Davina Melodia"]
[renderBroadcastsGrouped] Rendering channel 0: Riviera Lounge with 10 broadcasts
[renderBroadcastsGrouped] Rendering channel 1: La Davina Melodia with 5 broadcasts
[renderBroadcastsGrouped] Render complete
[Performance] Broadcasts rendered successfully
```

### Error (Network Issue)
```
[Performance] Starting lazy load of broadcasts...
[Performance] Fetching broadcasts from API...
[Performance] Error loading broadcasts: Failed to fetch
[Performance] Error name: TypeError
[Performance] Error message: Failed to fetch
[Performance] Error occurred, hiding loading container...
[Performance] Showing broadcasts container...
(Shows error state with retry button)
```

### Timeout
```
[Performance] Starting lazy load of broadcasts...
[Performance] Fetching broadcasts from API...
[Performance] Request timeout after 20 seconds
[Performance] Error loading broadcasts: AbortError
[Performance] Request timeout - taking too long to load broadcasts
[Performance] Error occurred, hiding loading container...
[Performance] Showing broadcasts container...
(Shows timeout error with retry button)
```

## Debugging Tips

### If "Unknown Channel" still appears:
1. Check console: `[renderBroadcastsGrouped] Sample broadcast:`
2. Verify `channelName` field exists in broadcast object
3. Check API response in Network tab
4. Verify `accounts` array has `channelName`

### If mobile still stuck:
1. Open mobile DevTools (Chrome remote debugging)
2. Check console logs
3. Look for errors before "Showing broadcasts container"
4. Verify container element exists: `document.getElementById('broadcastsContainer')`
5. Check computed styles: `getComputedStyle(container).display`

### If broadcasts don't render:
1. Check: `[renderBroadcastsGrouped] Grouped broadcasts:`
2. Should show array of channel names
3. If empty, check grouping logic
4. Verify broadcasts have accountId

## Files Changed
- `public/js/youtube.js`
  - `renderBroadcastsGrouped()` - Channel name priority
  - `lazyLoadBroadcasts()` - Mobile visibility fix
  - Enhanced logging throughout

## Commit
- Hash: `6a27b82`
- Message: "fix: resolve Unknown Channel and mobile loading stuck issues"

## Summary

✅ **Channel Names:**
- Never show "Unknown Channel"
- Always show real channel name or descriptive fallback
- Priority: broadcast.channelName → accountMap → "YouTube Account #ID"

✅ **Mobile Loading:**
- Force container visibility before rendering
- Use both inline style and class removal
- Extensive logging for debugging
- Always hide loading on error/timeout

✅ **Reliability:**
- Better error handling
- Mobile-specific fixes
- Detailed console logs
- Empty state handling
