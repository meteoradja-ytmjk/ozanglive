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
 *   Stop app:    pm2 stop streamflow
 *   Restart:     pm2 restart streamflow
 *   View logs:   pm2 logs streamflow
 *   Monitor:     pm2 monit
 *   Status:      pm2 status
 *   
 * Auto-start on system boot:
 *   pm2 startup
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: 'streamflow',
      script: 'app.js',
      
      // Instance configuration
      instances: 1, // Single instance (streaming apps shouldn't use cluster mode)
      exec_mode: 'fork', // Fork mode for single instance
      
      // Auto-restart configuration - MORE AGGRESSIVE
      autorestart: true,
      watch: false, // Don't watch for file changes in production
      max_restarts: 50, // Allow more restarts (was 10)
      min_uptime: '5s', // Faster detection (was 10s)
      restart_delay: 2000, // Faster restart (was 4000)
      
      // Memory management - MORE TOLERANT for 1GB VPS
      max_memory_restart: '800M', // INCREASED: Restart at 800MB (was 600M) - give more room before restart
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 7575
      },
      
      env_development: {
        NODE_ENV: 'development',
        PORT: 7575
      },
      
      // Logging
      log_file: './logs/pm2-combined.log',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Graceful shutdown - FASTER
      kill_timeout: 15000, // 15 seconds (was 30)
      listen_timeout: 8000, // 8 seconds (was 10)
      
      // Crash handling - FASTER RECOVERY
      exp_backoff_restart_delay: 50, // Faster backoff (was 100)
      
      // Node.js arguments - BALANCED for 1GB VPS (not too aggressive)
      node_args: [
        '--max-old-space-size=512', // INCREASED: Allow up to 512MB heap (was 400MB)
        '--expose-gc', // Allow manual garbage collection
        '--optimize-for-size' // Optimize for memory
        // REMOVED: --gc-interval and --max-semi-space-size (too aggressive, can cause issues)
      ],
      
      // Cron restart - ENABLED: restart every day at 4 AM to prevent memory buildup
      cron_restart: '0 4 * * *',
      
      // Source map support for better error traces
      source_map_support: true
    }
  ]
};
