/**
 * PM2 Ecosystem Configuration
 * 
 * PM2 is a process manager for Node.js applications that provides:
 * - Auto-restart on crash
 * - Load balancing (cluster mode)
 * - Log management
 * - Memory monitoring
 * - Zero-downtime reload
 * 
 * Usage:
 *   Install PM2: npm install -g pm2
 *   Start app:   pm2 start ecosystem.config.js
 *   Stop app:    pm2 stop ozanglive
 *   Restart:     pm2 restart ozanglive
 *   View logs:   pm2 logs ozanglive
 *   Monitor:     pm2 monit
 *   Status:      pm2 status
 *   
 * Auto-start on system boot:
 *   pm2 startup
 *   pm2 save
 */

// CRITICAL: Load environment variables from .env file
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Pastikan folder logs selalu ada agar PM2 tidak error membuka log file
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (e) {}
}

module.exports = {
  apps: [
    {
      name: 'ozanglive',
      script: 'app.js',

      // Instance configuration
      instances: 1, // Single instance (streaming apps shouldn't use cluster mode)
      exec_mode: 'fork', // Fork mode for single instance

      // Auto-restart configuration - BALANCED for stability
      autorestart: true,
      watch: false, // Don't watch for file changes in production
      max_restarts: 50,
      min_uptime: '5s',
      restart_delay: 2000,

      // Memory management - CONSERVATIVE for 1GB VPS
      max_memory_restart: '850M',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 7575,
        // CRITICAL: Force application timezone to WIB (Asia/Jakarta)
        TZ: 'Asia/Jakarta',
        // CRITICAL: Pass SESSION_SECRET from .env to PM2
        SESSION_SECRET: process.env.SESSION_SECRET,
        // Pass BASE_URL from .env to PM2 if defined
        BASE_URL: process.env.BASE_URL,
        // Disable memory warnings
        NODE_OPTIONS: '--max-old-space-size=768 --no-warnings'
      },

      env_development: {
        NODE_ENV: 'development',
        PORT: 7575,
        TZ: 'Asia/Jakarta'
      },

      // Logging - OPTIMIZED to prevent disk space issues
      log_file: path.join(__dirname, 'logs', 'pm2-combined.log'),
      out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
      error_file: path.join(__dirname, 'logs', 'pm2-error.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_size: '50M', // Rotate logs at 50MB
      retain: 3, // Keep only 3 log files

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 15000,

      // Crash handling - STABLE recovery
      exp_backoff_restart_delay: 100,

      node_args: [],

      // Cron restart - restart every day at 4 AM WIB
      cron_restart: '0 4 * * *',

      source_map_support: true,
      combine_logs: false,

      // CRITICAL: Disable wait_ready to prevent PM2 kill/restart loops on heavy startup
      wait_ready: false,

      treekill: true
    }
  ]
};
