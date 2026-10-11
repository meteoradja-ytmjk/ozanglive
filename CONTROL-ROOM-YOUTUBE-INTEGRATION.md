# 🎛️ Control Room - YouTube Account Integration

## 🎯 Feature Overview

Integrasi YouTube Account ke dalam **Control Room** "Create New Stream" modal, sehingga user dapat:
1. ✅ Memilih YouTube Account yang sudah terhubung
2. ✅ Auto-load stream keys dari channel tersebut
3. ✅ Reuse existing stream keys atau create new
4. ✅ Sinkron dengan YouTube Studio

## 🆕 What's New

### Before:
```
❌ User harus manual paste stream key dari YouTube Studio
❌ Tidak ada integrasi dengan YouTube Account
❌ Tidak bisa reuse stream keys yang sudah ada
❌ Proses manual dan rawan kesalahan
```

### After:
```
✅ Pilih YouTube Account dari dropdown
✅ Stream keys auto-load dari channel
✅ Pilih existing stream key atau create new
✅ RTMP URL otomatis ter-update
✅ Sinkron dengan YouTube Studio
```

## 🎨 UI Changes

### 1. YouTube Account Selector (New!)
```html
YouTube Account (Optional - Auto-fill stream key)
┌─────────────────────────────────────┐
│ -- Manual Stream Key --             │ ← Default
│ Channel 1 (Your Gaming Channel)     │
│ Channel 2 (Your Music Channel)      │
│ Channel 3 (Your Vlog Channel)       │
└─────────────────────────────────────┘

ℹ️ Select a YouTube account to auto-load stream keys, 
   or leave empty for manual input
```

### 2. Stream Key Section - Mode Switching

#### Mode A: Manual Input (when no account selected)
```html
Stream Key *
┌─────────────────────────────────────┐
│ 🔑 Paste your YouTube stream key... │
└─────────────────────────────────────┘
Get your stream key from YouTube Studio → Go Live
```

#### Mode B: Auto-Select (when account selected)
```html
Stream Key * ✓ Auto-loaded
┌─────────────────────────────────────┐
│ 🔑 Create new stream key            │ ← Default
│ ─────────────────────────────────  │
│ 📋 Reuse Existing Stream Keys:      │
│ 1. My Stream (1920x1080 @ 30fps)   │
│ 2. Gaming Stream (1280x720 @ 60fps)│
│ 3. Test Stream (1920x1080 @ 60fps) │
└─────────────────────────────────────┘

ℹ️ Reuse existing stream keys or create a new one
```

## 🔄 User Workflow

### Scenario A: Manual Stream Key (Original Behavior)

```
1. User opens "Create New Stream" modal
2. Leave "YouTube Account" as "-- Manual Stream Key --"
3. Manually paste stream key from YouTube Studio
4. Manually paste RTMP URL (if needed)
5. Fill other fields (video, audio, title, duration)
6. Submit form
```

**✅ Backward Compatible** - Original workflow still works!

### Scenario B: Auto-Select Stream Key (New Feature)

```
1. User opens "Create New Stream" modal
2. Select "YouTube Account" from dropdown
   → Example: "Channel 1 (Your Gaming Channel)"
3. System automatically:
   - ⏳ Shows loading spinner
   - Fetches stream keys from YouTube API
   - Populates "Stream Key" dropdown
   - Shows success toast
4. User can choose:
   Option A: Keep "Create new stream key"
   Option B: Select existing key (1, 2, 3...)
5. If existing key selected:
   - Stream key auto-filled (hidden input)
   - RTMP URL auto-updated
6. Fill other fields (video, audio, title, duration)
7. Submit form
```

## 📂 Files Modified

### 1. `views/dashboard.ejs`

#### Added YouTube Account Selector:
```html
<!-- YouTube Account Selector -->
<div>
  <label class="text-sm font-medium text-white block mb-2">
    YouTube Account
    <span class="text-xs text-gray-500">(Optional - Auto-fill stream key)</span>
  </label>
  <select id="controlRoomAccountSelect" name="youtubeAccountId"
    class="w-full px-4 py-2.5 bg-dark-700 border border-gray-600 rounded-lg focus:border-primary focus:outline-none transition-all"
    onchange="onControlRoomAccountChange(this.value)">
    <option value="">-- Manual Stream Key --</option>
    <% if (accounts && accounts.length > 0) { %>
      <% accounts.forEach(function(account) { %>
      <option value="<%= account.id %>"><%= account.channelName || 'YouTube Channel' %></option>
      <% }); %>
    <% } %>
  </select>
  <p class="text-xs text-gray-500 mt-1">
    <i class="ti ti-info-circle text-primary mr-1"></i>
    Select a YouTube account to auto-load stream keys, or leave empty for manual input
  </p>
</div>
```

#### Updated Stream Key Section:
```html
<!-- Stream Key -->
<div>
  <label class="text-sm font-medium text-white block mb-2">
    Stream Key <span class="text-red-400">*</span>
    <span id="controlRoomStreamKeyAutoFillIndicator" class="hidden ml-2 text-xs text-green-400">
      ✓ Auto-loaded
    </span>
  </label>
  
  <!-- Stream Key Selector (shown when account selected) -->
  <div id="controlRoomStreamKeySelector" class="hidden">
    <div class="relative">
      <select id="controlRoomStreamKeySelect" name="youtubeStreamId"
        class="w-full px-4 py-2.5 bg-dark-700 border border-gray-600 rounded-lg focus:border-primary focus:outline-none transition-all"
        onchange="onControlRoomStreamKeyChange(this.value)">
        <option value="">🔑 Create new stream key</option>
      </select>
      <div id="controlRoomStreamKeyLoading" class="hidden absolute right-3 top-1/2 -translate-y-1/2">
        <i class="ti ti-loader animate-spin text-primary"></i>
      </div>
    </div>
    <p class="text-xs text-gray-500 mt-1">
      <i class="ti ti-info-circle text-primary mr-1"></i>
      Reuse existing stream keys or create a new one
    </p>
  </div>
  
  <!-- Manual Stream Key Input (shown when no account selected) -->
  <div id="controlRoomStreamKeyManual">
    <div class="relative">
      <input type="text" id="streamKey" name="streamKey"
        class="w-full pl-10 pr-4 py-2.5 bg-dark-700 border border-gray-600 rounded-lg text-sm"
        placeholder="Paste your YouTube stream key here..." required>
      <i class="ti ti-key absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
    </div>
    <p class="text-xs text-gray-500 mt-1">Get your stream key from YouTube Studio → Go Live</p>
  </div>
  
  <!-- Hidden input for actual stream key value -->
  <input type="hidden" id="controlRoomStreamKeyValue" name="actualStreamKey" value="">
</div>
```

### 2. `public/js/stream-modal.js`

#### Added Functions:

**1. `onControlRoomAccountChange(accountId)`**
- Handles YouTube Account selection change
- Shows/hides manual vs auto-select modes
- Triggers stream keys fetch

**2. `fetchControlRoomStreamKeys(accountId)`**
- Fetches stream keys from `/api/youtube/streams?accountId=X`
- Populates dropdown with numbered options
- Shows loading states and success feedback
- Stores stream key and RTMP URL in option data attributes

**3. `onControlRoomStreamKeyChange(streamId)`**
- Handles stream key selection change
- Auto-fills stream key to hidden input
- Auto-updates RTMP URL

**4. `getCsrfToken()`**
- Helper function to get CSRF token for API calls

#### Updated Form Submission:
```javascript
// Use actualStreamKey from dropdown if available, otherwise use manual input
streamKey: formData.get('actualStreamKey') || formData.get('streamKey'),
```

## 🔌 API Integration

### Endpoint Used:
```
GET /api/youtube/streams?accountId={accountId}
```

### Response Format:
```json
{
  "success": true,
  "streams": [
    {
      "id": "stream_id_123",
      "title": "My Live Stream",
      "streamKey": "xxxx-xxxx-xxxx-xxxx",
      "rtmpUrl": "rtmp://a.rtmp.youtube.com/live2/xxxx",
      "resolution": "1920x1080",
      "frameRate": "30fps"
    },
    {
      "id": "stream_id_456",
      "title": "Gaming Stream",
      "streamKey": "yyyy-yyyy-yyyy-yyyy",
      "rtmpUrl": "rtmp://a.rtmp.youtube.com/live2/yyyy",
      "resolution": "1280x720",
      "frameRate": "60fps"
    }
  ],
  "accountId": 1
}
```

### Data Flow:
```
User selects Account
    ↓
onControlRoomAccountChange()
    ↓
fetchControlRoomStreamKeys(accountId)
    ↓
GET /api/youtube/streams?accountId=X
    ↓
YouTube Service (youtubeService.listStreams())
    ↓
YouTube API (liveStreams.list)
    ↓
Return streams with keys
    ↓
Populate dropdown
    ↓
User selects stream key
    ↓
onControlRoomStreamKeyChange()
    ↓
Auto-fill stream key & RTMP URL
    ↓
Form submission includes correct values
```

## ✨ Features

### 1. Mode Switching
- **Manual Mode**: Traditional paste stream key input
- **Auto Mode**: Dropdown selector with existing keys
- **Seamless Toggle**: Switch between modes by selecting/deselecting account

### 2. Visual Feedback
- ⏳ **Loading States**: Spinner during API fetch
- ✅ **Success Indicator**: Green checkmark (auto-hide 3s)
- 🔔 **Toast Notifications**: Success, info, error messages
- 🎨 **Professional UI**: Icons, separators, numbering

### 3. Data Management
- 📋 **Reuse Keys**: Select from existing stream keys
- 🔑 **Create New**: Option to create new stream key
- 🔄 **Auto-Update**: RTMP URL updates automatically
- 💾 **Hidden Storage**: Stream key stored in hidden input

### 4. Error Handling
- ❌ **API Failure**: Form still works with manual input
- ⚠️ **No Keys Found**: Clear message, fallback to manual
- 🔒 **Token Expired**: User-friendly error message
- 🛡️ **Graceful Degradation**: Never blocks user workflow

## 🎯 Benefits

### For Users:
1. ✅ **Faster Workflow** - No need to copy-paste from YouTube Studio
2. ✅ **Less Errors** - Auto-filled values are always correct
3. ✅ **Easy Reuse** - Quickly select previously used stream keys
4. ✅ **Visual Clarity** - Know exactly what you're selecting
5. ✅ **Flexibility** - Can still use manual input if needed

### For System:
1. ✅ **Consistent Data** - Stream keys always match YouTube
2. ✅ **Better UX** - Professional, modern interface
3. ✅ **Error Reduction** - Less manual input = less mistakes
4. ✅ **Integration** - Control Room syncs with YouTube Studio
5. ✅ **Scalability** - Easy to add more YouTube features

## 🔄 Synchronization

### Control Room ↔ YouTube Studio

Both tabs now share the same stream key infrastructure:

| Feature | Control Room | YouTube Studio |
|---------|--------------|----------------|
| **Account Selection** | ✅ Yes | ✅ Yes |
| **Auto-load Keys** | ✅ Yes | ✅ Yes |
| **Stream Key Dropdown** | ✅ Yes | ✅ Yes |
| **Numbered Options** | ✅ Yes | ✅ Yes |
| **Visual Feedback** | ✅ Yes | ✅ Yes |
| **Manual Fallback** | ✅ Yes | ❌ No (not needed) |

**Key Difference:**
- **Control Room**: Can work with OR without YouTube account (manual mode)
- **YouTube Studio**: Always requires YouTube account (no manual mode)

## 🧪 Testing Checklist

### Scenario 1: Manual Mode (No Account)
- [ ] Leave account as "-- Manual Stream Key --"
- [ ] Manual input field visible
- [ ] Input field has "required" attribute
- [ ] Can paste stream key manually
- [ ] Form submits with manual key
- [ ] Stream created successfully

### Scenario 2: Auto Mode - No Existing Keys
- [ ] Select YouTube Account
- [ ] Loading spinner appears
- [ ] Dropdown shows "Create new stream key"
- [ ] Toast: "No existing stream keys found"
- [ ] Can still submit form
- [ ] New stream key will be created later

### Scenario 3: Auto Mode - With Existing Keys
- [ ] Select YouTube Account
- [ ] Loading spinner appears
- [ ] Dropdown populates with numbered options
- [ ] Visual separator visible
- [ ] Success toast appears
- [ ] Auto-fill indicator shows (3s)
- [ ] Can select existing key
- [ ] Stream key auto-filled to hidden input
- [ ] RTMP URL auto-updated
- [ ] Form submits with correct values

### Scenario 4: Switch Between Modes
- [ ] Start with Manual mode
- [ ] Select account → switches to Auto mode
- [ ] Manual input hidden
- [ ] Dropdown visible
- [ ] Deselect account (back to Manual)
- [ ] Dropdown hidden
- [ ] Manual input visible again

### Scenario 5: Error Handling
- [ ] API fails → Error toast shown
- [ ] Manual mode still available
- [ ] Token expired → Clear error message
- [ ] Network error → Graceful fallback
- [ ] Form never blocked

## 📊 Comparison with YouTube Studio

### Similarities:
- ✅ Same API endpoint (`/api/youtube/streams`)
- ✅ Same data structure
- ✅ Same visual design (icons, separators, numbering)
- ✅ Same user experience
- ✅ Same error handling

### Differences:

| Aspect | Control Room | YouTube Studio |
|--------|--------------|----------------|
| **Purpose** | Create RTMP streams | Create YouTube broadcasts |
| **Manual Mode** | ✅ Available | ❌ Not needed |
| **Account Required** | ❌ Optional | ✅ Required |
| **Default Mode** | Manual | Auto |
| **Use Case** | Flexible streaming | YouTube-only streaming |

## 🚀 Future Enhancements

### Potential Improvements:
1. **Stream Key Preview** - Show partial key on hover
2. **Last Used Indicator** - Highlight recently used keys
3. **Favorite Keys** - Pin frequently used keys to top
4. **Stream Key Stats** - Show usage count, last used date
5. **Quick Copy** - Copy stream key to clipboard
6. **Stream Health** - Show if stream is active/inactive
7. **Thumbnail Preview** - Show last thumbnail used with key
8. **Multi-Account Quick Switch** - Quick toggle between accounts

## 🔒 Security & Privacy

### Security Measures:
- ✅ Stream keys stored in hidden input (not visible in UI)
- ✅ CSRF token required for API calls
- ✅ User authentication checked on server
- ✅ Account ownership validated
- ✅ Stream keys only accessible to owner

### Privacy:
- ✅ Stream keys never logged to console
- ✅ Only authorized users can access their keys
- ✅ Keys fetched fresh from YouTube API
- ✅ No unnecessary storage of sensitive data

## 📝 Notes

### Important:
1. **Backward Compatible** - Original manual mode still works
2. **Optional Feature** - Users can choose to use or ignore
3. **No Breaking Changes** - All existing functionality intact
4. **Graceful Degradation** - Falls back to manual on any error
5. **API Rate Limiting** - Respects YouTube API quota limits

### Best Practices:
- Always test with multiple YouTube accounts
- Verify stream keys match YouTube Studio
- Check RTMP URL auto-update works correctly
- Test error scenarios (network, token, API failures)
- Ensure manual mode always works as fallback

## ✅ Conclusion

This integration brings **Control Room** to feature parity with **YouTube Studio** while maintaining backward compatibility with the original manual workflow. Users now have:

1. ✅ **Flexibility** - Choose manual or auto mode
2. ✅ **Convenience** - Quick access to existing stream keys
3. ✅ **Reliability** - Auto-filled values are always correct
4. ✅ **Professional UX** - Modern, polished interface
5. ✅ **Peace of Mind** - Graceful error handling

**Status**: ✅ **READY FOR TESTING & DEPLOYMENT**

---

**Created**: August 12, 2026  
**Feature**: Control Room YouTube Integration  
**Type**: Enhancement  
**Breaking Changes**: None  
**Backward Compatible**: ✅ Yes
