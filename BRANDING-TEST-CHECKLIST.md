# Branding Feature Testing Checklist

## 🧪 Pre-Testing Setup

- [ ] Application is running
- [ ] Logged in as admin user
- [ ] Navigate to Settings → Branding tab

---

## 1️⃣ Logo Upload Test

### Test Case 1.1: Valid Logo Upload
- [ ] Click "Upload Logo" button
- [ ] Select a PNG file (< 2MB)
- [ ] ✅ Preview updates immediately
- [ ] ✅ Success notification appears
- [ ] ✅ Logo appears in header/navbar
- [ ] Refresh page
- [ ] ✅ Logo persists after refresh

### Test Case 1.2: SVG Logo Upload
- [ ] Click "Upload Logo" button
- [ ] Select an SVG file (< 2MB)
- [ ] ✅ Preview updates immediately
- [ ] ✅ Success notification appears

### Test Case 1.3: JPG Logo Upload
- [ ] Click "Upload Logo" button
- [ ] Select a JPG file (< 2MB)
- [ ] ✅ Preview updates immediately
- [ ] ✅ Success notification appears

### Test Case 1.4: Invalid File Type
- [ ] Click "Upload Logo" button
- [ ] Try to select a PDF or TXT file
- [ ] ❌ Error message appears
- [ ] ❌ Upload rejected

### Test Case 1.5: File Too Large
- [ ] Click "Upload Logo" button
- [ ] Select a file > 2MB
- [ ] ❌ Error message: "Logo file size must be less than 2MB"
- [ ] ❌ Upload rejected

---

## 2️⃣ Favicon Upload Test

### Test Case 2.1: Valid Favicon Upload (ICO)
- [ ] Click "Upload Favicon" button
- [ ] Select an ICO file (< 500KB)
- [ ] ✅ Preview updates immediately
- [ ] ✅ Success notification appears
- [ ] ✅ Browser tab icon updates
- [ ] Refresh page
- [ ] ✅ Favicon persists after refresh

### Test Case 2.2: Valid Favicon Upload (PNG)
- [ ] Click "Upload Favicon" button
- [ ] Select a PNG file (< 500KB)
- [ ] ✅ Preview updates immediately
- [ ] ✅ Success notification appears
- [ ] ✅ Browser tab icon updates

### Test Case 2.3: Invalid File Type
- [ ] Click "Upload Favicon" button
- [ ] Try to select a JPG or SVG file
- [ ] ❌ Error message appears
- [ ] ❌ Upload rejected

### Test Case 2.4: File Too Large
- [ ] Click "Upload Favicon" button
- [ ] Select a file > 500KB
- [ ] ❌ Error message: "Favicon file size must be less than 500KB"
- [ ] ❌ Upload rejected

---

## 3️⃣ Application Identity Test

### Test Case 3.1: Change Application Name
- [ ] Change "Application Name" field
- [ ] Click "Save Branding"
- [ ] ✅ Success notification appears
- [ ] ✅ Page reloads
- [ ] ✅ New name appears in browser title
- [ ] ✅ New name appears in header

### Test Case 3.2: Change Company Name
- [ ] Change "Company Name" field
- [ ] Click "Save Branding"
- [ ] ✅ Success notification appears
- [ ] ✅ Page reloads
- [ ] ✅ New company name appears in footer

---

## 4️⃣ Color Scheme Test

### Test Case 4.1: Change Primary Color
- [ ] Click primary color picker
- [ ] Select a new color
- [ ] ✅ Hex code updates in text field
- [ ] ✅ Preview button updates immediately
- [ ] Click "Save Branding"
- [ ] ✅ Page reloads with new primary color
- [ ] ✅ Buttons use new primary color

### Test Case 4.2: Change Secondary Color
- [ ] Click secondary color picker
- [ ] Select a new color
- [ ] ✅ Hex code updates in text field
- [ ] ✅ Preview button updates immediately
- [ ] Click "Save Branding"
- [ ] ✅ Page reloads with new secondary color

### Test Case 4.3: Change Accent Color
- [ ] Click accent color picker
- [ ] Select a new color
- [ ] ✅ Hex code updates in text field
- [ ] ✅ Preview badge updates immediately
- [ ] Click "Save Branding"
- [ ] ✅ Page reloads with new accent color

### Test Case 4.4: Manual Hex Code Entry
- [ ] Type hex code directly (e.g., #FF5733)
- [ ] ✅ Color picker updates
- [ ] ✅ Preview updates
- [ ] Click "Save Branding"
- [ ] ✅ Color applied successfully

---

## 5️⃣ Footer & Contact Test

### Test Case 5.1: Change Footer Text
- [ ] Change "Footer Text" field
- [ ] Click "Save Branding"
- [ ] ✅ Success notification appears
- [ ] ✅ Page reloads
- [ ] Scroll to bottom
- [ ] ✅ New footer text appears

### Test Case 5.2: Change Support Email
- [ ] Change "Support Email" field
- [ ] Click "Save Branding"
- [ ] ✅ Success notification appears
- [ ] ✅ Email saved successfully

### Test Case 5.3: Add Support URL
- [ ] Enter a URL in "Support URL" field
- [ ] Click "Save Branding"
- [ ] ✅ Success notification appears
- [ ] ✅ URL saved successfully

---

## 6️⃣ Attribution Test

### Test Case 6.1: Toggle "Powered by OzangLive"
- [ ] Toggle switch ON
- [ ] Click "Save Branding"
- [ ] ✅ Page reloads
- [ ] Scroll to bottom
- [ ] ✅ "Powered by OzangLive" appears in footer

### Test Case 6.2: Hide Attribution
- [ ] Toggle switch OFF
- [ ] Click "Save Branding"
- [ ] ✅ Page reloads
- [ ] Scroll to bottom
- [ ] ✅ "Powered by OzangLive" is hidden

---

## 7️⃣ Reset to Default Test

### Test Case 7.1: Reset All Branding
- [ ] Make several changes (logo, colors, text)
- [ ] Click "Reset to Default" button
- [ ] ✅ Confirmation dialog appears
- [ ] Confirm reset
- [ ] ✅ Success notification appears
- [ ] ✅ Page reloads
- [ ] ✅ All settings back to default
- [ ] ✅ Default logo restored
- [ ] ✅ Default colors restored
- [ ] ✅ Default text restored

---

## 8️⃣ UI/UX Test

### Test Case 8.1: Layout Check
- [ ] ✅ 2-column grid on desktop
- [ ] ✅ Single column on mobile
- [ ] ✅ All sections properly aligned
- [ ] ✅ Icons display correctly
- [ ] ✅ No Custom CSS section visible

### Test Case 8.2: Responsive Design
- [ ] Resize browser window
- [ ] ✅ Layout adapts smoothly
- [ ] ✅ No horizontal scrolling
- [ ] ✅ All buttons accessible
- [ ] ✅ Form fields remain usable

### Test Case 8.3: Visual Polish
- [ ] ✅ Consistent spacing
- [ ] ✅ Proper color contrast
- [ ] ✅ Icons aligned with text
- [ ] ✅ Buttons have hover effects
- [ ] ✅ Form inputs have focus states

---

## 9️⃣ Error Handling Test

### Test Case 9.1: Network Error Simulation
- [ ] Disconnect internet
- [ ] Try to save branding
- [ ] ✅ Error notification appears
- [ ] ✅ Form remains editable
- [ ] Reconnect internet
- [ ] Try again
- [ ] ✅ Saves successfully

### Test Case 9.2: Invalid Data
- [ ] Enter invalid email format
- [ ] Click "Save Branding"
- [ ] ✅ Validation error appears
- [ ] Fix email
- [ ] ✅ Saves successfully

---

## 🔟 Integration Test

### Test Case 10.1: Full Workflow
- [ ] Upload custom logo
- [ ] Upload custom favicon
- [ ] Change all colors
- [ ] Update application name
- [ ] Update company name
- [ ] Update footer text
- [ ] Update support email
- [ ] Add support URL
- [ ] Toggle attribution OFF
- [ ] Click "Save Branding"
- [ ] ✅ All changes applied
- [ ] ✅ Page reloads correctly
- [ ] ✅ All customizations visible
- [ ] Logout and login again
- [ ] ✅ All customizations persist

---

## ✅ Test Results Summary

| Category | Tests Passed | Tests Failed | Notes |
|----------|--------------|--------------|-------|
| Logo Upload | __ / 5 | __ / 5 | |
| Favicon Upload | __ / 4 | __ / 4 | |
| Identity | __ / 2 | __ / 2 | |
| Colors | __ / 4 | __ / 4 | |
| Footer & Contact | __ / 3 | __ / 3 | |
| Attribution | __ / 2 | __ / 2 | |
| Reset | __ / 1 | __ / 1 | |
| UI/UX | __ / 3 | __ / 3 | |
| Error Handling | __ / 2 | __ / 2 | |
| Integration | __ / 1 | __ / 1 | |
| **TOTAL** | __ / 27 | __ / 27 | |

---

## 🐛 Issues Found

| # | Issue Description | Severity | Status |
|---|-------------------|----------|--------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

---

## 📝 Notes

- Test Date: _______________
- Tester: _______________
- Browser: _______________
- OS: _______________
- Application Version: _______________

---

## ✅ Sign-off

- [ ] All critical tests passed
- [ ] All issues documented
- [ ] Ready for production

**Tester Signature**: _______________  
**Date**: _______________
