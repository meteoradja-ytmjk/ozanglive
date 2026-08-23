# 📋 Deployment Checklist - Status Member Fix

## Pre-Deployment

### 1. Backup
- [ ] Backup database (`streamflow.db`)
  ```bash
  cp db/streamflow.db db/streamflow.db.backup-$(date +%Y%m%d-%H%M%S)
  ```
- [ ] Backup current code
  ```bash
  git add .
  git commit -m "Backup before status fix deployment"
  ```

### 2. Verification
- [ ] Verifikasi perubahan di `models/User.js` sudah benar
- [ ] Verifikasi perubahan di `ozanglive/models/User.js` sudah benar
- [ ] Tidak ada syntax error
  ```bash
  node -c models/User.js
  node -c ozanglive/models/User.js
  ```

### 3. Testing (Development)
- [ ] Test login sebagai admin
- [ ] Test login sebagai member
- [ ] Test lihat profile settings
- [ ] Test edit user status
- [ ] Tidak ada error di console

---

## Deployment Steps

### Step 1: Stop Application
```bash
# Windows
taskkill /F /IM node.exe

# Linux/Mac dengan PM2
pm2 stop all
```

- [ ] Aplikasi berhasil di-stop
- [ ] Tidak ada proses node yang masih berjalan
- [ ] User tidak bisa akses aplikasi (expected)

### Step 2: Apply Changes
- [ ] Copy file `models/User.js` yang sudah diperbaiki
- [ ] Copy file `ozanglive/models/User.js` yang sudah diperbaiki
- [ ] Verifikasi file sudah ter-copy dengan benar
  ```bash
  # Cek apakah 'status' ada di query
  grep "status" models/User.js | grep SELECT
  grep "status" ozanglive/models/User.js | grep SELECT
  ```

### Step 3: Database Check (Optional)
- [ ] Verifikasi kolom status ada di tabel users
  ```sql
  PRAGMA table_info(users);
  ```
- [ ] Verifikasi semua user memiliki status
  ```sql
  SELECT COUNT(*) as total, 
         SUM(CASE WHEN status IS NULL THEN 1 ELSE 0 END) as null_status
  FROM users;
  ```
- [ ] Jika ada NULL, update ke 'active'
  ```sql
  UPDATE users SET status = 'active' WHERE status IS NULL;
  ```

### Step 4: Start Application
```bash
# Windows
BUKA-APLIKASI-SEKARANG.bat

# Linux/Mac dengan PM2
pm2 start ecosystem.config.js
```

- [ ] Aplikasi berhasil start
- [ ] Tidak ada error di log startup
- [ ] Port sudah listening
- [ ] Bisa akses homepage

### Step 5: Smoke Test
- [ ] Homepage bisa diakses
- [ ] Login page bisa diakses
- [ ] Login sebagai admin berhasil
- [ ] Dashboard admin muncul dengan benar
- [ ] Menu Users bisa diakses
- [ ] Settings bisa diakses

---

## Post-Deployment Testing

### Test 1: Admin Profile
- [ ] Login sebagai admin
- [ ] Buka Settings > Profile
- [ ] **Verifikasi status muncul** ✅
- [ ] Tidak ada error di console
- [ ] Tidak ada warning di log

### Test 2: Member Profile
- [ ] Login sebagai member
- [ ] Buka Settings > Profile
- [ ] **Verifikasi status muncul** ✅
- [ ] Tidak ada error di console
- [ ] UI render dengan sempurna

### Test 3: User Management
- [ ] Login sebagai admin
- [ ] Buka User Management
- [ ] **Verifikasi semua user menampilkan status** ✅
- [ ] Status badge muncul dengan warna yang benar
  - Active = hijau
  - Inactive = merah

### Test 4: Edit User Status
- [ ] Klik edit pada salah satu user
- [ ] Field status terisi dengan benar
- [ ] Ubah status (active ↔ inactive)
- [ ] Save changes berhasil
- [ ] Status terupdate di list

### Test 5: Login Validation
- [ ] Set salah satu user ke inactive
- [ ] Logout
- [ ] Coba login dengan user inactive
- [ ] **Login ditolak dengan pesan error yang sesuai** ✅

---

## Monitoring (First 30 Minutes)

### Application Logs
- [ ] Monitor log file untuk error
  ```bash
  # Linux/Mac
  tail -f logs/app.log
  
  # PM2
  pm2 logs
  ```
- [ ] Tidak ada error terkait `user.status`
- [ ] Tidak ada error database
- [ ] Tidak ada crash/restart

### Database
- [ ] Monitor query performance
- [ ] Tidak ada slow query
- [ ] SELECT query dengan status berjalan normal

### User Reports
- [ ] Monitor feedback dari user
- [ ] Tidak ada laporan error
- [ ] Tidak ada laporan fitur tidak berfungsi

---

## Rollback Plan (If Needed)

### When to Rollback?
Lakukan rollback jika:
- ❌ Aplikasi crash setelah start
- ❌ Error `user.status` muncul berulang
- ❌ User tidak bisa login
- ❌ Data corruption

### Rollback Steps

#### 1. Stop Application
```bash
pm2 stop all
```

#### 2. Restore Code
```bash
# Restore dari git
git checkout HEAD~1 models/User.js
git checkout HEAD~1 ozanglive/models/User.js

# Atau restore dari backup manual
cp models/User.js.backup models/User.js
cp ozanglive/models/User.js.backup ozanglive/models/User.js
```

#### 3. Restore Database (if needed)
```bash
cp db/streamflow.db.backup-YYYYMMDD-HHMMSS db/streamflow.db
```

#### 4. Start Application
```bash
pm2 start ecosystem.config.js
```

#### 5. Verify Rollback Success
- [ ] Aplikasi running normal
- [ ] User bisa login
- [ ] Tidak ada error di log
- [ ] Fungsi dasar berjalan normal

---

## Success Criteria

Deployment dianggap berhasil jika:

1. ✅ Aplikasi running tanpa error
2. ✅ Status muncul di profile settings untuk admin dan member
3. ✅ Status muncul di user management
4. ✅ Edit status berfungsi dengan baik
5. ✅ Login validation berdasarkan status berfungsi
6. ✅ Tidak ada error di log selama 30 menit pertama
7. ✅ Tidak ada keluhan dari user

---

## Communication Plan

### Before Deployment
**To:** All users / Tim IT  
**Subject:** Maintenance Notice - Status Display Fix

```
Hi Team,

Kami akan melakukan update kecil untuk memperbaiki tampilan status user.

⏰ Jadwal: [Tanggal & Waktu]
⏱️ Durasi: ~5 menit
📝 Dampak: Aplikasi tidak bisa diakses sementara

Perubahan:
- Status member sekarang akan muncul di halaman profile
- Perbaikan konsistensi tampilan status

Terima kasih atas pengertiannya.
```

### After Deployment (Success)
**To:** All users / Tim IT  
**Subject:** Maintenance Complete - Status Display Fixed

```
Hi Team,

Update telah selesai dan aplikasi sudah bisa diakses kembali.

✅ Status berhasil diperbaiki
✅ Semua fitur berjalan normal

Jika ada masalah, silakan hubungi tim IT.

Terima kasih.
```

### After Deployment (Failed - Rollback)
**To:** Tim IT  
**Subject:** URGENT - Deployment Rolled Back

```
Hi Team,

Deployment gagal dan telah di-rollback ke versi sebelumnya.

❌ Alasan: [jelaskan masalah]
✅ Aplikasi sudah kembali normal

Next step:
- Investigasi masalah
- Fix di development
- Schedule ulang deployment

Action required: [jika ada]
```

---

## Sign-off

### Deployed By
**Name:** ___________________  
**Date:** ___________________  
**Time:** ___________________  

### Verified By
**Name:** ___________________  
**Date:** ___________________  
**Time:** ___________________  

### Approved By
**Name:** ___________________  
**Date:** ___________________  
**Signature:** ___________________  

---

## Notes

Space untuk catatan tambahan selama deployment:

```
[Kosongkan untuk catatan manual]








```

---

**Document Version:** 1.0  
**Last Updated:** $(date)  
**Status:** Ready for Deployment
