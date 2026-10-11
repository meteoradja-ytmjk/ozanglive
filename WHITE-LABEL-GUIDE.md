# 🎨 White Label Guide - OzangLive

## 📖 **Apa itu White Label?**

White Label memungkinkan Anda untuk **mengubah branding aplikasi** sesuai dengan identitas bisnis Anda sendiri, seolah-olah aplikasi ini adalah produk Anda.

---

## ✨ **Fitur White Label**

### **1. Application Identity**
- ✅ Custom App Name
- ✅ Custom Company Name
- ✅ Browser Title customization

### **2. Visual Branding**
- ✅ Custom Logo (PNG/SVG)
- ✅ Custom Favicon (ICO/PNG)
- ✅ Color Scheme (Primary, Secondary, Accent)

### **3. Content Customization**
- ✅ Custom Footer Text
- ✅ Support Email
- ✅ Support URL
- ✅ Show/Hide "Powered by OzangLive"

### **4. Advanced**
- ✅ Custom CSS injection
- ✅ Real-time preview
- ✅ One-click reset to default

---

## 🚀 **Cara Menggunakan**

### **Step 1: Akses Settings**
1. Login sebagai **Admin**
2. Klik **Settings** di sidebar
3. Pilih tab **Branding**

### **Step 2: Customize Identity**
```
Application Name: YourBrand
Company Name: Your Company Inc.
```

### **Step 3: Upload Logo**
1. Klik **Upload Logo**
2. Pilih file PNG/SVG (recommended: 200x60px)
3. Preview akan muncul otomatis

**Rekomendasi Logo:**
- Format: PNG dengan transparent background
- Ukuran: 200x60px atau 400x120px (2x untuk retina)
- Max size: 2MB

### **Step 4: Upload Favicon**
1. Klik **Upload Favicon**
2. Pilih file ICO atau PNG (32x32px atau 64x64px)

**Rekomendasi Favicon:**
- Format: ICO atau PNG
- Ukuran: 32x32px atau 64x64px
- Max size: 500KB

### **Step 5: Customize Colors**
1. Klik color picker untuk memilih warna
2. Atau ketik HEX code langsung (contoh: #FF6B35)
3. Preview akan update otomatis

**Color Guide:**
- **Primary**: Warna utama (buttons, links, highlights)
- **Secondary**: Hover states, active states
- **Accent**: Badges, notifications, special elements

### **Step 6: Footer & Contact**
```
Footer Text: © 2024 Your Company. All rights reserved.
Support Email: support@yourcompany.com
Support URL: https://support.yourcompany.com
```

### **Step 7: Save Changes**
1. Klik **Save Branding**
2. Halaman akan reload otomatis
3. Perubahan langsung terlihat!

---

## 🎨 **Use Cases**

### **Use Case 1: Reseller/Agency**
```
Scenario: Anda jual streaming service ke klien

Before White Label:
❌ "Kami pakai OzangLive untuk streaming Anda"
→ Klien tahu Anda cuma reseller

After White Label:
✅ "Ini platform streaming kami: StreamPro"
→ Klien pikir ini produk Anda sendiri
→ Anda bisa charge lebih mahal!
```

### **Use Case 2: Corporate/Enterprise**
```
Scenario: Perusahaan besar ingin internal platform

Before White Label:
❌ Logo "OzangLive" di dashboard
→ Terlihat seperti pakai software pihak ketiga

After White Label:
✅ Logo perusahaan di dashboard
→ Terlihat profesional & branded
```

### **Use Case 3: SaaS Business**
```
Scenario: Anda jual streaming platform sebagai SaaS

Before White Label:
❌ "Powered by OzangLive"
→ User bisa langsung cari & beli dari source

After White Label:
✅ "YourStreamingBrand.com"
→ User tidak tahu ini based on OzangLive
→ Anda kontrol pricing & branding
```

---

## 🎯 **Best Practices**

### **Logo Design**
✅ **DO:**
- Use transparent background (PNG)
- Keep it simple and readable
- Test on both light and dark backgrounds
- Use vector format (SVG) for scalability

❌ **DON'T:**
- Use complex gradients
- Include too much text
- Use low resolution images
- Forget to test on mobile

### **Color Selection**
✅ **DO:**
- Choose colors that match your brand
- Ensure good contrast for readability
- Test colors on different screens
- Keep it consistent across all elements

❌ **DON'T:**
- Use too many colors
- Choose colors that are too similar
- Forget about accessibility (WCAG)
- Use pure black (#000000) or pure white (#FFFFFF)

### **Custom CSS**
✅ **DO:**
- Test thoroughly before applying
- Keep it minimal and specific
- Comment your code
- Backup before major changes

❌ **DON'T:**
- Override core functionality
- Use !important excessively
- Break responsive design
- Forget to test on mobile

---

## 🔧 **Advanced Customization**

### **Custom CSS Examples**

#### **Example 1: Custom Font**
```css
/* Import custom font */
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap');

/* Apply to all text */
body, .font-sans {
  font-family: 'Montserrat', sans-serif !important;
}
```

#### **Example 2: Rounded Corners**
```css
/* Make all buttons more rounded */
button, .btn {
  border-radius: 12px !important;
}

/* Make cards more rounded */
.bg-gray-800, .bg-dark-700 {
  border-radius: 16px !important;
}
```

#### **Example 3: Custom Shadows**
```css
/* Add custom shadow to cards */
.bg-gray-800 {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
}

/* Add glow effect to buttons */
button:hover {
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.5) !important;
}
```

#### **Example 4: Hide Elements**
```css
/* Hide specific elements */
.powered-by-ozanglive {
  display: none !important;
}

/* Hide navigation items */
.nav-item-youtube {
  display: none !important;
}
```

---

## 🔄 **Reset to Default**

Jika Anda ingin kembali ke branding default:

1. Buka **Settings** → **Branding**
2. Klik **Reset to Default**
3. Konfirmasi reset
4. Semua branding akan kembali ke OzangLive default

**⚠️ Warning:** Reset akan menghapus semua customization termasuk logo yang di-upload!

---

## 📊 **Technical Details**

### **Database**
```sql
Table: branding_settings
- id: INTEGER (always 1)
- app_name: TEXT
- company_name: TEXT
- logo_path: TEXT
- favicon_path: TEXT
- primary_color: TEXT (HEX)
- secondary_color: TEXT (HEX)
- accent_color: TEXT (HEX)
- custom_css: TEXT
- footer_text: TEXT
- support_email: TEXT
- support_url: TEXT
- show_powered_by: INTEGER (0/1)
- updated_at: DATETIME
```

### **API Endpoints**
```
GET  /api/branding          - Get current branding
POST /api/branding          - Update branding (text only)
POST /api/branding/logo     - Upload logo
POST /api/branding/favicon  - Upload favicon
POST /api/branding/reset    - Reset to default
```

### **File Storage**
```
Uploaded files location:
/public/uploads/branding/

Logo: /uploads/branding/logo-{timestamp}.png
Favicon: /uploads/branding/favicon-{timestamp}.ico
```

### **Caching**
Branding settings di-cache selama **1 menit** untuk performance.
Cache otomatis clear saat update branding.

---

## 🐛 **Troubleshooting**

### **Issue 1: Logo tidak muncul**
**Cause:** File terlalu besar atau format tidak supported
**Solution:**
- Compress logo (max 2MB)
- Use PNG or SVG format
- Check file permissions

### **Issue 2: Warna tidak berubah**
**Cause:** Browser cache
**Solution:**
- Hard refresh: `Ctrl + Shift + R` (Windows) atau `Cmd + Shift + R` (Mac)
- Clear browser cache
- Try incognito mode

### **Issue 3: Custom CSS break layout**
**Cause:** Invalid CSS atau conflict dengan existing styles
**Solution:**
- Remove custom CSS
- Test CSS in browser DevTools first
- Use more specific selectors
- Avoid using !important

### **Issue 4: Changes tidak save**
**Cause:** Permission issue atau database error
**Solution:**
- Check browser console for errors
- Verify you're logged in as Admin
- Check server logs: `pm2 logs ozanglive`

### **Issue 5: Favicon tidak update**
**Cause:** Browser cache favicon aggressively
**Solution:**
- Clear browser cache completely
- Close and reopen browser
- Wait 5-10 minutes for cache to expire
- Use different browser to test

---

## 💡 **Tips & Tricks**

### **Tip 1: Test Before Deploy**
Always test branding changes in development before applying to production.

### **Tip 2: Backup Logo Files**
Keep original logo files in safe place. Upload folder might be cleared during updates.

### **Tip 3: Use Brand Guidelines**
If you have brand guidelines, follow them for colors, fonts, and logo usage.

### **Tip 4: Mobile Testing**
Always test branding on mobile devices. Logo might look different on small screens.

### **Tip 5: Accessibility**
Ensure color contrast meets WCAG standards for accessibility.

---

## 📈 **Business Benefits**

### **For Resellers:**
- ✅ Sell as your own product
- ✅ Charge premium prices
- ✅ Build brand recognition
- ✅ Client loyalty

### **For Agencies:**
- ✅ Professional appearance
- ✅ Client confidence
- ✅ Competitive advantage
- ✅ Recurring revenue

### **For Enterprises:**
- ✅ Internal branding
- ✅ Corporate identity
- ✅ Professional image
- ✅ Compliance with brand guidelines

---

## 🔐 **Security Notes**

1. **Admin Only:** Only admin users can access branding settings
2. **File Validation:** Uploaded files are validated for type and size
3. **SQL Injection:** All inputs are sanitized
4. **XSS Protection:** Custom CSS is sanitized (basic protection)

**⚠️ Warning:** Custom CSS can potentially break the application. Use with caution!

---

## 📞 **Support**

Jika Anda mengalami masalah dengan White Label:

1. Check this guide first
2. Check browser console for errors
3. Check server logs: `pm2 logs ozanglive`
4. Contact support with error details

---

## 📝 **Changelog**

### **Version 2.3.0** (Current)
- ✅ Initial White Label implementation
- ✅ Logo & Favicon upload
- ✅ Color customization
- ✅ Custom CSS support
- ✅ Footer customization
- ✅ Reset to default

### **Future Updates**
- 🔄 Login page background customization
- 🔄 Email template branding
- 🔄 Multi-tenant support (per-user branding)
- 🔄 Theme presets
- 🔄 Dark/Light mode toggle

---

**Happy Branding! 🎨**

If you have questions or suggestions, feel free to reach out!
