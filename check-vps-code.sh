#!/bin/bash
# Script to check if VPS has latest code

echo "=== Checking VPS Code Status ==="
echo ""

echo "1. Current directory:"
pwd

echo ""
echo "2. Git status:"
git status

echo ""
echo "3. Latest commits:"
git log --oneline -5

echo ""
echo "4. Checking for user_role fix in app.js:"
echo "Looking for: 'CRITICAL FIX: Ensure user_role'"
grep -n "CRITICAL FIX: Ensure user_role" app.js || echo "❌ FIX NOT FOUND!"

echo ""
echo "5. Checking current branch:"
git branch

echo ""
echo "6. Checking remote status:"
git remote -v
git fetch origin
git status

echo ""
echo "=== INSTRUCTIONS ==="
echo "If you see 'Your branch is behind', run:"
echo "  git pull origin main"
echo "  pm2 restart ozanglive"
