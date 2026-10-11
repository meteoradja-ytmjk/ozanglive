# 🧪 CARA TEST PERBAIKAN DURATION SETTINGS

## 📋 Persiapan Test

### 1. Backup Database (WAJIB!)
```bash
# Backup database sebelum test
cp db/streamflow.db db/streamflow.db.backup_$(date +%Y%m%d_%H%M%S)
```

### 2. Restart Aplikasi
```bash
# Jika pakai PM2:
pm2 restart ozanglive

# Jika manual, stop dulu lalu start lagi:
# Ctrl+C untuk stop
node app.js
```

### 3. Pastikan Tidak Ada Stream Live
- Buka dashboard: http://localhost:7575/dashboard
- Stop semua stream yang sedang live
- Tunggu sampai semua status "offline"

---

## 🧪 Test Scenario 1: Single Stream (Quick Test)

**Tujuan:** Verify stream stop TEPAT WAKTU dengan durasi pendek

### Steps:
1. **Buat stream baru:**
   - Video: Pilih video apa saja
   - Duration: **5 menit** (untuk test cepat)
   - Stream key: Gunakan test key atau dummy key
   - Note start time (jam berapa start)

2. **Start stream**
   - Klik tombol Play/Start
   - Note EXACT time saat start (misal: 14:30:00)

3. **Monitor log:**
   ```bash
   # Buka terminal baru
   tail -f logs/app.log | grep "\[Scheduler\]"
   ```
   
   **Yang harus terlihat setiap 10 detik:**
   ```
   [Scheduler] Checking durations for 1 live stream(s)...
   [Scheduler] Stream 1 "Nama Stream" timing:
     - Started: 2026-06-05T14:30:00.000Z
     - Should end: 2026-06-05T14:35:00.000Z
     - Elapsed: 2.50 minutes
     - Remaining: 2.50 minutes
   ```

4. **Run test script** (terminal lain):
   ```bash
   # Windows:
   QUICK-TEST-DURATION-FIX.bat
   
   # Linux/Mac:
   node test-duration-accuracy.js
   ```

5. **Tunggu sampai 5 menit:**
   - Di menit ke-5, stream HARUS stop otomatis
   - Check log: harus ada message "⏰ Stopping stream... - duration reached"
   - Check dashboard: status harus berubah jadi "offline" atau "scheduled"

### ✅ Expected Result:
- Stream stop di **PERSIS menit ke-5** (±10 detik)
- Log menampilkan: "✅ Stream stopped successfully at correct time"
- Dashboard status berubah immediately

### ❌ If Failed:
- Stream masih running setelah 5 menit 30 detik → Bug masih ada
- Screenshot log dan kirim untuk debugging

---

## 🧪 Test Scenario 2: Multiple Streams (Real World Test)

**Tujuan:** Verify multiple streams tidak saling ganggu timing-nya

### Steps:
1. **Buat 3 stream dengan durasi berbeda:**

   **Stream A:**
   - Duration: **10 menit**
   - Note: "Test A - 10 min"
   
   **Stream B:**
   - Duration: **15 menit**
   - Note: "Test B - 15 min"
   
   **Stream C:**
   - Duration: **20 menit**
   - Note: "Test C - 20 min"

2. **Start SEMUA stream dalam waktu 1 menit:**
   - Start stream A → note time (misal 14:00:00)
   - Start stream B → note time (misal 14:00:30)
   - Start stream C → note time (misal 14:01:00)

3. **Monitor dengan test script setiap 5 menit:**
   ```bash
   # Jalankan setiap 5 menit
   node test-duration-accuracy.js
   ```

4. **Expected stop times:**
   - **Menit 10:** Stream A harus stop (hanya A)
   - **Menit 15:** Stream B harus stop (hanya B)
   - **Menit 20:** Stream C harus stop (hanya C)

5. **Verify di log:**
   ```
   Menit 10:
   [Scheduler] ⏰ Stopping stream 1 "Test A - 10 min" - duration reached
   [Scheduler] ✅ Stream 1 stopped successfully at correct time
   
   Menit 15:
   [Scheduler] ⏰ Stopping stream 2 "Test B - 15 min" - duration reached
   [Scheduler] ✅ Stream 2 stopped successfully at correct time
   
   Menit 20:
   [Scheduler] ⏰ Stopping stream 3 "Test C - 20 min" - duration reached
   [Scheduler] ✅ Stream 3 stopped successfully at correct time
   ```

### ✅ Expected Result:
- Stream A stop persis menit 10 (±10 detik)
- Stream B stop persis menit 15 (±10 detik)
- Stream C stop persis menit 20 (±10 detik)
- Tidak ada interference antar streams
- Semua log menampilkan timing accurate

### ❌ If Failed:
- Ada stream yang stop lebih awal → Screenshot timing details
- Ada stream yang tidak stop → Run test script untuk lihat "OVERDUE"
- Streams stop bersamaan → Bug race condition

---

## 🧪 Test Scenario 3: Long Duration (Production Simulation)

**Tujuan:** Test dengan durasi real (3+ jam) seperti kasus user

### Steps:
1. **Buat 2 stream:**

   **Stream Long 1:**
   - Duration: **3 jam** (180 menit)
   - Note: "Production Test 1 - 3h"
   
   **Stream Long 2:**
   - Duration: **3 jam 30 menit** (210 menit)
   - Note: "Production Test 2 - 3.5h"

2. **Start kedua stream:**
   - Note EXACT start time
   - Expected end time = start time + duration

3. **Check di jam-jam kritis:**
   - **Jam 1:** Run test script → verify remaining = 2h & 2.5h
   - **Jam 2:** Run test script → verify remaining = 1h & 1.5h
   - **Jam 3:** Run test script → verify remaining = 0h & 0.5h
   - **Jam 3:** Stream 1 HARUS stop
   - **Jam 3.5:** Stream 2 HARUS stop

4. **Monitor log intensity:**
   ```bash
   # Count scheduler checks per minute
   grep "\[Scheduler\] Checking durations" logs/app.log | tail -20
   
   # Should see 6 checks per minute (every 10 seconds)
   ```

### ✅ Expected Result:
- Stream 1 stop PERSIS jam ke-3 (±10 detik)
- Stream 2 stop PERSIS jam ke-3.5 (±10 detik)
- Log menampilkan accurate countdown setiap 10 detik
- No memory leaks (check dengan `top` atau Task Manager)

### ❌ If Failed:
- Stream stop < 3 jam → BUG KRITIS, kirim full log
- Stream tidak stop sama sekali → Check scheduler running
- Memory leak → Check cleanup interval

---

## 📊 Cara Baca Test Script Output

### ✅ Good Output (Normal):
```
========================================
  DURATION ACCURACY TEST
========================================

Found 2 live stream(s)

Stream 1:
  ID: 123
  Title: "Test Stream A"
  Schedule Type: once
  Configured Duration: 180 minutes

  Timing Details:
    Started:       2026-06-05T14:00:00.000Z
    Expected End:  2026-06-05T17:00:00.000Z
    Current Time:  2026-06-05T15:30:00.000Z

    Elapsed:   90.00 minutes
    Remaining: 90.00 minutes

  ✅ Running normally (90.00 min remaining)

---

========================================
  SUMMARY
========================================

✅ ALL STREAMS TIMING ACCURATE

   2 stream(s) running normally
   No overdue streams detected

========================================
```

### ❌ Bad Output (Bug Detected):
```
========================================
  DURATION ACCURACY TEST
========================================

Found 2 live stream(s)

Stream 1:
  ID: 123
  Title: "Test Stream A"
  Configured Duration: 180 minutes

  Timing Details:
    Started:       2026-06-05T14:00:00.000Z
    Expected End:  2026-06-05T17:00:00.000Z
    Current Time:  2026-06-05T17:05:30.000Z    <-- CURRENT > EXPECTED!

    Elapsed:   185.50 minutes                  <-- MORE THAN 180!
    Remaining: -5.50 minutes                   <-- NEGATIVE!

  ⚠️  OVERDUE by 5.50 minutes!                <-- PROBLEM!
     This stream should have been stopped automatically.

---

========================================
  SUMMARY
========================================

❌ ISSUES FOUND: 1 stream(s) are overdue

   - Stream 123 "Test Stream A": overdue by 5.50 min

These streams should have been stopped by schedulerService.
Check logs/app.log for [Scheduler] messages.

Possible causes:
  1. Scheduler not running (check app.js)
  2. StreamingService not initialized in scheduler
  3. Duration check interval too slow

========================================
```

---

## 🔍 Troubleshooting

### Problem 1: Stream Tidak Stop Otomatis

**Symptoms:**
- Test script menunjukkan "OVERDUE"
- Stream masih running setelah duration exceeded

**Debug Steps:**
1. Check scheduler running:
   ```bash
   grep "Stream scheduler initialized" logs/app.log | tail -1
   ```
   Should see: `[Scheduler] Stream scheduler initialized (WIB-based, 10s duration check for accuracy)`

2. Check duration checks happening:
   ```bash
   grep "Checking durations for" logs/app.log | tail -10
   ```
   Should see entries every 10 seconds

3. Check for errors:
   ```bash
   grep "\[Scheduler\] Error" logs/app.log | tail -20
   ```

**Solution:**
- Restart aplikasi
- Verify schedulerService.js has latest changes
- Check streamingService initialized: `grep "StreamingService not initialized" logs/app.log`

---

### Problem 2: Multiple Streams Interference

**Symptoms:**
- Semua stream stop bersamaan (bukan sesuai durasi masing-masing)
- Stream A (short duration) stop sama dengan Stream B (long duration)

**Debug Steps:**
1. Check timing per stream:
   ```bash
   grep "Stream .* timing:" logs/app.log | tail -50
   ```

2. Verify each stream has different start_time dan expected end time

**Solution:**
- Each stream HARUS punya unique start_time
- Check race condition di Stream.updateStatus
- Verify `preserveStartTime` working correctly

---

### Problem 3: Timing Inaccurate (Off by Minutes)

**Symptoms:**
- Stream stop 2-5 menit lebih awal atau telat
- Not within ±10 seconds tolerance

**Debug Steps:**
1. Check interval:
   ```bash
   grep "DURATION_CHECK_INTERVAL" services/schedulerService.js
   ```
   Should be: `const DURATION_CHECK_INTERVAL = 10 * 1000;`

2. Check clock sync:
   ```bash
   # Windows:
   w32tm /query /status
   
   # Linux:
   timedatectl status
   ```

**Solution:**
- Sync system clock
- Verify interval = 10 seconds
- Restart scheduler

---

## 📞 Reporting Issues

Jika menemukan bug setelah test, kirim informasi berikut:

### 1. Test Scenario
- Scenario mana yang gagal (1, 2, atau 3)
- Berapa stream yang running

### 2. Log Output
```bash
# Extract relevant logs
grep "Scheduler.*Stream.*<ID>" logs/app.log > debug_stream_<ID>.log
```

### 3. Test Script Output
- Copy-paste full output dari `node test-duration-accuracy.js`
- Screenshot jika perlu

### 4. Timing Details
- Configured duration: X menit
- Actual start time: YYYY-MM-DD HH:MM:SS
- Expected end time: YYYY-MM-DD HH:MM:SS
- Actual stop time: YYYY-MM-DD HH:MM:SS (or "tidak stop")
- Difference: +/- X menit

### 5. Environment
- OS: Windows/Linux/Mac
- Node version: `node --version`
- PM2: yes/no
- Multiple users: yes/no

---

## ✅ Success Criteria

Fix dianggap **SUKSES** jika:

1. ✅ **Akurasi timing:**
   - Single stream stop dalam ±10 detik dari configured duration
   - Multiple streams stop sesuai durasi masing-masing (tidak interference)

2. ✅ **Logging informatif:**
   - Setiap stream menampilkan timing details
   - Easy to debug jika ada issue

3. ✅ **Stability:**
   - No crashes selama long duration test (3+ jam)
   - No memory leaks
   - Scheduler running continuously

4. ✅ **User experience:**
   - Dashboard update immediately saat stream stop
   - Status accurate (live → offline/scheduled)
   - History recorded correctly

---

**Good luck testing! 🚀**

Jika semua test passed, berarti bug sudah fixed dan user bisa start banyak stream sekaligus tanpa khawatir stop lebih awal.
