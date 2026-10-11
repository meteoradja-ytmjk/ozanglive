# Panduan Testing - Perbaikan Status Member

## Ringkasan Perbaikan

Telah diperbaiki masalah status member yang tidak muncul di halaman profile dengan menambahkan kolom `status` ke dalam query `User.findById()`.

## File yang Dimodifikasi

1. ✅ `models/User.js` - Method `findById()` dan `findByIdWithPassword()`
2. ✅ `ozanglive/models/User.js` - Method `findById()`

## Test Cases

### Test 1: Verifikasi Status di User Management (Admin)

**Prerequisites:**
- Login sebagai admin

**Steps:**
1. Login ke aplikasi sebagai admin
2. Navigasi ke menu "Users" atau "User Management"
3. Lihat tabel/list user

**Expected Result:**
- ✅ Semua user menampilkan status (active/inactive)
- ✅ Status badge muncul dengan warna yang sesuai:
  - Active = hijau (emerald)
  - Inactive = merah (red)
- ✅ Tidak ada error di console browser

**Screenshot Location:**
- Ambil screenshot dari halaman user management

---

### Test 2: Verifikasi Status di Profile Settings (Admin)

**Prerequisites:**
- Login sebagai admin

**Steps:**
1. Login ke aplikasi sebagai admin
2. Navigasi ke menu "Settings"
3. Buka tab "Profile"
4. Lihat informasi profile

**Expected Result:**
- ✅ Profile admin menampilkan semua informasi termasuk status
- ✅ Status tersedia dan dapat dibaca
- ✅ Tidak ada error di console browser tentang `user.status is undefined`

---

### Test 3: Verifikasi Status di Profile Settings (Member)

**Prerequisites:**
- Login sebagai member (bukan admin)

**Steps:**
1. Login ke aplikasi sebagai member
2. Navigasi ke menu "Settings"
3. Buka tab "Profile"
4. Lihat informasi profile
5. Buka Developer Tools (F12) dan cek Console tab

**Expected Result:**
- ✅ Profile member menampilkan semua informasi termasuk status
- ✅ Status muncul dengan benar (active/inactive)
- ✅ Tidak ada error di console tentang `undefined`
- ✅ UI rendering berjalan lancar tanpa crash

**SEBELUM FIX:**
- ❌ Status tidak muncul
- ❌ Error di console: `Cannot read property 'status' of undefined`
- ❌ Beberapa bagian UI mungkin tidak render dengan benar

**SETELAH FIX:**
- ✅ Status muncul dengan benar
- ✅ Tidak ada error
- ✅ UI render sempurna

---

### Test 4: Edit User Status (Admin)

**Prerequisites:**
- Login sebagai admin
- Ada minimal 1 member user

**Steps:**
1. Login sebagai admin
2. Buka User Management
3. Klik tombol "Edit" pada salah satu member user
4. Modal edit akan terbuka
5. Perhatikan field "Status" di modal
6. Ubah status dari active ke inactive (atau sebaliknya)
7. Klik "Save Changes"
8. Refresh halaman

**Expected Result:**
- ✅ Field status terisi dengan benar di modal edit
- ✅ Status dapat diubah
- ✅ Perubahan tersimpan ke database
- ✅ Status baru muncul setelah refresh
- ✅ Member dengan status inactive tidak bisa login

---

### Test 5: Login dengan Status Inactive

**Prerequisites:**
- Ada user dengan status inactive (dibuat di Test 4)

**Steps:**
1. Logout dari aplikasi
2. Coba login menggunakan user yang status-nya inactive
3. Masukkan username dan password yang benar

**Expected Result:**
- ✅ Login ditolak dengan pesan error
- ✅ Pesan error menunjukkan bahwa akun tidak aktif
- ✅ User tidak dapat masuk ke dashboard

**Pesan Error yang Diharapkan:**
```
"Your account is inactive. Please contact administrator."
```

---

### Test 6: Database Query Verification

**Prerequisites:**
- Akses ke database SQLite

**Steps:**
1. Buka database dengan SQLite browser atau CLI
2. Jalankan query:
```sql
SELECT id, username, user_role, status, created_at 
FROM users 
LIMIT 10;
```

**Expected Result:**
- ✅ Semua user memiliki kolom status
- ✅ Nilai status adalah 'active' atau 'inactive'
- ✅ Tidak ada NULL value di kolom status

---

### Test 7: API Response Verification

**Prerequisites:**
- Login sebagai admin
- Browser Developer Tools terbuka (F12)

**Steps:**
1. Login sebagai admin
2. Buka Network tab di Developer Tools
3. Navigasi ke User Management atau Settings
4. Cari request API yang mengembalikan user data
5. Inspect response JSON

**Expected Result:**
- ✅ Response JSON mengandung field `status`
- ✅ Nilai status valid ('active' atau 'inactive')
- ✅ Tidak ada field yang hilang

**Contoh Response yang Benar:**
```json
{
  "id": "uuid-here",
  "username": "testuser",
  "user_role": "member",
  "status": "active",
  "avatar_path": "/uploads/avatars/...",
  "live_limit": null,
  "storage_limit": 10737418240,
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

---

## Checklist Testing

Gunakan checklist ini saat melakukan testing:

### Pre-Testing
- [ ] Backup database sebelum testing
- [ ] Catat versi aplikasi saat ini
- [ ] Siapkan user test (admin dan member)

### Functional Testing
- [ ] Test 1: Status di User Management (Admin) ✅
- [ ] Test 2: Status di Profile Settings (Admin) ✅
- [ ] Test 3: Status di Profile Settings (Member) ✅
- [ ] Test 4: Edit User Status (Admin) ✅
- [ ] Test 5: Login dengan Status Inactive ✅

### Technical Testing
- [ ] Test 6: Database Query Verification ✅
- [ ] Test 7: API Response Verification ✅

### Cross-Browser Testing
- [ ] Chrome/Edge ✅
- [ ] Firefox ✅
- [ ] Safari (jika tersedia) ⚠️

### Mobile Responsive Testing
- [ ] Mobile view di User Management ✅
- [ ] Mobile view di Profile Settings ✅
- [ ] Status badge readable di mobile ✅

---

## Troubleshooting

### Issue: Status masih tidak muncul

**Kemungkinan Penyebab:**
1. Aplikasi belum di-restart setelah update
2. Cache browser masih menyimpan versi lama
3. File User.js tidak ter-update dengan benar

**Solusi:**
1. Restart aplikasi:
   ```bash
   # Windows
   RESTART-APLIKASI.bat
   
   # Linux
   pm2 restart ecosystem.config.js
   ```

2. Clear browser cache:
   - Tekan Ctrl + Shift + Delete
   - Pilih "Cached images and files"
   - Klik "Clear data"

3. Verifikasi file User.js:
   ```bash
   # Cek apakah 'status' ada di query
   grep "SELECT.*status.*FROM users" models/User.js
   ```

---

### Issue: Error "user.status is undefined"

**Kemungkinan Penyebab:**
1. User lama di database tidak memiliki kolom status
2. Migration database belum dijalankan

**Solusi:**
1. Tambahkan kolom status ke semua user existing:
   ```sql
   UPDATE users 
   SET status = 'active' 
   WHERE status IS NULL OR status = '';
   ```

2. Pastikan kolom status ada di tabel:
   ```sql
   PRAGMA table_info(users);
   ```
   
   Jika kolom status tidak ada, tambahkan:
   ```sql
   ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';
   ```

---

### Issue: Status tidak update setelah edit

**Kemungkinan Penyebab:**
1. API endpoint /api/users/status tidak berfungsi
2. CSRF token issue
3. Permission issue

**Solusi:**
1. Cek console untuk error
2. Verifikasi CSRF token ada di form
3. Pastikan user yang login adalah admin

---

## Performance Impact

### Before Fix:
- Query: `SELECT id, username, avatar_path, user_role, live_limit, ... FROM users`
- Kolom: 9 kolom

### After Fix:
- Query: `SELECT id, username, avatar_path, user_role, status, live_limit, ... FROM users`
- Kolom: 10 kolom

**Impact:**
- ✅ Negligible performance impact (hanya 1 kolom tambahan)
- ✅ Query tetap selective dan optimal
- ✅ Tidak ada additional JOIN atau subquery
- ✅ Index tidak berubah

---

## Rollback Plan

Jika terjadi masalah serius, rollback dengan cara:

1. **Restore file User.js lama:**
   ```bash
   git checkout HEAD~1 models/User.js
   git checkout HEAD~1 ozanglive/models/User.js
   ```

2. **Restart aplikasi:**
   ```bash
   RESTART-APLIKASI.bat
   ```

3. **Verifikasi aplikasi berjalan normal**

---

## Success Criteria

Perbaikan dianggap berhasil jika:

- ✅ Semua 7 test case passed
- ✅ Tidak ada error di console browser
- ✅ Tidak ada error di log aplikasi
- ✅ Status muncul untuk admin dan member
- ✅ Edit status berfungsi dengan baik
- ✅ Login validation berdasarkan status berfungsi
- ✅ Performance tidak menurun

---

## Catatan Penting

1. **Tidak ada breaking changes** - Semua fitur existing tetap berjalan
2. **Backward compatible** - Aplikasi tetap bisa membaca data lama
3. **No migration needed** - Kolom status sudah ada di database
4. **No downtime required** - Update bisa dilakukan tanpa maintenance window

---

**Tested By:** _________________  
**Date:** _________________  
**Sign:** _________________  
