# 🚀 QUICK DEPLOY GUIDE - BUG FIXES v2.2.2

## ⚡ 5-MINUTE DEPLOYMENT

Panduan cepat untuk deploy perbaikan bug ke production.

---

## 📋 PRE-DEPLOYMENT CHECKLIST

- [ ] Backup database sudah dibuat
- [ ] Backup .env sudah dibuat
- [ ] PM2 sudah installed
- [ ] FFmpeg sudah installed
- [ ] Node.js 14+ sudah installed

---

## 🔧 STEP-BY-STEP DEPLOYMENT

### **STEP 1: Backup Everything (1 menit)**

```bash
# Masuk ke folder aplikasi
cd /path/to/ozanglive

# Backup database
cp db/streamflow.db db/streamflow.db.backup-$(date +%Y%m%d)

# Backup .env
cp .env .env.backup-$(date +%Y%m%d)

# Backup session database
cp db/sessions.db db/sessions.db.backup-$(date +%Y%m%d)
```

---

### **STEP 2: Update Code (1 menit)**

```bash
# Pull latest changes
git stash  # Save local changes
git pull origin main
git stash pop  # Restore local changes

# Install dependencies
npm install
```

---

### **STEP 3: Generate Encryption Key (1 menit)**

```bash
# Generate key
node generate-encryption-key.js
```

**Output akan seperti ini:**
```
ENCRYPTION_KEY=5e4c2d67ecfef4af1c7023eb9f033acb36fb6cf6e5d2400f3d050381cef850c0
SESSION_SECRET=06d2998dbcea458d9f43c56cdf7ef81d4dfe033036c075d8cf53ecc8cc2d1900
```

**COPY kedua keys tersebut!**

---

### **STEP 4: Update .env File (1 menit)**

```bash
# Edit .env
nano .env
```

**Tambahkan atau update:**
```env
# Di bagian bawah file, tambahkan:
ENCRYPTION_KEY=5e4c2d67ecfef4af1c7023eb9f033acb36fb6cf6e5d2400f3d050381cef850c0

# Jika SESSION_SECRET belum ada, tambahkan juga:
SESSION_SECRET=06d2998dbcea458d9f43c56cdf7ef81d4dfe033036c075d8cf53ecc8cc2d1900
```

**Save:** CTRL+O, Enter, CTRL+X

---

### **STEP 5: Restart Application (1 menit)**

```bash
# Restart dengan PM2
pm2 restart ozanglive

# Tunggu 5 detik
sleep 5

# Check status
pm2 status

# Check logs
pm2 logs ozanglive --lines 50
```

**Expected output:** Aplikasi running, tidak ada error di logs

---

## ✅ POST-DEPLOYMENT VERIFICATION

### **IMMEDIATE CHECKS (0-5 minutes):**

```bash
# 1. Check aplikasi running
pm2 status
# Expected: ozanglive status "online"

# 2. Check logs untuk errors
pm2 logs ozanglive --lines 50 --nostream
# Expected: No critical errors, normal startup logs

# 3. Check memory usage
pm2 info ozanglive | grep memory
# Expected: Memory usage < 200MB

# 4. Check zombie processes
ps aux | grep ffmpeg
# Expected: Only active streams, no zombies
```

---

### **SHORT-TERM CHECKS (5-60 minutes):**

```bash
# 1. Test stream start
curl -X POST http://localhost:7575/api/streams/<STREAM_ID>/start
# Expected: Stream starts successfully

# 2. Test YouTube credentials (jika ada)
# Login ke YouTube tab, check credentials encrypted
sqlite3 db/streamflow.db "SELECT id, substr(client_secret, 1, 20) FROM youtube_credentials LIMIT 1;"
# Expected: Hex-encoded format (encrypted)

# 3. Monitor memory growth
watch -n 60 'pm2 info ozanglive | grep memory'
# Expected: Memory stable, no significant growth
```

---

### **LONG-TERM MONITORING (24-48 hours):**

```bash
# 1. Memory leak check
# Check memory setiap 6 jam
pm2 info ozanglive | grep memory

# 2. Zombie process check
# Check setiap 12 jam
ps aux | grep ffmpeg | wc -l

# 3. Log review
# Check errors setiap hari
grep ERROR logs/app.log | tail -20

# 4. Database check
# Check database size
du -sh db/streamflow.db
```

---

## 🚨 ROLLBACK PROCEDURE (Jika Ada Masalah)

### **QUICK ROLLBACK (2 minutes):**

```bash
# 1. Stop aplikasi
pm2 stop ozanglive

# 2. Restore database
cp db/streamflow.db.backup-<DATE> db/streamflow.db

# 3. Restore .env
cp .env.backup-<DATE> .env

# 4. Revert code (opsional)
git reset --hard HEAD~1

# 5. Restart
pm2 restart ozanglive

# 6. Verify
pm2 status
pm2 logs ozanglive --lines 50
```

---

## 📊 SUCCESS CRITERIA

### ✅ Deployment Successful Jika:

1. **Aplikasi Running**
   - PM2 status: "online"
   - No crash dalam 5 menit pertama
   - Logs menunjukkan normal startup

2. **Memory Stable**
   - Memory usage < 200MB setelah restart
   - No sudden spikes dalam 1 jam
   - Growth rate < 10MB per hari

3. **No Zombies**
   - `ps aux | grep ffmpeg` hanya show active streams
   - No orphaned FFmpeg processes
   - Clean shutdown test passed

4. **Encryption Working**
   - New YouTube credentials encrypted
   - Database query shows hex format
   - Decrypt works correctly

5. **Functionality OK**
   - Stream start/stop works
   - Upload works
   - YouTube integration works
   - Dashboard loads correctly

---

## 🔍 TROUBLESHOOTING COMMON ISSUES

### Issue 1: "ENCRYPTION_KEY not set"
```bash
# Solution
node generate-encryption-key.js
# Add output to .env
pm2 restart ozanglive
```

### Issue 2: Application crashes on start
```bash
# Check logs
pm2 logs ozanglive --lines 100

# Common causes:
# - Missing dependencies: npm install
# - Port already in use: lsof -i :7575
# - Database locked: rm db/*.db-shm db/*.db-wal
```

### Issue 3: Memory still growing
```bash
# Diagnosis
pm2 monit

# If growth > 50MB/hour:
# 1. Check for memory leaks in custom code
# 2. Review active streams count
# 3. Check tmp/ folder size: du -sh tmp/
```

### Issue 4: Credentials not encrypted
```bash
# Check database
sqlite3 db/streamflow.db "SELECT client_secret FROM youtube_credentials LIMIT 1;"

# If plain text:
# 1. Verify ENCRYPTION_KEY in .env
# 2. Check encryption.js loaded
# 3. Re-add credentials via UI
```

---

## 📞 EMERGENCY CONTACTS

### Critical Issues:
- Application won't start
- Data corruption detected
- Security breach suspected

### Action:
1. STOP application immediately: `pm2 stop ozanglive`
2. Rollback to backup (see rollback procedure)
3. Review logs: `pm2 logs ozanglive --lines 500 > emergency.log`
4. Document the issue
5. Contact support

---

## 📝 POST-DEPLOYMENT TASKS

### Immediate (Day 1):
- [ ] Monitor memory every 2 hours
- [ ] Check logs every 4 hours
- [ ] Test all major features
- [ ] Verify encryption working

### Short-term (Week 1):
- [ ] Daily memory checks
- [ ] Review error logs
- [ ] Test concurrent streams
- [ ] Verify data integrity

### Long-term (Month 1):
- [ ] Weekly performance review
- [ ] Monthly security audit
- [ ] Backup verification
- [ ] Plan next improvements

---

## 🎯 NEXT STEPS

Setelah deployment sukses dan stable selama 48 jam:

1. **Mark as Production Ready** ✅
2. **Document lessons learned**
3. **Plan remaining 5 bug fixes**
4. **Schedule next deployment**
5. **Review and optimize**

---

## 📚 RELATED DOCUMENTATION

- `PERBAIKAN-SELESAI.md` - Laporan lengkap (Bahasa Indonesia)
- `COMPLETE-FIX-SUMMARY.md` - Technical summary (English)
- `IMPLEMENTATION-SUMMARY.md` - Implementation details
- `BUG-FIXES-COMPLETE.md` - Bug descriptions

---

**🚀 Ready to Deploy?**

Ikuti steps di atas dengan teliti. Total waktu: **5 menit**.

**Good luck!** 🎉
