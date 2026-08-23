#!/bin/bash

echo "============================================"
echo "   RESTART APP WITH LATEST CHANGES (VPS)"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Stop current app
echo -e "${YELLOW}[1/5] Stopping current application...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 stop all
    echo -e "${GREEN}✓ PM2 apps stopped${NC}"
elif pgrep -f "node.*app.js" > /dev/null; then
    pkill -f "node.*app.js"
    echo -e "${GREEN}✓ Node processes killed${NC}"
else
    echo -e "${GREEN}✓ No running processes found${NC}"
fi
sleep 2

# Step 2: Pull latest changes
echo ""
echo -e "${YELLOW}[2/5] Pulling latest changes from GitHub...${NC}"
git pull origin feature/professional-stream-key-selector

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Git pull successful${NC}"
else
    echo -e "${RED}✗ Git pull failed${NC}"
    echo "Run: git stash && git pull origin feature/professional-stream-key-selector"
    exit 1
fi

# Step 3: Clear npm cache
echo ""
echo -e "${YELLOW}[3/5] Clearing npm cache...${NC}"
npm cache clean --force
echo -e "${GREEN}✓ Cache cleared${NC}"

# Step 4: Install dependencies
echo ""
echo -e "${YELLOW}[4/5] Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 5: Start application
echo ""
echo -e "${YELLOW}[5/5] Starting application...${NC}"

if command -v pm2 &> /dev/null; then
    # Using PM2
    if pm2 list | grep -q "app"; then
        pm2 restart app
        echo -e "${GREEN}✓ Application restarted with PM2${NC}"
    else
        pm2 start app.js --name app
        echo -e "${GREEN}✓ Application started with PM2${NC}"
    fi
    pm2 save
else
    # Using nohup or direct start
    nohup npm start > app.log 2>&1 &
    echo -e "${GREEN}✓ Application started in background${NC}"
fi

echo ""
echo "============================================"
echo -e "${GREEN}   APPLICATION RESTARTED SUCCESSFULLY!${NC}"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Clear browser cache (Ctrl+Shift+R)"
echo "2. Test Control Room"
echo "3. Select YouTube Account"
echo "4. ✓ Dropdown should appear (not manual input)"
echo ""
echo "Check logs with: pm2 logs app"
echo "Or: tail -f app.log"
echo ""
