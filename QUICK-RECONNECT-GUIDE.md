# ⚡ Quick Reconnect Implementation Guide

## 🎯 Tujuan
Jika tidak bisa publish OAuth app ke Production, implementasi **one-click reconnect** untuk mempermudah user reconnect setiap 7 hari.

**Tanpa Quick Reconnect:**
- User harus input Client ID, Client Secret, Refresh Token manual
- Total waktu: **5-10 menit**
- User frustasi 😫

**Dengan Quick Reconnect:**
- User klik **1 tombol** → OAuth flow otomatis
- Total waktu: **10-15 detik**
- User senang! 😊

---

## 🔧 Implementation Steps

### Step 1: Add Alert Banner di views/youtube.ejs

Tambahkan **SETELAH** section "Connected Accounts":

```html
<% 
// Check for expired tokens
const expiredAccounts = accounts.filter(a => {
  // Check token_status from database
  return a.tokenStatus === 'expired' || a.tokenStatus === 'error';
});

if (expiredAccounts.length > 0) { 
%>
<!-- Expired Token Alert Banner -->
<div class="bg-red-500/10 border-2 border-red-500/50 rounded-xl p-5 mb-6 animate-pulse">
  <div class="flex items-start gap-4">
    <div class="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
      <i class="ti ti-alert-triangle text-red-400 text-2xl"></i>
    </div>
    <div class="flex-1">
      <h3 class="text-red-400 font-bold text-lg mb-2">
        ⚠️ <%= expiredAccounts.length %> Akun Perlu Reconnect
      </h3>
      <p class="text-gray-300 text-sm mb-1">
        Token expired karena OAuth app masih <strong>"Testing"</strong> status. 
        Token pada mode Testing expired otomatis setiap 7 hari.
      </p>
      <p class="text-gray-400 text-xs mb-4">
        💡 <strong>Solusi Permanent:</strong> Publish OAuth app ke Production 
        <a href="/docs/SOLUSI-PERMANENT-TOKEN.md" class="text-blue-400 hover:underline" target="_blank">
          (lihat panduan)
        </a>
      </p>
      <div class="flex gap-3">
        <button onclick="reconnectAllExpired()" 
          class="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg">
          <i class="ti ti-refresh"></i>
          <span>Reconnect Semua (10 detik)</span>
        </button>
        <button onclick="dismissExpiredAlert()" 
          class="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2.5 rounded-lg transition-colors">
          Nanti Saja
        </button>
      </div>
    </div>
    <button onclick="dismissExpiredAlert()" 
      class="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
      <i class="ti ti-x text-xl"></i>
    </button>
  </div>
</div>
<% } %>
```

### Step 2: Update YouTubeCredentials Model

Pastikan model return `tokenStatus` saat `findAllByUserId()`:

```javascript
// File: models/YouTubeCredentials.js

static async findAllByUserId(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, user_id, client_id, client_secret, refresh_token, 
              channel_name, channel_id, is_primary, created_at,
              access_token, token_expires_at, last_refreshed_at, 
              token_status, last_refresh_error
       FROM youtube_credentials 
       WHERE user_id = ?
       ORDER BY is_primary DESC, created_at ASC`,
      [userId],
      (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve((rows || []).map(row => ({
          id: row.id,
          userId: row.user_id,
          clientId: row.client_id,
          clientSecret: row.client_secret,
          refreshToken: row.refresh_token,
          channelName: row.channel_name,
          channelId: row.channel_id,
          isPrimary: row.is_primary === 1,
          createdAt: row.created_at,
          // Token status fields
          tokenStatus: row.token_status || 'unknown',
          lastRefreshedAt: row.last_refreshed_at,
          lastRefreshError: row.last_refresh_error
        })));
      }
    );
  });
}
```

### Step 3: Add JavaScript Functions (public/js/youtube.js)

Tambahkan di akhir file:

```javascript
/**
 * Reconnect all expired accounts in sequence
 */
async function reconnectAllExpired() {
  try {
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Reconnecting...';
    
    // Get list of expired accounts
    const response = await fetch('/api/youtube/expired-accounts', {
      headers: { 'X-CSRF-Token': getCsrfToken() }
    });
    
    if (!response.ok) throw new Error('Failed to get expired accounts');
    
    const { expiredAccounts } = await response.json();
    
    if (expiredAccounts.length === 0) {
      showToast('Semua akun sudah active!', 'success');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }
    
    showToast(`Reconnecting ${expiredAccounts.length} akun...`, 'info');
    
    let successCount = 0;
    let failCount = 0;
    
    // Reconnect each account
    for (let i = 0; i < expiredAccounts.length; i++) {
      const account = expiredAccounts[i];
      
      try {
        btn.innerHTML = `<i class="ti ti-loader animate-spin"></i> Reconnecting ${i + 1}/${expiredAccounts.length}...`;
        
        // Trigger OAuth flow for this account
        await reconnectAccountOAuth(account.id, account.channelName);
        
        successCount++;
        
        // Wait 2 seconds between reconnects
        if (i < expiredAccounts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (err) {
        console.error(`Failed to reconnect ${account.channelName}:`, err);
        failCount++;
      }
    }
    
    if (successCount > 0) {
      showToast(`✅ ${successCount} akun berhasil reconnect!`, 'success');
      setTimeout(() => location.reload(), 1500);
    } else {
      showToast(`❌ Gagal reconnect akun`, 'error');
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
    
  } catch (error) {
    console.error('Error reconnecting expired accounts:', error);
    showToast('Error: ' + error.message, 'error');
    const btn = event.target;
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

/**
 * Dismiss expired token alert
 */
function dismissExpiredAlert() {
  const alert = event.target.closest('.bg-red-500\\/10');
  if (alert) {
    alert.style.transition = 'opacity 0.3s';
    alert.style.opacity = '0';
    setTimeout(() => alert.remove(), 300);
    
    // Save dismissal to localStorage (will show again on next page load)
    localStorage.setItem('expiredAlertDismissed', Date.now());
  }
}

/**
 * Auto-detect expired tokens on page load and show alert
 */
document.addEventListener('DOMContentLoaded', () => {
  // Check if alert was recently dismissed (within last 1 hour)
  const dismissedTime = localStorage.getItem('expiredAlertDismissed');
  if (dismissedTime && (Date.now() - parseInt(dismissedTime)) < 3600000) {
    return; // Don't auto-show if dismissed within last hour
  }
  
  // Check token status after 2 seconds
  setTimeout(async () => {
    try {
      const response = await fetch('/api/youtube/token-status', {
        headers: { 'X-CSRF-Token': getCsrfToken() }
      });
      
      if (!response.ok) return;
      
      const status = await response.json();
      const expired = status.accounts.filter(a => 
        a.tokenStatus === 'expired' || a.tokenStatus === 'error'
      );
      
      if (expired.length > 0) {
        console.warn(`⚠️ ${expired.length} akun expired, alert banner sudah tampil`);
        // Banner will be shown from EJS template
      }
    } catch (err) {
      console.error('Error checking token status:', err);
    }
  }, 2000);
});
```

### Step 4: Add API Endpoint (app.js)

Tambahkan endpoint baru:

```javascript
// Get list of expired accounts
app.get('/api/youtube/expired-accounts', isAuthenticated, async (req, res) => {
  try {
    const accounts = await YouTubeCredentials.findAllByUserId(req.session.userId);
    const status = await tokenRefreshScheduler.getStatus();
    
    const expiredAccounts = accounts
      .map(acc => {
        const accountStatus = status.accounts.find(a => a.id === acc.id);
        return {
          id: acc.id,
          channelName: acc.channelName || `Account #${acc.id}`,
          channelId: acc.channelId,
          tokenStatus: accountStatus?.tokenStatus || acc.tokenStatus || 'unknown',
          lastRefreshError: accountStatus?.lastRefreshError || acc.lastRefreshError
        };
      })
      .filter(acc => acc.tokenStatus === 'expired' || acc.tokenStatus === 'error');
    
    res.json({ 
      success: true, 
      expiredAccounts,
      total: expiredAccounts.length
    });
  } catch (error) {
    console.error('Error getting expired accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## 🎨 UI/UX Features

### 1. Alert Banner
- **Animate pulse** untuk menarik perhatian
- **Prominent button** "Reconnect Semua"
- **Dismiss button** untuk hide sementara
- **Link** ke panduan solusi permanent

### 2. Progress Indicator
```
Reconnecting 1/3...
Reconnecting 2/3...
Reconnecting 3/3...
✅ 3 akun berhasil reconnect!
```

### 3. Auto-Reload
Setelah reconnect berhasil, page auto-reload untuk update status.

---

## 🧪 Testing

### Test 1: Simulate Expired Token
```sql
-- Update database untuk simulate expired
sqlite3 db/streamflow.db

UPDATE youtube_credentials 
SET token_status = 'expired',
    last_refresh_error = 'Token revoked (simulated)'
WHERE id = 1;
```

Reload page → Alert banner harus muncul

### Test 2: Reconnect Flow
1. Klik "Reconnect Semua"
2. Harus muncul OAuth popup
3. Login dengan Google
4. Page reload → Alert hilang

### Test 3: Dismiss
1. Klik "Nanti Saja" atau X button
2. Alert hilang
3. Reload page dalam 1 jam → Alert TIDAK muncul
4. Tunggu > 1 jam → Alert muncul lagi

---

## 📊 User Experience Comparison

### Before Quick Reconnect
```
Token Expired
    ↓
User buka YouTube tab
    ↓
Manual input:
  - Client ID: [_____________] 
  - Client Secret: [_____________]
  - Refresh Token: [_____________]
    ↓
Klik "Connect Manual"
    ↓
Total: 5-10 menit 😫
```

### After Quick Reconnect
```
Token Expired
    ↓
User buka YouTube tab
    ↓
Alert banner muncul:
  "⚠️ 2 Akun Perlu Reconnect"
    ↓
Klik "Reconnect Semua"
    ↓
OAuth popup → Login Google
    ↓
Done!
    ↓
Total: 10-15 detik 😊
```

**Time Saved:** 4-9 menit per reconnect × 4 reconnects/bulan = **16-36 menit/bulan**!

---

## 🎯 Additional Features (Optional)

### 1. Email Notification
Kirim email saat token hampir expired:

```javascript
// Add to tokenRefreshScheduler.js
if (daysSinceRefresh >= 6) {
  await sendEmailNotification(account.userId, {
    subject: '⚠️ YouTube Token Hampir Expired',
    message: `Akun ${account.channelName} perlu reconnect dalam 1 hari.`
  });
}
```

### 2. Desktop Notification
Show browser notification:

```javascript
// Add to youtube.js
if ('Notification' in window && Notification.permission === 'granted') {
  new Notification('⚠️ Token YouTube Expired', {
    body: '2 akun perlu reconnect. Klik untuk reconnect sekarang.',
    icon: '/images/logo.png',
    onClick: () => {
      window.focus();
      reconnectAllExpired();
    }
  });
}
```

### 3. Scheduled Reminder
Show modal reminder 1 hari sebelum expired:

```javascript
// Check setiap page load
const daysUntilExpiry = calculateDaysUntilExpiry(account);
if (daysUntilExpiry <= 1 && daysUntilExpiry > 0) {
  showModal({
    title: '⚠️ Token Hampir Expired',
    message: `Akun ${account.channelName} akan expired dalam ${daysUntilExpiry} hari.`,
    buttons: ['Reconnect Sekarang', 'Remind Besok']
  });
}
```

---

## ✅ Implementation Checklist

- [ ] Update views/youtube.ejs - Add alert banner
- [ ] Update models/YouTubeCredentials.js - Return tokenStatus
- [ ] Update public/js/youtube.js - Add reconnectAllExpired()
- [ ] Update app.js - Add /api/youtube/expired-accounts endpoint
- [ ] Test dengan simulate expired token
- [ ] Test reconnect flow
- [ ] Test dismiss functionality
- [ ] (Optional) Add email notification
- [ ] (Optional) Add desktop notification

---

## 🎉 Result

**Sebelum:**
- User frustasi setiap 7 hari
- Banyak support tickets
- Bad user experience

**Sesudah:**
- User klik 1 tombol (10 detik)
- Minimal support tickets
- Great user experience

**Still Better:** Publish OAuth app ke Production → Token TIDAK PERNAH EXPIRED! 🚀

---

**Created:** June 3, 2024  
**By:** Kiro AI Assistant
