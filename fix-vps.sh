#!/bin/bash

echo "================================"
echo "  PERBAIKAN APLIKASI OZANGLIVE  "
echo "================================"
echo ""

# Stop aplikasi
echo "[1/6] Menghentikan aplikasi..."
pm2 stop ozanglive 2>/dev/null || true
sleep 3

# Pull perubahan terbaru dari GitHub
echo "[2/6] Mengambil perubahan terbaru dari GitHub..."
cd ~/ozanglive
git fetch origin
git reset --hard origin/main

# Hapus session dan database yang mungkin corrupt
echo "[3/6] Membersihkan session dan database..."
rm -f db/sessions.db*
echo "  ✓ Session database dibersihkan"

# Backup database utama sebelum optimasi
if [ -f "db/streamflow.db" ]; then
  cp db/streamflow.db db/streamflow.db.backup.$(date +%Y%m%d_%H%M%S)
  echo "  ✓ Database di-backup"
fi

# Install dependencies jika ada yang kurang
echo "[4/6] Memastikan dependencies terinstall..."
npm install --production

# Optimasi database
echo "[5/6] Mengoptimasi database..."
npm run optimize-db 2>/dev/null || echo "  ⚠️  Optimize DB skipped (optional)"

# Restart aplikasi
echo "[6/6] Memulai aplikasi..."
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
echo "🔍 Cek log untuk memastikan tidak ada error:"
echo "   pm2 logs ozanglive --lines 30"
echo ""
