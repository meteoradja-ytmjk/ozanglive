#!/bin/bash
# Diagnostic script untuk settings page issue

echo "=== DIAGNOSTIC: Settings Page Issue ==="
echo ""

echo "1. Checking PM2 status..."
pm2 status

echo ""
echo "2. Checking latest git commit..."
cd /root/ozanglive
git log --oneline -3

echo ""
echo "3. Checking if code has user_role fix..."
grep -n "CRITICAL FIX: Ensure user_role" app.js | head -5

echo ""
echo "4. Tailing PM2 logs for Settings access..."
echo "Please access Settings page in browser NOW, then press Ctrl+C after 10 seconds"
pm2 logs ozanglive --lines 0 | grep -i "settings\|error\|redirect"
