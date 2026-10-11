# 🖥️ Panduan Restart Aplikasi di VPS

## 🎯 Untuk VPS / Server Linux

Karena Anda menggunakan VPS, berikut cara restart aplikasi untuk mendapatkan perubahan terbaru.

---

## ⚡ CARA TERCEPAT (Recommended)

### Option 1: Gunakan Script Otomatis

#### Step 1: Upload Script ke VPS
```bash
# Script sudah ada di local: restart-vps.sh
# Upload ke VPS menggunakan salah satu cara:

# Cara 1: Git pull (Recommended)
ssh user@your-vps-ip
cd /path/to/streamflow-ozanglive
git pull origin feature/professional-stream-key-selector

# Cara 2: SCP (jika tidak pakai git di VPS)
scp restart-vps.sh user@your-vps-ip:/path/to/streamflow-ozanglive/
```

#### Step 2: Buat Script Executable
```bash
ssh user@your-vps-ip
cd /path/to/streamflow-ozanglive
chmod +x restart-vps.sh
chmod +x quick-restart-vps.sh
```

#### Step 3: Jalankan Script
```bash
./restart-vps.sh
```

**Script ini akan otomatis:**
- ✅ Stop aplikasi (PM2 atau Node process)
- ✅ Pull perubahan terbaru dari GitHub
- ✅ Clear npm cache
- ✅ Install dependencies baru
- ✅ Start aplikasi (dengan PM2 atau nohup)

---

## 🚀 CARA MANUAL (Step by Step)

Jika script tidak berfungsi, ikuti langkah manual ini:

### Step 1: SSH ke VPS
```bash
ssh user@your-vps-ip
# Ganti user dan your-vps-ip dengan credentials Anda
```

### Step 2: Masuk ke Folder Aplikasi
```bash
cd /path/to/streamflow-ozanglive
# Atau biasanya:
cd /var/www/streamflow-ozanglive
# Atau:
cd ~/streamflow-ozanglive
```

### Step 3: Stop Aplikasi

**Jika pakai PM2:**
```bash
pm2 stop app
# Atau stop semua:
pm2 stop all
```

**Jika pakai systemd:**
```bash
sudo systemctl stop streamflow
```

**Jika pakai nohup atau langsung node:**
```bash
# Cari process ID
ps aux | grep node

# Kill process (ganti PID dengan nomor yang muncul)
kill -9 <PID>

# Atau kill semua node
pkill -f node
```

### Step 4: Pull Latest Changes dari GitHub
```bash
git pull origin feature/professional-stream-key-selector
```

**Expected Output:**
```
Updating ddfdeb1..9aea6a7
Fast-forward
 public/js/stream-modal.js                | 20 ++++++++++++++++++++
 views/dashboard.ejs                      |  1 +
 CRITICAL-FIX-STREAM-KEY-AUTO-LOAD.md     | 403 ++++++++++++++++++++
 3 files changed, 424 insertions(+)
```

**Jika ada error "local changes":**
```bash
git stash
git pull origin feature/professional-stream-key-selector
git stash pop
```

### Step 5: Clear Cache (Optional tapi Recommended)
```bash
npm cache clean --force
```

### Step 6: Install Dependencies
```bash
npm install
```

### Step 7: Start Aplikasi

**Jika pakai PM2 (Recommended):**
```bash
pm2 restart app
# Atau jika belum ada:
pm2 start app.js --name app
pm2 save
```

**Jika pakai systemd:**
```bash
sudo systemctl start streamflow
sudo systemctl status streamflow
```

**Jika pakai nohup:**
```bash
nohup npm start > app.log 2>&1 &
```

**Jika development mode:**
```bash
npm start
# Atau:
node app.js
```

---

## 🔍 VERIFY APLIKASI RUNNING

### Check Status PM2:
```bash
pm2 status
pm2 logs app
```

### Check Process:
```bash
ps aux | grep node
```

### Check Port (misalnya port 3000):
```bash
netstat -tulpn | grep 3000
# Atau:
lsof -i :3000
```

### Check Logs:
```bash
# PM2 logs
pm2 logs app

# Atau app.log
tail -f app.log

# Atau system logs
journalctl -u streamflow -f
```

---

## 🌐 PENTING: Clear Browser Cache!

Setelah aplikasi restart di VPS, **TETAP HARUS** clear browser cache:

### Chrome / Edge:
```
1. Buka aplikasi di browser
2. Tekan Ctrl + Shift + R (hard refresh)
3. Atau Ctrl + Shift + Delete → Clear cache
```

### Mobile Browser:
```
1. Settings → Clear browsing data
2. Select "Cached images and files"
3. Clear data
```

---

## ✅ TEST SETELAH RESTART

### Step 1: Buka Aplikasi
```
1. Buka browser
2. Go to: http://your-vps-ip:3000
   Atau: https://yourdomain.com
3. Login jika perlu
```

### Step 2: Test Control Room
```
1. Klik tab "Control Room"
2. Klik "+ New Stream"
3. Modal "Create New Stream" terbuka
4. Pilih YouTube Account (e.g., "NeuralWork")
```

### Step 3: Verify Auto-Load Works
```
EXPECTED (dalam 1-2 detik):
✅ Manual input "Paste your YouTube stream key..." HILANG
✅ Dropdown stream key selector MUNCUL
✅ Stream key pertama AUTO-SELECTED
✅ Green indicator: "✓ Stream key loaded"
✅ Toast: "Auto-loaded stream key from your channel"
```

---

## 🐛 TROUBLESHOOTING VPS

### Problem 1: Git Pull Error "Permission Denied"

**Solution:**
```bash
# Check git remote
git remote -v

# If HTTPS, might need credentials
git config credential.helper store
git pull origin feature/professional-stream-key-selector

# If SSH, check SSH key
ssh -T git@github.com
```

---

### Problem 2: Port Already in Use

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or kill all node
pkill -f node
```

---

### Problem 3: npm install Error "Permission Denied"

**Solution:**
```bash
# If root user issues, use --unsafe-perm
npm install --unsafe-perm

# Or fix permissions
sudo chown -R $USER:$USER /path/to/streamflow-ozanglive
npm install
```

---

### Problem 4: PM2 Not Found

**Solution:**
```bash
# Install PM2 globally
npm install -g pm2

# Start app with PM2
pm2 start app.js --name app
pm2 save
pm2 startup
```

---

### Problem 5: Changes Not Appearing

**Solution:**
```bash
# Verify latest commit
git log --oneline -1
# Should show: 9aea6a7

# Force pull
git fetch --all
git reset --hard origin/feature/professional-stream-key-selector

# Clear cache aggressively
npm cache clean --force
rm -rf node_modules
npm install

# Restart with PM2
pm2 restart app --update-env
```

---

## 📊 COMMAND CHEAT SHEET

### Quick Commands:
```bash
# Full restart with latest changes
git pull origin feature/professional-stream-key-selector && npm install && pm2 restart app

# Quick restart (no pull)
pm2 restart app

# Check status
pm2 status

# View logs
pm2 logs app

# Stop app
pm2 stop app

# Start app
pm2 start app
```

---

## 🔧 PRODUCTION BEST PRACTICES

### Use PM2 for Production:
```bash
# Install PM2
npm install -g pm2

# Start app
pm2 start app.js --name app

# Enable auto-restart on reboot
pm2 startup
pm2 save

# Monitor
pm2 monit

# Logs
pm2 logs app --lines 100
```

### Use Nginx as Reverse Proxy:
```bash
# Nginx config example
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🎯 QUICK REFERENCE

**Restart dengan perubahan terbaru:**
```bash
ssh user@vps-ip
cd /path/to/app
./restart-vps.sh
```

**Manual restart lengkap:**
```bash
pm2 stop app
git pull origin feature/professional-stream-key-selector
npm install
pm2 restart app
```

**Check jika sudah running:**
```bash
pm2 status
curl http://localhost:3000
```

---

## 📞 NEED HELP?

**Check these:**
```bash
# Git status
git log --oneline -1
# Should show: 9aea6a7

# File exists?
ls -la views/dashboard.ejs
ls -la public/js/stream-modal.js

# App logs
pm2 logs app --lines 50
tail -f app.log

# System resources
htop
df -h
free -m
```

---

## ✅ SUCCESS INDICATORS

**In VPS:**
```bash
$ pm2 status
┌────┬────────┬─────────┬──────┬───────┬────────┐
│ id │ name   │ status  │ cpu  │ mem   │ uptime │
├────┼────────┼─────────┼──────┼───────┼────────┤
│ 0  │ app    │ online  │ 0%   │ 50 MB │ 5m     │
└────┴────────┴─────────┴──────┴───────┴────────┘

$ git log --oneline -1
9aea6a7 fix: Include stream-modal.js & add auto-trigger
```

**In Browser:**
```
✅ Control Room opens
✅ Select YouTube Account
✅ Dropdown appears (not manual input)
✅ Stream key auto-selected
✅ Green indicator shown
✅ Toast notification appears
```

---

## 🎉 ALL DONE!

**Aplikasi di VPS sudah restart dengan perubahan terbaru!**

Sekarang test di browser:
1. Clear cache (Ctrl+Shift+R)
2. Open Control Room
3. Select YouTube Account
4. ✅ Dropdown should auto-load!

---

*Last Updated: August 14, 2026*  
*For VPS / Linux Servers*  
*Commit: 9aea6a7*
