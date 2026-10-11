# 🚀 Ozanglive Domain Setup - Cheatsheet

## ⚡ Quick Commands

### Setup Domain (Cara Tercepat)
```bash
cd ~ && bash ozanglive-universal-multidomain-quick-installer-v2.sh
```

### Download & Setup (Jika Installer Tidak Ada)
```bash
cd ~ && curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v2.sh -o domain-setup.sh && chmod +x domain-setup.sh && bash domain-setup.sh
```

---

## 📋 Input Examples

### Mode: Base Domain Sama
```
Tunnel name : live-user-01
Same base?  : Y
Base domain : monsterlive.my.id
Subdomain   : live2
Port        : 7575
App folder  : /home/ubuntu/ozanglive

→ Result: https://live2.monsterlive.my.id
```

### Mode: Domain Berbeda
```
Tunnel name : budilive-panel
Same base?  : N
Domain      : stream.budilive.com
Port        : 7575
App folder  : /home/ubuntu/ozanglive

→ Result: https://stream.budilive.com
```

---

## 🔧 Troubleshooting Commands

```bash
# Check cloudflared status
sudo systemctl status cloudflared

# Restart cloudflared
sudo systemctl restart cloudflared

# View logs
sudo journalctl -u cloudflared -n 50

# Check app status
pm2 status

# Restart app
pm2 restart all

# Test local origin
curl http://localhost:7575

# Test public HTTPS
curl -I https://yourdomain.com
```

---

## 📁 Important Files

| File | Location | Purpose |
|------|----------|---------|
| Cloudflare cert | `~/.cloudflared/cert.pem` | CF auth certificate |
| Tunnel credentials | `~/.cloudflared/UUID.json` | Tunnel token |
| Config file | `~/.cloudflared/config.yml` | Tunnel routing |
| App environment | `~/ozanglive/.env` | App settings |

⚠️ **NEVER share these files publicly!**

---

## 🔍 Check Installation

```bash
# List all tunnels
cloudflared tunnel list

# Tunnel info
cloudflared tunnel info TUNNEL_NAME

# Check tunnel service
sudo systemctl is-active cloudflared
sudo systemctl is-enabled cloudflared

# View current config
cat ~/.cloudflared/config.yml

# View app settings
cat ~/ozanglive/.env | grep -E "PORT|BASE_URL"
```

---

## 🎯 Multi-Domain Setup

Same VPS, different domains:

```bash
# User 1
bash domain-setup.sh  # tunnel: live-user1, domain: user1.com

# User 2  
bash domain-setup.sh  # tunnel: live-user2, domain: user2.com

# User 3
bash domain-setup.sh  # tunnel: live-user3, domain: user3.com
```

⚠️ **Important:** Each tunnel must have a **unique name**!

---

## 🔐 Security Checklist

- [ ] Never commit `.env` to git
- [ ] Never share `cert.pem` publicly
- [ ] Never share tunnel UUID.json
- [ ] Keep OAuth secrets private
- [ ] Use strong passwords
- [ ] Enable UFW firewall
- [ ] Keep system updated

---

## 📞 Support

**WhatsApp:** 089621453431  
**GitHub:** https://github.com/meteoradja-ytmjk/ozanglive

---

## 📚 Full Documentation

```bash
# View full setup guide
cat ~/ozanglive/CARA-SETUP-DOMAIN.md

# View quick reference
cat ~/ozanglive/SETUP-DOMAIN-QUICKSTART.txt

# View README
cat ~/ozanglive/README-DOMAIN-SETUP.md
```

---

## ✅ Success Indicators

✔️ `sudo systemctl status cloudflared` → **active (running)**  
✔️ `pm2 status` → **online**  
✔️ Domain accessible via **HTTPS**  
✔️ `.env` updated with correct **BASE_URL**  
✔️ OAuth callback working  

---

## 🚫 Common Mistakes

❌ Tunnel name already used → Use unique name  
❌ Domain not in Cloudflare → Add domain first  
❌ Wrong Cloudflare account → Use correct account  
❌ App not running → Start PM2 first  
❌ Wrong port → Check .env file  

---

**💡 Pro Tip:** Bookmark this page or save it to your notes!

---

_Last Updated: 2024 | Version: 2.0_
