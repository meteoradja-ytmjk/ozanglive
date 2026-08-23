# ⚡ VPS Quick Commands - Copy & Paste

## 🚀 ONE-LINER COMMANDS (Copy & Paste ke SSH)

### Option 1: Full Restart dengan Latest Changes (Recommended)
```bash
cd /path/to/streamflow-ozanglive && pm2 stop app && git pull origin feature/professional-stream-key-selector && npm cache clean --force && npm install && pm2 restart app && pm2 save
```

### Option 2: Quick Restart (Tanpa Pull)
```bash
cd /path/to/streamflow-ozanglive && pm2 restart app
```

### Option 3: Full Clean Restart
```bash
cd /path/to/streamflow-ozanglive && pm2 stop app && git fetch --all && git reset --hard origin/feature/professional-stream-key-selector && npm cache clean --force && rm -rf node_modules && npm install && pm2 restart app
```

---

## 📋 STEP BY STEP (Jika One-Liner Tidak Bekerja)

### 1. SSH ke VPS
```bash
ssh user@your-vps-ip
```

### 2. Masuk ke Folder Aplikasi
```bash
cd /path/to/streamflow-ozanglive
# Atau cek dulu dimana aplikasi:
# ls -la /var/www/
# ls -la ~/
```

### 3. Stop Aplikasi
```bash
# Jika pakai PM2:
pm2 stop app

# Jika pakai systemd:
sudo systemctl stop streamflow

# Jika langsung node:
pkill -f node
```

### 4. Pull Latest Changes
```bash
git pull origin feature/professional-stream-key-selector
```

### 5. Install Dependencies
```bash
npm install
```

### 6. Start Aplikasi
```bash
# Jika pakai PM2:
pm2 restart app

# Jika pakai systemd:
sudo systemctl start streamflow

# Jika langsung node:
nohup npm start > app.log 2>&1 &
```

---

## 🔍 VERIFY COMMANDS

### Check App Status:
```bash
pm2 status
```

### Check Git Commit:
```bash
git log --oneline -1
# Should show: 9aea6a7 fix: Include stream-modal.js...
```

### Check Files Updated:
```bash
ls -la views/dashboard.ejs
ls -la public/js/stream-modal.js
```

### Check App Logs:
```bash
pm2 logs app --lines 50
# Atau:
tail -f app.log
```

### Check if Running:
```bash
curl http://localhost:3000
# Atau check port:
netstat -tulpn | grep 3000
```

---

## 🎯 COMMON PATHS

Replace `/path/to/streamflow-ozanglive` dengan salah satu:

```bash
# Common locations:
/var/www/streamflow-ozanglive
/var/www/html/streamflow-ozanglive
/home/user/streamflow-ozanglive
/home/ubuntu/streamflow-ozanglive
/opt/streamflow-ozanglive
~/streamflow-ozanglive

# Find aplikasi:
find /var/www -name "app.js" 2>/dev/null
find ~ -name "app.js" 2>/dev/null
```

---

## 💡 TROUBLESHOOTING ONE-LINERS

### If Git Pull Fails:
```bash
cd /path/to/streamflow-ozanglive && git stash && git pull origin feature/professional-stream-key-selector && git stash pop
```

### If Port in Use:
```bash
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9 && pm2 restart app
```

### If PM2 Not Installed:
```bash
npm install -g pm2 && cd /path/to/streamflow-ozanglive && pm2 start app.js --name app && pm2 save && pm2 startup
```

---

## 🔧 PRODUCTION COMMANDS

### Full Production Restart:
```bash
cd /path/to/streamflow-ozanglive && \
pm2 stop app && \
git pull origin feature/professional-stream-key-selector && \
npm cache clean --force && \
npm install --production && \
pm2 restart app --update-env && \
pm2 save
```

### Zero-Downtime Reload (if supported):
```bash
cd /path/to/streamflow-ozanglive && \
git pull origin feature/professional-stream-key-selector && \
npm install --production && \
pm2 reload app
```

---

## ✅ SUCCESS CHECK

Run this to verify everything:
```bash
echo "=== GIT STATUS ===" && \
git log --oneline -1 && \
echo "" && \
echo "=== PM2 STATUS ===" && \
pm2 status && \
echo "" && \
echo "=== APP RESPONSE ===" && \
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected output:
```
=== GIT STATUS ===
9aea6a7 fix: Include stream-modal.js & add auto-trigger

=== PM2 STATUS ===
┌────┬────────┬─────────┬──────┬───────┬────────┐
│ id │ name   │ status  │ cpu  │ mem   │ uptime │
├────┼────────┼─────────┼──────┼───────┼────────┤
│ 0  │ app    │ online  │ 0%   │ 50 MB │ 5m     │
└────┴────────┴─────────┴──────┴───────┴────────┘

=== APP RESPONSE ===
200
```

---

## 📞 EMERGENCY COMMANDS

### App Not Responding:
```bash
pm2 delete app && cd /path/to/streamflow-ozanglive && pm2 start app.js --name app && pm2 save
```

### Full Reset:
```bash
cd /path/to/streamflow-ozanglive && \
pm2 stop app && \
git fetch --all && \
git reset --hard origin/feature/professional-stream-key-selector && \
rm -rf node_modules package-lock.json && \
npm cache clean --force && \
npm install && \
pm2 restart app
```

### Check Disk Space:
```bash
df -h && du -sh /path/to/streamflow-ozanglive/node_modules
```

---

## 🎯 MOST COMMON COMMAND (Copy This!)

**For most cases, use this:**
```bash
cd /path/to/streamflow-ozanglive && pm2 stop app && git pull origin feature/professional-stream-key-selector && npm install && pm2 restart app && echo "✅ Restart complete! Check browser now."
```

**Then in browser:**
- Press `Ctrl + Shift + R` (hard refresh)
- Go to Control Room
- Select YouTube Account
- ✅ Dropdown should appear!

---

*Quick Reference for VPS Deployment*  
*Commit: 9aea6a7*  
*Last Updated: August 14, 2026*
