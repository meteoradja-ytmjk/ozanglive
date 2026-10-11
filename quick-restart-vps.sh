#!/bin/bash

echo "============================================"
echo "   QUICK RESTART (VPS)"
echo "============================================"
echo ""

# Stop app
echo "Stopping application..."
if command -v pm2 &> /dev/null; then
    pm2 restart app
else
    pkill -f "node.*app.js"
    sleep 2
    nohup npm start > app.log 2>&1 &
fi

echo "✓ Application restarted!"
echo ""
echo "Check status: pm2 status"
echo "Or: ps aux | grep node"
echo ""
