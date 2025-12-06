#!/bin/bash

set -e

echo "================================"
echo "   OzangLive Quick Installer   "
echo "================================"
echo

# Cek apakah sudah ada instalasi sebelumnya
if [ -d "$HOME/ozanglive" ] || pm2 list 2>/dev/null | grep -q "ozanglive"; then
    echo "⚠️  Instalasi OzangLive sudah ada!"
    echo
    echo "🗑️  Menghapus instalasi lama..."
    pm2 delete ozanglive 2>/dev/null || true
    pm2 save 2>/dev/null || true
    rm -rf "$HOME/ozanglive"
    echo "✅ Instalasi lama dihapus"
    echo
fi

echo "🔄 Updating sistem..."
sudo apt update && sudo apt upgrade -y

# Cek dan install Node.js jika belum ada
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js sudah terinstall: $(node -v)"
fi

# Cek dan install FFmpeg jika belum ada
if ! command -v ffmpeg &> /dev/null; then
    echo "🎬 Installing FFmpeg..."
    sudo apt install ffmpeg -y
else
    echo "✅ FFmpeg sudah terinstall"
fi

# Cek dan install Git jika belum ada
if ! command -v git &> /dev/null; then
    echo "📦 Installing Git..."
    sudo apt install git -y
else
    echo "✅ Git sudah terinstall"
fi

echo "📥 Clone repository..."
cd "$HOME"
git clone https://github.com/meteoradja-ytmjk/ozanglive
cd ozanglive

echo "⚙️ Installing dependencies..."
npm install
npm run generate-secret

echo "🕐 Setup timezone ke Asia/Jakarta..."
sudo timedatectl set-timezone Asia/Jakarta

echo "🔧 Setup firewall..."
sudo ufw allow ssh
sudo ufw allow 7575
sudo ufw --force enable

# Cek dan install PM2 jika belum ada
if ! command -v pm2 &> /dev/null; then
    echo "🚀 Installing PM2..."
    sudo npm install -g pm2
else
    echo "✅ PM2 sudah terinstall"
fi

echo "▶️ Starting OzangLive..."
pm2 start app.js --name ozanglive
pm2 save
pm2 startup

echo
echo "================================"
echo "✅ INSTALASI SELESAI!"
echo "================================"

SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "IP_SERVER")
echo
echo "🌐 URL Akses: http://$SERVER_IP:7575"
echo
echo "📋 Langkah selanjutnya:"
echo "1. Buka URL di browser"
echo "2. Buat username & password"
echo "3. Setelah membuat akun, lakukan Sign Out kemudian login kembali untuk sinkronisasi database"
echo
echo "📌 Perintah berguna:"
echo "   pm2 status         - Cek status"
echo "   pm2 logs ozanglive - Lihat logs"
echo "   pm2 restart ozanglive - Restart app"
echo "================================"
