const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'streamflow.db');

// Track database initialization state
let dbInitialized = false;
let dbInitPromise = null;
let dbInitError = null;

// Required tables that must exist before app can start
const REQUIRED_TABLES = [
  'users', 'videos', 'streams', 'stream_history',
  'playlists', 'playlist_videos', 'audios',
  'system_settings', 'stream_templates', 'youtube_credentials'
];

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
    dbInitError = err;
  } else {
    // Optimize SQLite for better performance
    db.run('PRAGMA journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    db.run('PRAGMA synchronous = NORMAL'); // Faster writes, still safe
    db.run('PRAGMA cache_size = 10000'); // Increase cache
    db.run('PRAGMA temp_store = MEMORY'); // Store temp tables in memory
    db.run('PRAGMA busy_timeout = 30000'); // Wait 30 seconds if database is locked
    
    dbInitPromise = createTables();
  }
});

/**
 * Wait for database to be fully initialized
 * Throws error if initialization failed
 * @returns {Promise<void>}
 */
async function waitForDbInit() {
  if (dbInitError) {
    throw new Error(`Database connection failed: ${dbInitError.message}`);
  }
  if (dbInitialized) return;
  if (dbInitPromise) {
    await dbInitPromise;
  }
  // Double-check initialization succeeded
  if (dbInitError) {
    throw new Error(`Database initialization failed: ${dbInitError.message}`);
  }
}

/**
 * Verify all required tables exist in the database
 * @returns {Promise<{success: boolean, missingTables: string[]}>}
 */
async function verifyTables() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT name FROM sqlite_master WHERE type='table'`,
      [],
      (err, rows) => {
        if (err) {
          console.error('Error verifying tables:', err.message);
          return reject(err);
        }
        const existingTables = rows.map(r => r.name);
        const missingTables = REQUIRED_TABLES.filter(t => !existingTables.includes(t));
        
        if (missingTables.length > 0) {
          console.warn(`[Database] Missing tables: ${missingTables.join(', ')}`);
        } else {
          console.log('[Database] All required tables verified');
        }
        
        resolve({
          success: missingTables.length === 0,
          missingTables,
          existingTables
        });
      }
    );
  });
}

/**
 * Run a single table creation query and return a promise
 * @param {string} sql - SQL query to run
 * @param {string} tableName - Name of table for logging
 * @returns {Promise<void>}
 */
function runTableQuery(sql, tableName) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        // Ignore "duplicate column" errors for ALTER TABLE
        if (err.message && err.message.includes('duplicate column name')) {
          resolve();
          return;
        }
        console.error(`Error with ${tableName}:`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function createTables() {
  try {
    // Create all tables sequentially to ensure proper order
    await createCoreTablesAsync();
    
    // Verify all tables were created
    const verification = await verifyTables();
    if (!verification.success) {
      console.error('[Database] Some tables failed to create:', verification.missingTables);
      // Don't throw - some tables might be created by migrations
    }
    
    dbInitialized = true;
    console.log('[Database] Database tables initialized successfully');
  } catch (error) {
    console.error('[Database] Failed to initialize database:', error.message);
    dbInitError = error;
    throw error;
  }
}

/**
 * Create all core tables asynchronously with proper error handling
 */
async function createCoreTablesAsync() {
  // Create tables in order of dependencies
  await runTableQuery(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar_path TEXT,
    gdrive_api_key TEXT,
    user_role TEXT DEFAULT 'admin',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, 'users');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    filepath TEXT NOT NULL,
    thumbnail_path TEXT,
    file_size INTEGER,
    duration REAL,
    format TEXT,
    resolution TEXT,
    bitrate INTEGER,
    fps TEXT,
    user_id TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`, 'videos');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    video_id TEXT,
    rtmp_url TEXT NOT NULL,
    stream_key TEXT NOT NULL,
    platform TEXT,
    platform_icon TEXT,
    bitrate INTEGER DEFAULT 2500,
    resolution TEXT,
    fps INTEGER DEFAULT 30,
    orientation TEXT DEFAULT 'horizontal',
    loop_video BOOLEAN DEFAULT 1,
    schedule_time TIMESTAMP,
    duration INTEGER,
    status TEXT DEFAULT 'offline',
    status_updated_at TIMESTAMP,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    use_advanced_settings BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (video_id) REFERENCES videos(id)
  )`, 'streams');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS stream_history (
    id TEXT PRIMARY KEY,
    stream_id TEXT,
    title TEXT NOT NULL,
    platform TEXT,
    platform_icon TEXT,
    video_id TEXT,
    video_title TEXT,
    resolution TEXT,
    bitrate INTEGER,
    fps INTEGER,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER,
    use_advanced_settings BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (stream_id) REFERENCES streams(id),
    FOREIGN KEY (video_id) REFERENCES videos(id)
  )`, 'stream_history');

  // Add schedule_type column to stream_history
  await runTableQuery(`ALTER TABLE stream_history ADD COLUMN schedule_type TEXT DEFAULT 'once'`, 'stream_history.schedule_type');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_shuffle BOOLEAN DEFAULT 0,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`, 'playlists');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS playlist_videos (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  )`, 'playlist_videos');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS audios (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    filepath TEXT NOT NULL,
    file_size INTEGER,
    duration REAL,
    format TEXT,
    user_id TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`, 'audios');

  // Add columns to users table
  await runTableQuery(`ALTER TABLE users ADD COLUMN user_role TEXT DEFAULT 'admin'`, 'users.user_role');
  await runTableQuery(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`, 'users.status');
  await runTableQuery(`ALTER TABLE users ADD COLUMN live_limit INTEGER DEFAULT NULL`, 'users.live_limit');
  await runTableQuery(`ALTER TABLE users ADD COLUMN can_view_videos INTEGER DEFAULT 1`, 'users.can_view_videos');
  await runTableQuery(`ALTER TABLE users ADD COLUMN can_download_videos INTEGER DEFAULT 1`, 'users.can_download_videos');
  await runTableQuery(`ALTER TABLE users ADD COLUMN can_delete_videos INTEGER DEFAULT 1`, 'users.can_delete_videos');

  // Add columns to streams table
  await runTableQuery(`ALTER TABLE streams ADD COLUMN audio_id TEXT`, 'streams.audio_id');
  await runTableQuery(`ALTER TABLE streams ADD COLUMN stream_duration_hours INTEGER`, 'streams.stream_duration_hours');
  await runTableQuery(`ALTER TABLE streams ADD COLUMN stream_duration_minutes INTEGER`, 'streams.stream_duration_minutes');
  await runTableQuery(`ALTER TABLE streams ADD COLUMN schedule_type TEXT DEFAULT 'once'`, 'streams.schedule_type');
  await runTableQuery(`ALTER TABLE streams ADD COLUMN schedule_days TEXT`, 'streams.schedule_days');
  await runTableQuery(`ALTER TABLE streams ADD COLUMN recurring_time TEXT`, 'streams.recurring_time');
  await runTableQuery(`ALTER TABLE streams ADD COLUMN recurring_enabled INTEGER DEFAULT 1`, 'streams.recurring_enabled');
  await runTableQuery(`ALTER TABLE streams ADD COLUMN original_settings TEXT`, 'streams.original_settings');

  // Migrate stream_duration_hours to stream_duration_minutes
  await runTableQuery(`UPDATE streams SET stream_duration_minutes = stream_duration_hours * 60 
          WHERE stream_duration_hours IS NOT NULL AND stream_duration_minutes IS NULL`, 'streams.duration_migration');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, 'system_settings');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS stream_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    video_id TEXT,
    audio_id TEXT,
    duration_hours INTEGER DEFAULT 0,
    duration_minutes INTEGER DEFAULT 0,
    loop_video INTEGER DEFAULT 1,
    schedule_type TEXT DEFAULT 'once',
    recurring_time TEXT,
    schedule_days TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`, 'stream_templates');

  await runTableQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_templates_user_name 
          ON stream_templates(user_id, name)`, 'stream_templates.index');

  await runTableQuery(`CREATE TABLE IF NOT EXISTS youtube_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    channel_name TEXT,
    channel_id TEXT,
    is_primary INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, channel_id)
  )`, 'youtube_credentials');

  await runTableQuery(`ALTER TABLE youtube_credentials ADD COLUMN is_primary INTEGER DEFAULT 0`, 'youtube_credentials.is_primary');

  // Set existing single accounts as primary
  await runTableQuery(`UPDATE youtube_credentials SET is_primary = 1 WHERE is_primary = 0 AND id IN (
    SELECT MIN(id) FROM youtube_credentials GROUP BY user_id
  )`, 'youtube_credentials.primary_migration');

  // Run migration for youtube_credentials table if needed
  await migrateYouTubeCredentialsTableAsync();
}

// Old createCoreTables function removed - replaced with createCoreTablesAsync above

/**
 * Migrate youtube_credentials table to support multiple accounts per user (async version)
 * This removes the UNIQUE constraint on user_id and adds UNIQUE on (user_id, channel_id)
 * @returns {Promise<void>}
 */
async function migrateYouTubeCredentialsTableAsync() {
  return new Promise((resolve) => {
    db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='youtube_credentials'`, (err, row) => {
      if (err || !row) {
        resolve();
        return;
      }
      
      const sql = row.sql;
      if (sql.includes('user_id TEXT NOT NULL UNIQUE') && !sql.includes('UNIQUE(user_id, channel_id)')) {
        console.log('[Database] Migrating youtube_credentials table for multiple accounts support...');
        
        db.serialize(() => {
          db.run(`CREATE TABLE IF NOT EXISTS youtube_credentials_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            client_id TEXT NOT NULL,
            client_secret TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            channel_name TEXT,
            channel_id TEXT,
            is_primary INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, channel_id)
          )`);

          db.run(`INSERT OR IGNORE INTO youtube_credentials_new 
            (id, user_id, client_id, client_secret, refresh_token, channel_name, channel_id, is_primary, created_at)
            SELECT id, user_id, client_id, client_secret, refresh_token, channel_name, channel_id, 1, created_at
            FROM youtube_credentials`);

          db.run(`DROP TABLE IF EXISTS youtube_credentials`);

          db.run(`ALTER TABLE youtube_credentials_new RENAME TO youtube_credentials`, (err) => {
            if (err) {
              console.error('[Database] Error renaming youtube_credentials table:', err.message);
            } else {
              console.log('[Database] Successfully migrated youtube_credentials table');
            }
            resolve();
          });
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Close database connection gracefully
 * @returns {Promise<void>}
 */
function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        console.error('[Database] Error closing database:', err.message);
        reject(err);
      } else {
        console.log('[Database] Database connection closed');
        resolve();
      }
    });
  });
}

/**
 * Check database connectivity
 * @returns {Promise<{connected: boolean, latency: number}>}
 */
async function checkConnectivity() {
  const startTime = Date.now();
  return new Promise((resolve) => {
    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      resolve({ connected: false, latency: 5000, error: 'Database query timeout' });
    }, 5000);
    
    db.get('SELECT 1 as test', [], (err) => {
      clearTimeout(timeout);
      const latency = Date.now() - startTime;
      if (err) {
        resolve({ connected: false, latency, error: err.message });
      } else {
        resolve({ connected: true, latency });
      }
    });
  });
}

/**
 * Safe database query wrapper with timeout and error handling
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {number} timeoutMs - Timeout in milliseconds (default 30s)
 * @returns {Promise<any>}
 */
function safeDbQuery(sql, params = [], timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Database query timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    db.all(sql, params, (err, rows) => {
      clearTimeout(timeout);
      if (err) {
        console.error('[Database] Query error:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Safe database run wrapper with timeout and error handling
 * @param {string} sql - SQL statement
 * @param {Array} params - Query parameters
 * @param {number} timeoutMs - Timeout in milliseconds (default 30s)
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function safeDbRun(sql, params = [], timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Database run timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    db.run(sql, params, function(err) {
      clearTimeout(timeout);
      if (err) {
        console.error('[Database] Run error:', err.message);
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}
function checkIfUsersExist() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM users', [], (err, result) => {
      if (err) {
        console.error('[Database] Error checking users:', err.message);
        reject(err);
        return;
      }
      resolve(result.count > 0);
    });
  });
}

module.exports = {
  db,
  checkIfUsersExist,
  waitForDbInit,
  verifyTables,
  checkConnectivity,
  closeDatabase,
  safeDbQuery,
  safeDbRun,
  isDbInitialized: () => dbInitialized,
  getInitError: () => dbInitError,
  REQUIRED_TABLES
};