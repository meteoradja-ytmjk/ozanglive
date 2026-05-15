# 🧪 Test Guide - Collapsible Connected Accounts

## 🚀 Quick Start

### 1. Start Application
```bash
npm start
# atau
node app.js
```

### 2. Open Browser
```
http://localhost:3000/youtube
```

## ✅ Test Checklist

### A. Initial State (Default Collapsed)
- [ ] Page loads successfully
- [ ] Connected Accounts header visible
- [ ] Account count badge shows correct number (e.g., [3])
- [ ] Chevron icon is pointing RIGHT (▶)
- [ ] Text shows "Click to expand"
- [ ] List accounts is HIDDEN (collapsed)
- [ ] "Add Account" button visible and clickable

### B. Expand Animation
- [ ] Click on header area
- [ ] List expands with SMOOTH animation (not instant)
- [ ] Chevron rotates 90° to DOWN (▼)
- [ ] Text changes to "Click to collapse"
- [ ] Account cards appear with staggered animation
- [ ] Each card slides in from top with fade-in effect
- [ ] Animation duration: ~0.4 seconds

### C. Account Cards Display
- [ ] All accounts visible after expand
- [ ] YouTube icon with gradient background
- [ ] Channel name displayed correctly
- [ ] Primary account has:
  - [ ] Yellow star badge in corner of avatar
  - [ ] "Primary" badge with star icon
  - [ ] Yellow color scheme
- [ ] Non-primary accounts show star outline icon
- [ ] Status shows "Connected & Active" with checkmark
- [ ] Three action buttons visible:
  - [ ] Edit (blue)
  - [ ] Star (yellow/gray)
  - [ ] Disconnect (red)

### D. Hover Effects
- [ ] Header hover: background changes to lighter shade
- [ ] Icon hover: background becomes more opaque
- [ ] Account card hover:
  - [ ] Border glows with primary color
  - [ ] Shadow appears
  - [ ] Smooth transition
- [ ] Button hover: background color changes

### E. Collapse Animation
- [ ] Click header again
- [ ] List collapses with SMOOTH animation
- [ ] Chevron rotates back to RIGHT (▶)
- [ ] Text changes to "Click to expand"
- [ ] Opacity fades out smoothly
- [ ] Animation duration: ~0.4 seconds

### F. Functionality Tests
- [ ] "Add Account" button works (modal opens)
- [ ] Edit button opens edit modal
- [ ] Star button sets/unsets primary account
- [ ] Disconnect button shows confirmation
- [ ] All buttons work in both collapsed and expanded state

### G. Responsive Design
#### Desktop (>768px)
- [ ] Full width layout
- [ ] "Add Account" text visible
- [ ] All account info visible
- [ ] Hover effects work

#### Mobile (<768px)
- [ ] Compact layout
- [ ] "Add" text (shortened)
- [ ] Account info stacked properly
- [ ] Touch-friendly tap targets
- [ ] No horizontal scroll

### H. Multiple Accounts Test
Test with different account counts:
- [ ] 1 account: works correctly
- [ ] 3 accounts: staggered animation visible
- [ ] 5+ accounts: scroll works if needed
- [ ] 10+ accounts: performance is good

### I. Edge Cases
- [ ] Rapid clicking header (no animation glitches)
- [ ] Click "Add Account" while collapsed (works)
- [ ] Click "Add Account" while expanded (works)
- [ ] Refresh page: returns to collapsed state
- [ ] Browser back/forward: state resets correctly

### J. Browser Compatibility
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)
- [ ] Mobile browsers

## 🎯 Expected Behavior

### Collapsed State
```
┌─────────────────────────────────────────┐
│ 👥 Connected Accounts [3]    [Add] [▶] │
│    👆 Click to expand                   │
└─────────────────────────────────────────┘
```

### Expanded State
```
┌─────────────────────────────────────────┐
│ 👥 Connected Accounts [3]    [Add] [▼] │
│    👆 Click to collapse                 │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 📺⭐ Channel 1  [⭐Primary]         │ │
│ │    ✓ Connected & Active             │ │
│ │              [Edit] [⭐] [Disconnect]│ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 📺 Channel 2                        │ │
│ │    ✓ Connected & Active             │ │
│ │              [Edit] [☆] [Disconnect]│ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 📺 Channel 3                        │ │
│ │    ✓ Connected & Active             │ │
│ │              [Edit] [☆] [Disconnect]│ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## 🐛 Common Issues & Solutions

### Issue 1: Animation Not Smooth
**Symptom**: List appears/disappears instantly
**Solution**: Check CSS transitions are applied
```css
#connectedAccountsList {
  transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), 
              opacity 0.3s ease;
}
```

### Issue 2: Chevron Not Rotating
**Symptom**: Chevron stays as ▶ or ▼
**Solution**: Check JavaScript is updating transform
```javascript
chevron.style.transform = 'rotate(90deg)'; // expanded
chevron.style.transform = 'rotate(0deg)';  // collapsed
```

### Issue 3: Cards Not Animating
**Symptom**: Cards appear instantly without slide-in
**Solution**: Check animation CSS and inline style
```html
style="animation: slideIn 0.3s ease-out <%= index * 0.05 %>s both;"
```

### Issue 4: Text Not Updating
**Symptom**: "Click to expand" doesn't change
**Solution**: Check element ID exists
```javascript
const toggleText = document.getElementById('accountsToggleText');
if (toggleText) toggleText.textContent = 'collapse';
```

## 📊 Performance Metrics

### Expected Performance
- **Animation FPS**: 60fps (smooth)
- **Expand Time**: ~400ms
- **Collapse Time**: ~400ms
- **Memory Impact**: Minimal (<1MB)
- **CPU Usage**: Low (<5% during animation)

### How to Check
1. Open DevTools (F12)
2. Go to Performance tab
3. Record while expanding/collapsing
4. Check FPS graph (should be steady 60fps)

## 🎨 Visual Verification

### Colors to Verify
- **Primary Color**: `#your-primary-color` (badge, hover)
- **Red**: `#ef4444` (YouTube icon, Add button)
- **Yellow**: `#eab308` (Primary badge, star)
- **Green**: `#22c55e` (Connected status)
- **Gray**: Various shades for backgrounds

### Spacing to Verify
- **Header Padding**: 1rem (mobile), 1.5rem (desktop)
- **Card Gap**: 0.75rem
- **Card Padding**: 0.75rem (mobile), 1rem (desktop)
- **Icon Size**: 2.5rem (header), 2.75rem (card)

## 📝 Test Results Template

```
Date: ___________
Tester: ___________
Browser: ___________
Device: ___________

Initial State:        [ ] Pass  [ ] Fail
Expand Animation:     [ ] Pass  [ ] Fail
Card Display:         [ ] Pass  [ ] Fail
Hover Effects:        [ ] Pass  [ ] Fail
Collapse Animation:   [ ] Pass  [ ] Fail
Functionality:        [ ] Pass  [ ] Fail
Responsive:           [ ] Pass  [ ] Fail
Edge Cases:           [ ] Pass  [ ] Fail

Notes:
_________________________________
_________________________________
_________________________________

Overall: [ ] PASS  [ ] FAIL
```

## 🎉 Success Criteria

Feature is considered **SUCCESSFUL** if:
- ✅ All checklist items pass
- ✅ No console errors
- ✅ Smooth 60fps animation
- ✅ Works on all tested browsers
- ✅ Responsive on mobile and desktop
- ✅ No breaking changes to existing features

## 🚨 Critical Issues

Report immediately if:
- ❌ Page doesn't load
- ❌ JavaScript errors in console
- ❌ Buttons don't work
- ❌ Animation causes lag/freeze
- ❌ Layout breaks on mobile

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify all files are saved
3. Clear browser cache
4. Restart application
5. Check documentation files

---

**Happy Testing! 🎉**
