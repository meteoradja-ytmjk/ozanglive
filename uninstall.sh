#!/bin/bash

set -e

FULL_CLEAN=false
if [ "${1:-}" = "--full-clean" ]; then
    FULL_CLEAN=true
fi

echo "================================"
echo "   OzangLive Uninstaller   "
echo "================================"
echo

echo "🛑 Stopping OzangLive..."
pm2 stop ozanglive 2>/dev/null || true
pm2 delete ozanglive 2>/dev/null || true
pm2 save 2>/dev/null || true

echo "🗑️  Menghapus folder ozanglive..."
rm -rf "$HOME/ozanglive"

echo "🧹 Membersihkan PM2..."
pm2 kill 2>/dev/null || true
rm -rf "$HOME/.pm2" 2>/dev/null || true

echo "🔥 Menghapus PM2..."
sudo npm uninstall -g pm2 2>/dev/null || true

echo "📦 Menghapus Node.js..."
sudo apt remove -y nodejs 2>/dev/null || true
sudo apt autoremove -y

echo "🎬 Menghapus FFmpeg..."
sudo apt remove -y ffmpeg 2>/dev/null || true
sudo apt autoremove -y

echo "🔧 Reset firewall..."
sudo ufw delete allow 7575 2>/dev/null || true

echo "🧹 Membersihkan cache..."
sudo apt clean
sudo apt autoclean
npm cache clean --force 2>/dev/null || true

if [ "$FULL_CLEAN" = true ]; then
    echo "🧨 Mode full-clean aktif: menghapus cache/log tambahan..."
    rm -rf "$HOME/.npm" 2>/dev/null || true
    rm -rf "$HOME/.cache/pip" 2>/dev/null || true
    rm -rf "$HOME/.cache" 2>/dev/null || true
    sudo journalctl --vacuum-time=3d 2>/dev/null || true
    sudo rm -rf /tmp/* 2>/dev/null || true
fi

echo "📊 Ringkasan disk setelah uninstall:"
df -h / | tail -n 1

echo
echo "================================"
echo "✅ UNINSTALL SELESAI!"
echo "================================"
echo
echo "VPS sudah bersih dari OzangLive."
echo "Untuk install ulang, jalankan:"
echo "curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/install.sh | bash"
echo
echo "Tips jika disk masih besar:"
echo "  - Jalankan full clean: curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/uninstall.sh | bash -s -- --full-clean"
echo "  - Cek folder terbesar: sudo du -xh / | sort -h | tail -n 30"
echo "================================"
