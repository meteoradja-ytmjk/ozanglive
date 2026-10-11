#!/usr/bin/env bash
# ==============================================================================
# OzangLive Multidomain Installer (Forwarder)
# Forwards to ozanglive-universal-multidomain-quick-installer-v7-token-robust.sh
# ==============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/ozanglive-universal-multidomain-quick-installer-v7-token-robust.sh" "$@"
