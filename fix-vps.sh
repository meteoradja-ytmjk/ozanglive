#!/bin/bash

echo "================================"
echo "  PERBAIKAN APLIKASI OZANGLIVE  "
echo "================================"
echo ""

# Deteksi folder ozanglive
if [ -d "$HOME/ozanglive" ]; then
  cd "$HOME/ozanglive"
elif [ -d "/root/ozanglive" ]; then
  cd "/root/ozanglive"
fi

# Buat folder penting jika belum ada
mkdir -p logs db public/uploads/videos public/uploads/thumbnails public/uploads/avatars public/uploads/audios public/uploads/branding public/uploads/rendered

# Stop aplikasi lama
echo "[1/6] Menghentikan seluruh proses PM2 lama..."
pm2 delete all 2>/dev/null || true
if command -v fuser >/dev/null 2>&1; then
  sudo fuser -k 7575/tcp 2>/dev/null || true
fi
sleep 2

# Pull perubahan terbaru dari GitHub
echo "[2/6] Mengambil perubahan terbaru dari GitHub..."
git fetch origin
git reset --hard origin/main
git clean -fdq

# Hapus session dan database yang mungkin corrupt
echo "[3/6] Membersihkan lock session..."
rm -f db/sessions.db*
echo "  ✓ Session database dibersihkan"

# Backup database utama sebelum optimasi
if [ -f "db/streamflow.db" ]; then
  cp db/streamflow.db "db/streamflow.db.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
  echo "  ✓ Database di-backup"
fi

# Install dependencies jika ada yang kurang
echo "[4/6] Memastikan dependencies terinstall..."
npm install --omit=dev || npm install --production

# Pastikan firewall terbuka
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 7575/tcp 2>/dev/null || true
fi
if command -v iptables >/dev/null 2>&1; then
  sudo iptables -I INPUT -p tcp --dport 7575 -j ACCEPT 2>/dev/null || true
fi

# Memulai aplikasi
echo "[5/6] Memulai aplikasi dengan PM2..."
if [ -f "ecosystem.config.js" ]; then
  pm2 start ecosystem.config.js
else
  pm2 start app.js --name ozanglive
fi
pm2 save

echo "[6/6] Verifikasi respon aplikasi..."
sleep 3
if curl -fsSIL --max-time 3 http://127.0.0.1:7575/health >/dev/null 2>&1 || curl -fsSIL --max-time 3 http://127.0.0.1:7575/login >/dev/null 2>&1; then
  echo "  ✓ Aplikasi online dan merespon normal di port 7575!"
else
  echo "  ⚠️ Sedang warming up, merefresh PM2..."
  pm2 restart ozanglive 2>/dev/null || true
fi

echo ""
echo "================================"
echo "  ✅ PERBAIKAN SELESAI!         "
echo "================================"
echo ""
echo "🌐 Aplikasi dapat diakses di:"
echo "   http://$(curl -s ifconfig.me):7575"
echo ""
echo "📋 Perintah berguna:"
echo "   pm2 status         - Cek status aplikasi"
echo "   pm2 logs ozanglive - Lihat log aplikasi"
echo "   pm2 restart ozanglive - Restart aplikasi"
echo ""
echo "⚠️  PENTING:"
echo "   Setelah login, jika masih redirect loop:"
echo "   1. Hapus cookies browser (Ctrl+Shift+Delete)"
echo "   2. Gunakan mode Incognito/Private"
echo "   3. Coba browser lain"
echo ""
echo "🔍 Cek log untuk memastikan tidak ada error:"
echo "   pm2 logs ozanglive --lines 30"
echo ""
