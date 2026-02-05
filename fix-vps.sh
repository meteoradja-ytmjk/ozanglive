#!/bin/bash

echo "================================"
echo "  PERBAIKAN APLIKASI OZANGLIVE  "
echo "================================"
echo ""

# Stop aplikasi
echo "[1/5] Menghentikan aplikasi..."
pm2 stop ozanglive 2>/dev/null || true
sleep 2

# Pull perubahan terbaru dari GitHub
echo "[2/5] Mengambil perubahan terbaru dari GitHub..."
cd ~/ozanglive
git fetch origin
git reset --hard origin/main

# Hapus session database yang corrupt
echo "[3/5] Membersihkan session database..."
rm -f db/sessions.db*

# Install dependencies jika ada yang kurang
echo "[4/5] Memastikan dependencies terinstall..."
npm install --production

# Restart aplikasi
echo "[5/5] Memulai aplikasi..."
pm2 restart ozanglive 2>/dev/null || pm2 start app.js --name ozanglive
pm2 save

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
