#!/bin/bash
# Interactive Documentation Menu for Ozanglive Domain Setup

# Colors
NC='\033[0m'
B_CYAN='\033[1;36m'
B_GREEN='\033[1;32m'
B_YELLOW='\033[1;33m'
B_PURPLE='\033[1;35m'
B_WHITE='\033[1;37m'
GRAY='\033[90m'

DOC_DIR="$HOME/ozanglive"

show_menu() {
    clear
    echo -e "${B_CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${B_CYAN}║  📚 OZANGLIVE DOMAIN SETUP - DOCUMENTATION MENU            ║${NC}"
    echo -e "${B_CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "${B_WHITE}Pilih dokumentasi yang ingin Anda lihat:${NC}"
    echo
    echo -e "${B_GREEN}[1]${NC} ${B_YELLOW}QUICKSTART${NC} - Copy-paste command cepat (1-2 menit)"
    echo -e "${GRAY}    └─ File: SETUP-DOMAIN-QUICKSTART.txt${NC}"
    echo
    echo -e "${B_GREEN}[2]${NC} ${B_YELLOW}CARA SETUP${NC} - Panduan lengkap step-by-step (10-15 menit)"
    echo -e "${GRAY}    └─ File: CARA-SETUP-DOMAIN.md${NC}"
    echo
    echo -e "${B_GREEN}[3]${NC} ${B_YELLOW}CHEATSHEET${NC} - Quick reference untuk admin (3-5 menit)"
    echo -e "${GRAY}    └─ File: DOMAIN-SETUP-CHEATSHEET.md${NC}"
    echo
    echo -e "${B_GREEN}[4]${NC} ${B_YELLOW}README${NC} - Big picture & architecture (15-20 menit)"
    echo -e "${GRAY}    └─ File: README-DOMAIN-SETUP.md${NC}"
    echo
    echo -e "${B_GREEN}[5]${NC} ${B_YELLOW}INDEX${NC} - Overview semua dokumentasi"
    echo -e "${GRAY}    └─ File: DOKUMENTASI-DOMAIN-INDEX.md${NC}"
    echo
    echo -e "${B_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "${B_GREEN}[6]${NC} ${B_PURPLE}🚀 JALANKAN INSTALLER${NC} - Setup domain sekarang"
    echo
    echo -e "${B_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "${B_GREEN}[0]${NC} Keluar"
    echo
    echo -e "${B_CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
    printf "${B_WHITE}Pilihan Anda [0-6]: ${NC}"
}

view_file() {
    local file="$1"
    local title="$2"
    
    if [ ! -f "$file" ]; then
        echo
        echo -e "${B_YELLOW}⚠️  File tidak ditemukan: $file${NC}"
        echo
        read -p "Tekan ENTER untuk kembali ke menu..."
        return
    fi
    
    clear
    echo -e "${B_CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${B_CYAN}║  📄 $title${NC}"
    echo -e "${B_CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
    
    if command -v less >/dev/null 2>&1; then
        less "$file"
    elif command -v more >/dev/null 2>&1; then
        more "$file"
    else
        cat "$file"
        echo
        read -p "Tekan ENTER untuk kembali ke menu..."
    fi
}

run_installer() {
    echo
    echo -e "${B_PURPLE}🚀 Memulai Domain Setup Installer...${NC}"
    echo
    
    INSTALLER="$DOC_DIR/ozanglive-universal-multidomain-quick-installer-v2.sh"
    
    if [ ! -f "$INSTALLER" ]; then
        INSTALLER="$HOME/ozanglive-universal-multidomain-quick-installer-v2.sh"
    fi
    
    if [ ! -f "$INSTALLER" ]; then
        echo -e "${B_YELLOW}⚠️  Installer tidak ditemukan!${NC}"
        echo
        echo "Download installer terlebih dahulu:"
        echo
        echo -e "${B_CYAN}curl -fsSL https://raw.githubusercontent.com/meteoradja-ytmjk/ozanglive/main/ozanglive-universal-multidomain-quick-installer-v2.sh -o ~/domain-setup.sh${NC}"
        echo -e "${B_CYAN}chmod +x ~/domain-setup.sh${NC}"
        echo -e "${B_CYAN}bash ~/domain-setup.sh${NC}"
        echo
        read -p "Tekan ENTER untuk kembali ke menu..."
        return
    fi
    
    chmod +x "$INSTALLER"
    bash "$INSTALLER"
}

# Main loop
while true; do
    show_menu
    read -r choice
    
    case $choice in
        1)
            view_file "$DOC_DIR/SETUP-DOMAIN-QUICKSTART.txt" "QUICKSTART GUIDE"
            ;;
        2)
            view_file "$DOC_DIR/CARA-SETUP-DOMAIN.md" "CARA SETUP DOMAIN LENGKAP"
            ;;
        3)
            view_file "$DOC_DIR/DOMAIN-SETUP-CHEATSHEET.md" "CHEATSHEET"
            ;;
        4)
            view_file "$DOC_DIR/README-DOMAIN-SETUP.md" "README & ARCHITECTURE"
            ;;
        5)
            view_file "$DOC_DIR/DOKUMENTASI-DOMAIN-INDEX.md" "INDEX DOKUMENTASI"
            ;;
        6)
            run_installer
            ;;
        0)
            echo
            echo -e "${B_GREEN}✅ Terima kasih! Selamat setup domain! 🚀${NC}"
            echo
            exit 0
            ;;
        *)
            echo
            echo -e "${B_YELLOW}⚠️  Pilihan tidak valid. Pilih 0-6.${NC}"
            sleep 2
            ;;
    esac
done
