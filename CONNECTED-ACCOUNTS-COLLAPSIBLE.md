# Connected Accounts - Collapsible Feature

## 📋 Overview
Fitur collapsible untuk Connected Accounts di tab YouTube yang memungkinkan user untuk expand/collapse list accounts dengan animasi smooth.

## ✨ Fitur

### 1. **Default Collapsed**
- Saat pertama kali load, list accounts **collapsed** (tersembunyi)
- Hanya menampilkan header dengan jumlah accounts
- Menghemat space di halaman

### 2. **Smooth Animation**
- Animasi expand/collapse yang smooth menggunakan CSS transitions
- Chevron icon berputar 90° saat expand
- Opacity fade in/out untuk efek yang lebih halus
- Slide-in animation untuk setiap account item

### 3. **Visual Feedback**
- Hover effect pada header (background berubah)
- Icon berubah: ▶ (collapsed) → ▼ (expanded)
- Text berubah: "Click to expand" → "Click to collapse"
- Hover effect pada account cards dengan border glow

### 4. **Enhanced Account Cards**
- Primary account badge dengan star icon
- Status "Connected & Active" dengan checkmark
- Gradient background untuk YouTube icon
- Hover effects dengan shadow glow
- Staggered animation saat expand (setiap card muncul bertahap)

## 🎨 UI Improvements

### Header Section
```
┌─────────────────────────────────────────────────────┐
│ 📺 Connected Accounts [3]                    [Add] ▶│
│    Click to expand                                   │
└─────────────────────────────────────────────────────┘
```

### Expanded State
```
┌─────────────────────────────────────────────────────┐
│ 📺 Connected Accounts [3]                    [Add] ▼│
│    Click to collapse                                 │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📺 Channel Name 1  [⭐ Primary]  [Edit][⭐][🔗] │ │
│ │    ✓ Connected & Active                         │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📺 Channel Name 2              [Edit][☆][🔗]   │ │
│ │    ✓ Connected & Active                         │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 🔧 Technical Implementation

### CSS Animations
```css
/* Smooth collapse animation */
#connectedAccountsList {
  transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), 
              opacity 0.3s ease;
}

/* Slide in animation for items */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Chevron rotation */
#accountsChevron {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### JavaScript Toggle Function
```javascript
function toggleConnectedAccounts() {
  const accountsList = document.getElementById('connectedAccountsList');
  const chevron = document.getElementById('accountsChevron');
  const toggleText = document.getElementById('accountsToggleText');
  
  const isCollapsed = accountsList.style.maxHeight === '0px';
  
  if (isCollapsed) {
    // EXPAND
    accountsList.style.maxHeight = accountsList.scrollHeight + 'px';
    accountsList.style.opacity = '1';
    chevron.style.transform = 'rotate(90deg)';
    chevron.textContent = '▼';
    toggleText.textContent = 'collapse';
  } else {
    // COLLAPSE
    accountsList.style.maxHeight = '0px';
    accountsList.style.opacity = '0';
    chevron.style.transform = 'rotate(0deg)';
    chevron.textContent = '▶';
    toggleText.textContent = 'expand';
  }
}
```

## 🎯 Benefits

### 1. **Better UX**
- Cleaner interface saat pertama load
- User bisa fokus ke broadcasts tanpa distraksi
- Smooth animations membuat interaksi lebih pleasant

### 2. **Space Efficiency**
- Menghemat vertical space di halaman
- Penting untuk user dengan banyak accounts
- Mobile-friendly (lebih compact)

### 3. **Visual Hierarchy**
- Jelas mana yang primary account (star badge)
- Status connection terlihat jelas
- Actions (Edit, Star, Disconnect) mudah diakses

### 4. **Performance**
- Tidak perlu render semua account cards saat load
- Animasi menggunakan CSS (hardware accelerated)
- Smooth 60fps animation

## 📱 Responsive Design

### Desktop
- Full width cards dengan semua informasi
- Hover effects lebih prominent
- Button text visible ("Add Account")

### Mobile
- Compact layout
- Button text shortened ("Add")
- Touch-friendly tap targets
- Stacked layout untuk account info

## 🔄 User Flow

1. **Page Load**
   - Header visible dengan count badge
   - List collapsed (hidden)
   - Chevron pointing right (▶)

2. **User Clicks Header**
   - Chevron rotates 90° to down (▼)
   - List expands with smooth animation
   - Account cards slide in one by one
   - Text changes to "Click to collapse"

3. **User Clicks Again**
   - Chevron rotates back to right (▶)
   - List collapses smoothly
   - Opacity fades out
   - Text changes to "Click to expand"

## 🎨 Visual Enhancements

### Primary Account Badge
- Yellow star icon in corner of avatar
- "Primary" badge with star icon
- Yellow color scheme for distinction

### Account Cards
- Gradient background for YouTube icon
- Border glow on hover (primary color)
- Shadow effect on hover
- Smooth transitions for all interactions

### Staggered Animation
- Each account card animates in sequence
- 0.05s delay between each card
- Creates a "wave" effect
- More engaging than instant appearance

## 🧪 Testing Checklist

- [x] Default state is collapsed
- [x] Click to expand works
- [x] Click to collapse works
- [x] Chevron rotates correctly
- [x] Text updates correctly
- [x] Animations are smooth
- [x] Account cards display correctly
- [x] Primary badge shows correctly
- [x] Hover effects work
- [x] Mobile responsive
- [x] Add Account button works when collapsed
- [x] All action buttons (Edit, Star, Disconnect) work

## 📝 Notes

- Menggunakan `max-height` untuk smooth animation (bukan `display: none`)
- `scrollHeight` digunakan untuk calculate dynamic height
- Cubic-bezier easing untuk natural motion
- Staggered animation delay: `index * 0.05s`
- Compatible dengan existing functionality

## 🚀 Future Enhancements

1. **Remember State**
   - Save expand/collapse state di localStorage
   - Auto-expand jika user baru add account

2. **Search/Filter**
   - Search box untuk filter accounts
   - Useful untuk user dengan banyak accounts

3. **Drag & Drop**
   - Reorder accounts dengan drag & drop
   - Set priority order

4. **Quick Actions**
   - Bulk actions untuk multiple accounts
   - Quick switch primary account

## 🎉 Result

Fitur collapsible untuk Connected Accounts sudah berhasil diimplementasikan dengan:
- ✅ Default collapsed state
- ✅ Smooth expand/collapse animation
- ✅ Visual feedback yang jelas
- ✅ Enhanced account cards
- ✅ Mobile responsive
- ✅ Better UX dan space efficiency
