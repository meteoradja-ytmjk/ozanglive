#!/usr/bin/env bash

# ==============================================================
# OZANGLIVE - QUICK STATUS CHECKER
# ==============================================================
# Script untuk mengecek status instalasi Ozanglive
# Gunakan setelah menjalankan installer V3
# ==============================================================

C_RESET='\033[0m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[0;31m'
C_BLUE='\033[0;34m'

ok()    { echo -e "${C_GREEN}✅ $*${C_RESET}"; }
warn()  { echo -e "${C_YELLOW}⚠️  $*${C_RESET}"; }
error() { echo -e "${C_RED}❌ $*${C_RESET}"; }
info()  { echo -e "${C_BLUE}ℹ️  $*${C_RESET}"; }

echo
echo "=============================================================="
echo " OZANGLIVE - STATUS CHECK"
echo "=============================================================="
echo

# Check cloudflared
echo "1. Checking Cloudflared..."
if command -v cloudflared >/dev/null 2>&1; then
    ok "Cloudflared installed: $(cloudflared --version | head -n1)"
else
    error "Cloudflared not installed"
fi

# Check cloudflared service
echo
echo "2. Checking Cloudflared Service..."
if systemctl is-enabled cloudflared >/dev/null 2>&1; then
    ok "Cloudflared service enabled"
else
    warn "Cloudflared service not enabled"
fi

if systemctl is-active cloudflared >/dev/null 2>&1; then
    ok "Cloudflared service running"
else
    error "Cloudflared service not running"
    echo "   Run: sudo systemctl start cloudflared"
fi

# Check cert.pem
echo
echo "3. Checking Cloudflare Credentials..."
if [[ -f ~/.cloudflared/cert.pem ]]; then
    ok "Cloudflare cert.pem exists"
else
    warn "Cloudflare cert.pem not found"
    echo "   Run: cloudflared tunnel login"
fi

# Check config.yml
if [[ -f ~/.cloudflared/config.yml ]]; then
    ok "Cloudflared config.yml exists"
    
    echo
    info "Config content:"
    cat ~/.cloudflared/config.yml | sed 's/^/   /'
else
    error "Cloudflared config.yml not found"
fi

# Check tunnels
echo
echo "4. Checking Tunnels..."
if cloudflared tunnel list >/dev/null 2>&1; then
    TUNNEL_COUNT=$(cloudflared tunnel list 2>/dev/null | awk 'NR>1' | wc -l)
    
    if [[ "$TUNNEL_COUNT" -gt 0 ]]; then
        ok "Found $TUNNEL_COUNT tunnel(s)"
        echo
        cloudflared tunnel list | sed 's/^/   /'
    else
        warn "No tunnels found"
        echo "   Create tunnel with installer"
    fi
else
    error "Cannot list tunnels"
fi

# Check PM2
echo
echo "5. Checking PM2..."
if command -v pm2 >/dev/null 2>&1; then
    ok "PM2 installed"
    
    echo
    info "PM2 apps:"
    pm2 list | sed 's/^/   /'
    
    # Check if ozanglive app exists
    if pm2 describe ozanglive >/dev/null 2>&1; then
        ok "PM2 app 'ozanglive' found"
        
        # Get PID
        PM2_PID="$(pm2 pid ozanglive | head -n1 | tr -d '[:space:]')"
        if [[ -n "$PM2_PID" && "$PM2_PID" != "0" ]]; then
            ok "PM2 app running (PID: $PM2_PID)"
            
            # Check BASE_URL
            if [[ -f "/proc/$PM2_PID/environ" ]]; then
                BASE_URL_PROC="$(sudo tr '\0' '\n' < "/proc/$PM2_PID/environ" 2>/dev/null | grep '^BASE_URL=' || true)"
                if [[ -n "$BASE_URL_PROC" ]]; then
                    echo "   $BASE_URL_PROC"
                else
                    warn "BASE_URL not found in process environment"
                fi
            fi
        else
            warn "PM2 app not running"
        fi
    else
        warn "PM2 app 'ozanglive' not found"
    fi
else
    error "PM2 not installed"
fi

# Check app directory
echo
echo "6. Checking Application Directory..."
APP_DIR="/home/ubuntu/ozanglive"
if [[ -d "$APP_DIR" ]]; then
    ok "App directory exists: $APP_DIR"
    
    if [[ -f "$APP_DIR/.env" ]]; then
        ok ".env file exists"
        
        echo
        info "Environment variables (non-secret):"
        grep -E '^(PORT|BASE_URL)=' "$APP_DIR/.env" 2>/dev/null | sed 's/^/   /' || warn "PORT/BASE_URL not found in .env"
    else
        error ".env file not found"
    fi
    
    if [[ -f "$APP_DIR/app.js" ]]; then
        ok "app.js exists"
    else
        warn "app.js not found"
    fi
else
    error "App directory not found: $APP_DIR"
fi

# Check local origin
echo
echo "7. Checking Local Origin..."
APP_PORT="7575"

if [[ -f "$APP_DIR/.env" ]]; then
    ENV_PORT="$(grep '^PORT=' "$APP_DIR/.env" | cut -d'=' -f2)"
    if [[ -n "$ENV_PORT" ]]; then
        APP_PORT="$ENV_PORT"
    fi
fi

if curl -fsS --max-time 10 "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
    ok "Local origin responding: http://127.0.0.1:$APP_PORT"
else
    error "Local origin not responding: http://127.0.0.1:$APP_PORT"
    echo "   Check: curl http://127.0.0.1:$APP_PORT"
fi

# Check public HTTPS
echo
echo "8. Checking Public HTTPS..."
if [[ -f "$APP_DIR/.env" ]]; then
    BASE_URL="$(grep '^BASE_URL=' "$APP_DIR/.env" | cut -d'=' -f2)"
    
    if [[ -n "$BASE_URL" ]]; then
        info "Testing: $BASE_URL"
        
        if curl -fsSIL --max-time 25 "$BASE_URL/" >/dev/null 2>&1; then
            ok "Public HTTPS responding: $BASE_URL"
        else
            warn "Public HTTPS not responding: $BASE_URL"
            echo "   This might be normal if:"
            echo "   - DNS route was skipped"
            echo "   - Domain just configured (wait 10-60 seconds)"
            echo "   - Domain not in Cloudflare yet"
            echo
            echo "   Manual DNS route:"
            echo "   cloudflared tunnel route dns TUNNEL_NAME $(echo $BASE_URL | sed 's|https://||' | sed 's|http://||' | cut -d'/' -f1)"
        fi
    else
        warn "BASE_URL not found in .env"
    fi
else
    warn ".env not found, skipping public HTTPS check"
fi

# Recent logs
echo
echo "9. Recent Cloudflared Logs..."
echo
sudo journalctl -u cloudflared -n 20 --no-pager | sed 's/^/   /'

echo
echo "=============================================================="
echo " SUMMARY"
echo "=============================================================="
echo
echo "Quick commands:"
echo
echo "• Restart Cloudflared:  sudo systemctl restart cloudflared"
echo "• Restart PM2:          pm2 restart ozanglive"
echo "• View PM2 logs:        pm2 logs ozanglive"
echo "• View CF logs:         sudo journalctl -u cloudflared -f"
echo "• Test local:           curl http://127.0.0.1:$APP_PORT"
if [[ -n "$BASE_URL" ]]; then
    echo "• Test public:          curl -I $BASE_URL"
fi
echo
echo "=============================================================="
