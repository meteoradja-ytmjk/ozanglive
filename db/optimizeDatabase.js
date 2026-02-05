/**
 * Database Optimization Script
 * Menambahkan index dan optimasi untuk query yang sering digunakan
 */

const { db } = require('./database');

/**
 * Buat index untuk mempercepat query
 */
async function createIndexes() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('[DB Optimize] Creating indexes...');

      // Index untuk users table
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`, (err) => {
        if (err) console.error('Error creating idx_users_username:', err);
        else console.log('[DB Optimize] ✓ idx_users_username created');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`, (err) => {
        if (err) console.error('Error creating idx_users_status:', err);
        else console.log('[DB Optimize] ✓ idx_users_status created');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(user_role)`, (err) => {
        if (err) console.error('Error creating idx_users_role:', err);
        else console.log('[DB Optimize] ✓ idx_users_role created');
      });

      // Index untuk videos table
      db.run(`CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id)`, (err) => {
        if (err) console.error('Error creating idx_videos_user_id:', err);
        else console.log('[DB Optimize] ✓ idx_videos_user_id created');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC)`, (err) => {
        if (err) console.error('Error creating idx_videos_created_at:', err);
        else console.log('[DB Optimize] ✓ idx_videos_created_at created');
      });

      // Index untuk audios table
      db.run(`CREATE INDEX IF NOT EXISTS idx_audios_user_id ON audios(user_id)`, (err) => {
        if (err) console.error('Error creating idx_audios_user_id:', err);
        else console.log('[DB Optimize] ✓ idx_audios_user_id created');
      });

      // Index untuk streams table
      db.run(`CREATE INDEX IF NOT EXISTS idx_streams_user_id ON streams(user_id)`, (err) => {
        if (err) console.error('Error creating idx_streams_user_id:', err);
        else console.log('[DB Optimize] ✓ idx_streams_user_id created');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status)`, (err) => {
        if (err) console.error('Error creating idx_streams_status:', err);
        else console.log('[DB Optimize] ✓ idx_streams_status created');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_streams_schedule_type ON streams(schedule_type)`, (err) => {
        if (err) console.error('Error creating idx_streams_schedule_type:', err);
        else console.log('[DB Optimize] ✓ idx_streams_schedule_type created');
      });

      // Index untuk stream_history table
      db.run(`CREATE INDEX IF NOT EXISTS idx_history_user_id ON stream_history(user_id)`, (err) => {
        if (err) console.error('Error creating idx_history_user_id:', err);
        else console.log('[DB Optimize] ✓ idx_history_user_id created');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_history_start_time ON stream_history(start_time DESC)`, (err) => {
        if (err) console.error('Error creating idx_history_start_time:', err);
        else console.log('[DB Optimize] ✓ idx_history_start_time created');
      });

      // Index untuk playlists table
      db.run(`CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id)`, (err) => {
        if (err) console.error('Error creating idx_playlists_user_id:', err);
        else console.log('[DB Optimize] ✓ idx_playlists_user_id created');
      });

      // Index untuk youtube_credentials table
      db.run(`CREATE INDEX IF NOT EXISTS idx_youtube_creds_user_id ON youtube_credentials(user_id)`, (err) => {
        if (err) console.error('Error creating idx_youtube_creds_user_id:', err);
        else console.log('[DB Optimize] ✓ idx_youtube_creds_user_id created');
      });

      console.log('[DB Optimize] All indexes created successfully');
      resolve();
    });
  });
}

/**
 * Optimize database dengan VACUUM dan ANALYZE
 */
async function optimizeDatabase() {
  return new Promise((resolve, reject) => {
    console.log('[DB Optimize] Running VACUUM...');
    db.run('VACUUM', (err) => {
      if (err) {
        console.error('[DB Optimize] VACUUM error:', err);
        return reject(err);
      }
      
      console.log('[DB Optimize] ✓ VACUUM completed');
      console.log('[DB Optimize] Running ANALYZE...');
      
      db.run('ANALYZE', (err) => {
        if (err) {
          console.error('[DB Optimize] ANALYZE error:', err);
          return reject(err);
        }
        
        console.log('[DB Optimize] ✓ ANALYZE completed');
        resolve();
      });
    });
  });
}

/**
 * Set SQLite pragmas untuk performa optimal
 */
async function setPragmas() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('[DB Optimize] Setting pragmas...');

      // Journal mode WAL untuk performa write yang lebih baik
      db.run('PRAGMA journal_mode = WAL', (err) => {
        if (err) console.error('Error setting journal_mode:', err);
        else console.log('[DB Optimize] ✓ journal_mode = WAL');
      });

      // Synchronous NORMAL untuk balance antara performa dan safety
      db.run('PRAGMA synchronous = NORMAL', (err) => {
        if (err) console.error('Error setting synchronous:', err);
        else console.log('[DB Optimize] ✓ synchronous = NORMAL');
      });

      // Cache size 10MB
      db.run('PRAGMA cache_size = -10000', (err) => {
        if (err) console.error('Error setting cache_size:', err);
        else console.log('[DB Optimize] ✓ cache_size = 10MB');
      });

      // Temp store in memory
      db.run('PRAGMA temp_store = MEMORY', (err) => {
        if (err) console.error('Error setting temp_store:', err);
        else console.log('[DB Optimize] ✓ temp_store = MEMORY');
      });

      // Mmap size 30MB
      db.run('PRAGMA mmap_size = 30000000', (err) => {
        if (err) console.error('Error setting mmap_size:', err);
        else console.log('[DB Optimize] ✓ mmap_size = 30MB');
      });

      console.log('[DB Optimize] All pragmas set successfully');
      resolve();
    });
  });
}

/**
 * Run semua optimasi
 */
async function runOptimizations() {
  try {
    console.log('[DB Optimize] Starting database optimization...');
    
    await setPragmas();
    await createIndexes();
    await optimizeDatabase();
    
    console.log('[DB Optimize] ✅ Database optimization completed successfully');
    return true;
  } catch (error) {
    console.error('[DB Optimize] ❌ Optimization failed:', error);
    return false;
  }
}

// Auto-run jika dipanggil langsung
if (require.main === module) {
  runOptimizations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  createIndexes,
  optimizeDatabase,
  setPragmas,
  runOptimizations
};
