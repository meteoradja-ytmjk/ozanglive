# 🧪 Testing Guide - Control Room YouTube Integration

## 🎯 Quick Test Steps

### ✅ Test 1: Manual Mode (Original Behavior)
```
1. Navigate to Studio → Control Room
2. Click "Create New Stream" button
3. Leave "YouTube Account" as "-- Manual Stream Key --"
4. Manually paste stream key in "Stream Key" field
5. Fill other required fields
6. Click "Create Stream"
7. ✅ Verify: Stream created successfully
```

**Expected Result**: Original workflow works exactly as before.

---

### ✅ Test 2: Auto Mode - Load Stream Keys
```
1. Navigate to Studio → Control Room
2. Click "Create New Stream" button
3. Select a YouTube Account from dropdown
   Example: "My Gaming Channel"
4. ✅ Verify: Loading spinner appears
5. ✅ Verify: Dropdown switches to "Stream Key Selector"
6. ✅ Verify: Manual input hidden
7. ✅ Verify: Stream keys loaded in dropdown
8. ✅ Verify: Options numbered (1, 2, 3...)
9. ✅ Verify: Visual separator visible
10. ✅ Verify: Success toast appears
11. ✅ Verify: Green checkmark indicator (auto-hide 3s)
```

**Expected Result**: Stream keys auto-loaded from selected channel.

---

### ✅ Test 3: Select Existing Stream Key
```
1. Follow Test 2 steps 1-3
2. Wait for stream keys to load
3. Select an existing stream key from dropdown
   Example: "1. My Stream (1920x1080 @ 30fps)"
4. Fill other required fields (video, audio, title)
5. Click "Create Stream"
6. ✅ Verify: Stream created with correct stream key
7. ✅ Verify: RTMP URL correct
```

**Expected Result**: Stream created with selected existing key.

---

### ✅ Test 4: Create New Stream Key Option
```
1. Follow Test 2 steps 1-3
2. Wait for stream keys to load
3. Keep default "🔑 Create new stream key" selected
4. Fill other required fields
5. Click "Create Stream"
6. ✅ Verify: Stream created
7. Note: New stream key will be created when actually used
```

**Expected Result**: Form accepts "create new" option.

---

### ✅ Test 5: Switch Between Modes
```
1. Navigate to Studio → Control Room
2. Click "Create New Stream" button
3. ✅ Start: Manual mode visible
4. Select YouTube Account
5. ✅ Verify: Switches to Auto mode
6. ✅ Verify: Dropdown visible, manual input hidden
7. Change account back to "-- Manual Stream Key --"
8. ✅ Verify: Switches back to Manual mode
9. ✅ Verify: Manual input visible, dropdown hidden
```

**Expected Result**: Seamless mode switching works.

---

### ✅ Test 6: No Existing Keys
```
1. Navigate to Studio → Control Room
2. Click "Create New Stream" button
3. Select a NEW YouTube Account (no streams yet)
4. ✅ Verify: Loading spinner appears
5. ✅ Verify: Dropdown only shows "🔑 Create new stream key"
6. ✅ Verify: Toast: "No existing stream keys found..."
7. Fill form and submit
8. ✅ Verify: Stream created successfully
```

**Expected Result**: Handles empty state gracefully.

---

### ✅ Test 7: Error Handling
```
1. Disconnect internet temporarily
2. Navigate to Studio → Control Room
3. Click "Create New Stream" button
4. Select YouTube Account
5. ✅ Verify: Error toast appears
6. ✅ Verify: Can still use manual mode
7. Switch back to "-- Manual Stream Key --"
8. ✅ Verify: Manual input works
9. Restore internet
10. ✅ Verify: Auto mode works again
```

**Expected Result**: Graceful error handling, manual fallback works.

---

### ✅ Test 8: Multiple Accounts
```
1. Navigate to Studio → Control Room
2. Click "Create New Stream" button
3. Select Account 1
4. ✅ Verify: Stream keys for Account 1 loaded
5. Change to Account 2
6. ✅ Verify: Loading spinner appears
7. ✅ Verify: Stream keys for Account 2 loaded
8. ✅ Verify: Different keys than Account 1
9. Select a key from Account 2
10. ✅ Verify: Correct key selected
```

**Expected Result**: Each account has its own stream keys.

---

### ✅ Test 9: Form Validation
```
1. Navigate to Studio → Control Room
2. Click "Create New Stream" button
3. Try to submit empty form
4. ✅ Verify: Validation errors shown
5. Select YouTube Account
6. ✅ Verify: Stream Key dropdown required
7. Fill all required fields
8. ✅ Verify: Form submits successfully
```

**Expected Result**: Form validation works correctly.

---

### ✅ Test 10: UI Consistency
```
1. Open Control Room "Create New Stream"
2. ✅ Verify: YouTube Account dropdown styled correctly
3. ✅ Verify: Stream Key dropdown matches design
4. ✅ Verify: Icons (🔑, 📋) display correctly
5. ✅ Verify: Loading spinner blue color (primary)
6. ✅ Verify: Helper text visible and clear
7. ✅ Verify: Separator visible in dropdown
8. ✅ Verify: Auto-fill indicator green color
```

**Expected Result**: UI matches YouTube Studio style.

---

## 🔍 Console Checks

Open browser console (F12) and verify:

### No Errors:
```javascript
// ✅ Should NOT see:
❌ Uncaught TypeError
❌ Uncaught ReferenceError
❌ 404 Not Found
❌ 500 Internal Server Error
```

### Expected Logs:
```javascript
// ✅ Should see:
✅ [Control Room] Fetching stream keys from: /api/youtube/streams?accountId=X
✅ [Control Room] Stream keys response: {success: true, streams: [...]}
✅ [Control Room] Found X stream keys
✅ [Control Room] Selected stream key: xxxx-xxxx-xxxx
✅ [Control Room] RTMP URL: rtmp://...
```

---

## 📱 Mobile Testing

Repeat tests 1-5 on mobile/responsive view:

```
1. ✅ Dropdowns work on mobile
2. ✅ Touch interactions responsive
3. ✅ Toast notifications visible
4. ✅ Loading spinners visible
5. ✅ Text readable (not too small)
6. ✅ No horizontal scroll
7. ✅ Buttons touchable (min 44px)
```

---

## 🎨 Visual Regression

Compare with YouTube Studio tab:

| Element | Control Room | YouTube Studio | Match? |
|---------|--------------|----------------|--------|
| Account dropdown | Visual check | Visual check | ✅ |
| Stream key dropdown | Visual check | Visual check | ✅ |
| Icons (🔑, 📋) | Visual check | Visual check | ✅ |
| Separators | Visual check | Visual check | ✅ |
| Loading spinner | Visual check | Visual check | ✅ |
| Toast style | Visual check | Visual check | ✅ |
| Colors | Visual check | Visual check | ✅ |

---

## 🔧 Debugging Tips

### If stream keys not loading:
```javascript
// Check in console:
1. Is accountId correct?
   console.log('Account ID:', accountId);

2. Is API responding?
   Network tab → Check /api/youtube/streams response

3. Is account connected?
   Check YouTube Accounts page

4. Is token valid?
   Look for "TOKEN_EXPIRED" in response
```

### If dropdown not populating:
```javascript
// Check in console:
1. Are streams in response?
   console.log('Streams:', data.streams);

2. Is select element found?
   console.log('Select element:', select);

3. Are options being created?
   console.log('Option count:', select.options.length);
```

### If form submission fails:
```javascript
// Check in console:
1. Is stream key set?
   const key = document.getElementById('controlRoomStreamKeyValue').value;
   console.log('Stream Key:', key);

2. Is RTMP URL set?
   const rtmp = document.getElementById('rtmpUrl').value;
   console.log('RTMP URL:', rtmp);

3. Check form data:
   const formData = new FormData(form);
   for (let [key, value] of formData.entries()) {
     console.log(key, value);
   }
```

---

## ✅ Acceptance Criteria

Feature is ready when ALL checks pass:

### Functionality:
- [ ] Manual mode works (original behavior)
- [ ] Auto mode loads stream keys
- [ ] Can select existing stream key
- [ ] Can create new stream key
- [ ] Mode switching works seamlessly
- [ ] Multiple accounts work independently
- [ ] RTMP URL updates automatically
- [ ] Form submits with correct data

### UI/UX:
- [ ] Visual design matches YouTube Studio
- [ ] Icons display correctly
- [ ] Loading states clear
- [ ] Success feedback visible
- [ ] Error messages helpful
- [ ] Mobile responsive
- [ ] Accessible (keyboard navigation)

### Error Handling:
- [ ] API errors handled gracefully
- [ ] Network errors don't block form
- [ ] Token expiry shows clear message
- [ ] Empty state handled well
- [ ] Validation errors clear

### Performance:
- [ ] No console errors
- [ ] API calls efficient (not excessive)
- [ ] UI responsive (no lag)
- [ ] Loading states brief
- [ ] No memory leaks

### Code Quality:
- [ ] No syntax errors
- [ ] Functions well-named
- [ ] Code commented
- [ ] Follows project patterns
- [ ] No code duplication

---

## 🎊 Sign-Off Checklist

Ready for production when:

- [ ] All test scenarios pass
- [ ] No console errors
- [ ] Mobile responsive
- [ ] Error handling robust
- [ ] Documentation complete
- [ ] Code reviewed
- [ ] Backward compatible verified
- [ ] Manual mode still works
- [ ] YouTube Studio unaffected
- [ ] Performance acceptable

---

## 📊 Test Report Template

```markdown
# Test Report - Control Room YouTube Integration

**Date**: [Date]
**Tester**: [Name]
**Environment**: [Dev/Staging/Production]

## Test Results

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | Manual Mode | ✅ PASS | Works as expected |
| 2 | Auto Load Keys | ✅ PASS | Loaded 5 keys |
| 3 | Select Existing | ✅ PASS | Key auto-filled |
| 4 | Create New | ✅ PASS | Form accepted |
| 5 | Mode Switching | ✅ PASS | Seamless |
| 6 | No Keys | ✅ PASS | Graceful handling |
| 7 | Error Handling | ✅ PASS | Manual fallback works |
| 8 | Multiple Accounts | ✅ PASS | Each has own keys |
| 9 | Form Validation | ✅ PASS | Errors shown correctly |
| 10 | UI Consistency | ✅ PASS | Matches design |

## Issues Found

1. [Issue description] - [Severity: Critical/High/Medium/Low]
2. [Issue description] - [Severity: Critical/High/Medium/Low]

## Summary

- Total Tests: 10
- Passed: X
- Failed: Y
- Blocked: Z

**Recommendation**: [APPROVED / NEEDS FIXES]

**Signature**: ________________
```

---

**Ready to test!** Follow tests 1-10 in order for comprehensive coverage. 🚀
