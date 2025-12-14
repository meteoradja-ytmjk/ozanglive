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
      
      // Auto-restart configuration
      autorestart: true,
      watch: false, // Don't watch for file changes in production
      max_restarts: 10, // Maximum restarts within min_uptime
      min_uptime: '10s', // Minimum uptime to consider app started
      restart_delay: 4000, // Wait 4 seconds before restarting
      
      // Memory management
      max_memory_restart: '1G', // Restart if memory exceeds 1GB
      
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
      
      // Graceful shutdown
      kill_timeout: 30000, // Wait 30 seconds for graceful shutdown
      listen_timeout: 10000, // Wait 10 seconds for app to listen
      
      // Crash handling
      exp_backoff_restart_delay: 100, // Exponential backoff for restarts
      
      // Node.js arguments
      node_args: [
        '--max-old-space-size=1024', // Limit heap to 1GB
        '--expose-gc' // Allow manual garbage collection
      ],
      
      // Cron restart (optional - restart every day at 4 AM)
      // cron_restart: '0 4 * * *',
      
      // Source map support for better error traces
      source_map_support: true
    }
  ]
};
