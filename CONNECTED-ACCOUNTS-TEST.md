# Connected Accounts Collapsible - Testing Guide

## Quick Test Steps

### 1. Initial Load Test
- [ ] Buka halaman YouTube tab
- [ ] Verify: Connected Accounts section muncul dengan header
- [ ] Verify: Daftar accounts **TIDAK terlihat** (collapsed by default)
- [ ] Verify: Chevron menunjukkan **▶** (pointing right)
- [ ] Verify: Counter badge menampilkan jumlah accounts yang benar
- [ ] Verify: Text "Click to expand/collapse" terlihat

### 2. Expand Test
- [ ] Klik pada header "Connected Accounts"
- [ ] Verify: Daftar accounts **muncul**
- [ ] Verify: Chevron berubah menjadi **▼** (pointing down)
- [ ] Verify: Semua accounts terlihat dengan detail lengkap
- [ ] Verify: Button actions (Edit, Star, Unlink) terlihat

### 3. Collapse Test
- [ ] Klik lagi pada header "Connected Accounts"
- [ ] Verify: Daftar accounts **tersembunyi**
- [ ] Verify: Chevron berubah kembali menjadi **▶**
- [ ] Verify: Counter badge tetap terlihat

### 4. Add Account Button Test
- [ ] Pastikan accounts dalam keadaan collapsed
- [ ] Klik button "Add Account"
- [ ] Verify: Modal "Add Account" terbuka
- [ ] Verify: Daftar accounts **TIDAK expand** (tetap collapsed)
- [ ] Close modal
- [ ] Verify: State tetap collapsed

### 5. Multiple Toggle Test
- [ ] Toggle expand/collapse 5-10 kali dengan cepat
- [ ] Verify: Tidak ada error di console
- [ ] Verify: Chevron selalu sync dengan state
- [ ] Verify: Tidak ada visual glitch

### 6. Mobile Responsive Test
- [ ] Buka di mobile view (atau resize browser < 640px)
- [ ] Verify: Header tetap clickable
- [ ] Verify: Layout tidak broken
- [ ] Verify: Button "Add Account" tetap accessible
- [ ] Verify: Touch interaction smooth

### 7. Desktop Responsive Test
- [ ] Buka di desktop view (> 640px)
- [ ] Verify: Layout rapi dan aligned
- [ ] Verify: Semua elements terlihat dengan baik
- [ ] Verify: Hover effects berfungsi

### 8. Multiple Accounts Test
**Dengan 1 Account:**
- [ ] Verify: Counter badge menampilkan "(1)"
- [ ] Verify: Expand/collapse berfungsi normal

**Dengan 3+ Accounts:**
- [ ] Verify: Counter badge menampilkan jumlah yang benar
- [ ] Verify: Semua accounts terlihat saat expanded
- [ ] Verify: Scrolling smooth jika banyak accounts

**Dengan 0 Accounts:**
- [ ] Verify: Section tidak muncul (fallback ke credentials form)

### 9. Account Actions Test (Expanded State)
- [ ] Expand accounts list
- [ ] Klik button "Edit" pada salah satu account
- [ ] Verify: Modal edit terbuka
- [ ] Close modal
- [ ] Verify: Accounts list tetap expanded

- [ ] Klik button "Star" (Set Primary)
- [ ] Verify: Account menjadi primary
- [ ] Verify: Accounts list tetap expanded

- [ ] Klik button "Unlink"
- [ ] Verify: Confirmation muncul
- [ ] Cancel confirmation
- [ ] Verify: Accounts list tetap expanded

### 10. Visual Consistency Test
- [ ] Verify: Icon users (👥) terlihat di header
- [ ] Verify: Icon YouTube (📺) terlihat di setiap account
- [ ] Verify: Primary badge terlihat dengan warna yang benar
- [ ] Verify: Connected status (✓) terlihat dengan warna hijau
- [ ] Verify: Border dan shadow konsisten dengan design system

### 11. Browser Compatibility Test

**Chrome/Edge:**
- [ ] Expand/collapse berfungsi
- [ ] Visual rendering correct
- [ ] No console errors

**Firefox:**
- [ ] Expand/collapse berfungsi
- [ ] Visual rendering correct
- [ ] No console errors

**Safari (if available):**
- [ ] Expand/collapse berfungsi
- [ ] Visual rendering correct
- [ ] No console errors

### 12. Console Error Check
- [ ] Buka Developer Console (F12)
- [ ] Perform all toggle actions
- [ ] Verify: **NO errors** di console
- [ ] Verify: **NO warnings** terkait missing elements

### 13. Accessibility Test
- [ ] Verify: Header memiliki cursor pointer saat hover
- [ ] Verify: Hover effect terlihat (bg-gray-800/50)
- [ ] Verify: Button tooltips berfungsi
- [ ] Verify: Text readable dengan contrast yang baik

### 14. Performance Test
- [ ] Toggle expand/collapse 20 kali
- [ ] Verify: Tidak ada lag atau delay
- [ ] Verify: Memory usage tidak meningkat drastis
- [ ] Verify: Smooth animation

### 15. Integration Test dengan Broadcasts
- [ ] Collapse accounts
- [ ] Scroll ke broadcasts section
- [ ] Verify: Broadcasts grouping tetap berfungsi
- [ ] Expand salah satu broadcast channel
- [ ] Scroll up dan expand accounts
- [ ] Verify: Kedua collapsible sections berfungsi independent

## Expected Behavior Summary

### ✅ Default State (Page Load)
```
┌─────────────────────────────────────────────────┐
│ 👥 Connected Accounts (3)          [+ Add] ▶   │
│ Click to expand/collapse                        │
└─────────────────────────────────────────────────┘
```

### ✅ Expanded State (After Click)
```
┌─────────────────────────────────────────────────┐
│ 👥 Connected Accounts (3)          [+ Add] ▼   │
│ Click to expand/collapse                        │
├─────────────────────────────────────────────────┤
│ 📺 Channel 1  [Primary] ⭐ ✏️ 🔗               │
│ 📺 Channel 2            ⭐ ✏️ 🔗               │
│ 📺 Channel 3            ⭐ ✏️ 🔗               │
└─────────────────────────────────────────────────┘
```

## Common Issues & Solutions

### Issue: Chevron tidak berubah
**Solution:** Check console untuk errors, verify element IDs correct

### Issue: Accounts tidak muncul saat expand
**Solution:** Check `display: none` di initial state, verify JavaScript function

### Issue: Add Account button trigger toggle
**Solution:** Verify `event.stopPropagation()` ada di button onclick

### Issue: Layout broken di mobile
**Solution:** Check responsive classes (sm:, md:), verify flex/grid layout

### Issue: Multiple clicks cause glitch
**Solution:** Add debounce atau check if animation in progress

## Test Results Template

```
Date: _______________
Tester: _______________
Browser: _______________
Device: _______________

✅ Initial Load: PASS / FAIL
✅ Expand: PASS / FAIL
✅ Collapse: PASS / FAIL
✅ Add Button: PASS / FAIL
✅ Mobile: PASS / FAIL
✅ Desktop: PASS / FAIL
✅ Multiple Accounts: PASS / FAIL
✅ Console Errors: NONE / FOUND
✅ Performance: GOOD / ISSUES

Notes:
_________________________________
_________________________________
_________________________________
```

## Automated Test Ideas (Future)

```javascript
// Cypress/Playwright test example
describe('Connected Accounts Collapsible', () => {
  it('should be collapsed by default', () => {
    cy.visit('/youtube');
    cy.get('#connectedAccountsList').should('not.be.visible');
    cy.get('#accountsChevron').should('contain', '▶');
  });
  
  it('should expand when header clicked', () => {
    cy.get('[onclick="toggleConnectedAccounts()"]').click();
    cy.get('#connectedAccountsList').should('be.visible');
    cy.get('#accountsChevron').should('contain', '▼');
  });
  
  it('should not expand when Add button clicked', () => {
    cy.get('button:contains("Add Account")').click();
    cy.get('#connectedAccountsList').should('not.be.visible');
  });
});
```

## Sign-off

- [ ] All tests passed
- [ ] No critical issues found
- [ ] Ready for production

**Tested by:** _______________
**Date:** _______________
**Signature:** _______________
