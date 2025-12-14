const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'streamflow.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    createTables();
  }
});
function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar_path TEXT,
    gdrive_api_key TEXT,
    user_role TEXT DEFAULT 'admin',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    }
  });
  db.run(`CREATE TABLE IF NOT EXISTS videos (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating videos table:', err.message);
    }
  });
  db.run(`CREATE TABLE IF NOT EXISTS streams (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating streams table:', err.message);
    }
  });
  db.run(`CREATE TABLE IF NOT EXISTS stream_history (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating stream_history table:', err.message);
    }
  });

  // Add schedule_type column to stream_history for recurring stream tracking
  db.run(`ALTER TABLE stream_history ADD COLUMN schedule_type TEXT DEFAULT 'once'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding schedule_type column to stream_history:', err.message);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_shuffle BOOLEAN DEFAULT 0,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating playlists table:', err.message);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS playlist_videos (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Error creating playlist_videos table:', err.message);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS audios (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating audios table:', err.message);
    }
  });
  
  db.run(`ALTER TABLE users ADD COLUMN user_role TEXT DEFAULT 'admin'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding user_role column:', err.message);
    }
  });
  
  db.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding status column:', err.message);
    }
  });

  // Add audio_id column to streams table for audio selection feature
  db.run(`ALTER TABLE streams ADD COLUMN audio_id TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding audio_id column:', err.message);
    }
  });

  // Add stream_duration_hours column to streams table for duration feature (deprecated)
  db.run(`ALTER TABLE streams ADD COLUMN stream_duration_hours INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding stream_duration_hours column:', err.message);
    }
  });

  // Add stream_duration_minutes column to streams table for duration feature (new format)
  db.run(`ALTER TABLE streams ADD COLUMN stream_duration_minutes INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding stream_duration_minutes column:', err.message);
    }
  });

  // Migrate existing data from stream_duration_hours to stream_duration_minutes
  db.run(`UPDATE streams SET stream_duration_minutes = stream_duration_hours * 60 
          WHERE stream_duration_hours IS NOT NULL AND stream_duration_minutes IS NULL`, (err) => {
    if (err) {
      console.error('Error migrating stream_duration_hours to stream_duration_minutes:', err.message);
    }
  });

  // Add recurring schedule columns to streams table
  db.run(`ALTER TABLE streams ADD COLUMN schedule_type TEXT DEFAULT 'once'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding schedule_type column:', err.message);
    }
  });

  db.run(`ALTER TABLE streams ADD COLUMN schedule_days TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding schedule_days column:', err.message);
    }
  });

  db.run(`ALTER TABLE streams ADD COLUMN recurring_time TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding recurring_time column:', err.message);
    }
  });

  db.run(`ALTER TABLE streams ADD COLUMN recurring_enabled INTEGER DEFAULT 1`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding recurring_enabled column:', err.message);
    }
  });

  // Add original_settings column to streams table for reset functionality
  db.run(`ALTER TABLE streams ADD COLUMN original_settings TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding original_settings column:', err.message);
    }
  });

  // Create system_settings table for global configuration
  db.run(`CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating system_settings table:', err.message);
    }
  });

  // Add live_limit column to users table for custom live streaming limit per user
  db.run(`ALTER TABLE users ADD COLUMN live_limit INTEGER DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding live_limit column:', err.message);
    }
  });

  // Add permission columns to users table for member permission control
  db.run(`ALTER TABLE users ADD COLUMN can_view_videos INTEGER DEFAULT 1`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding can_view_videos column:', err.message);
    }
  });

  db.run(`ALTER TABLE users ADD COLUMN can_download_videos INTEGER DEFAULT 1`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding can_download_videos column:', err.message);
    }
  });

  db.run(`ALTER TABLE users ADD COLUMN can_delete_videos INTEGER DEFAULT 1`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding can_delete_videos column:', err.message);
    }
  });

  // Create stream_templates table for reusable stream configurations
  db.run(`CREATE TABLE IF NOT EXISTS stream_templates (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating stream_templates table:', err.message);
    }
  });

  // Create unique index on user_id and name for stream_templates
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_templates_user_name 
          ON stream_templates(user_id, name)`, (err) => {
    if (err) {
      console.error('Error creating unique index on stream_templates:', err.message);
    }
  });

  // Create youtube_credentials table for YouTube Sync feature (supports multiple accounts per user)
  db.run(`CREATE TABLE IF NOT EXISTS youtube_credentials (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating youtube_credentials table:', err.message);
    }
  });

  // Add is_primary column to youtube_credentials for multiple accounts support
  db.run(`ALTER TABLE youtube_credentials ADD COLUMN is_primary INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding is_primary column to youtube_credentials:', err.message);
    }
  });

  // Migration: Set existing single accounts as primary
  db.run(`UPDATE youtube_credentials SET is_primary = 1 WHERE is_primary = 0 AND id IN (
    SELECT MIN(id) FROM youtube_credentials GROUP BY user_id
  )`, (err) => {
    if (err) {
      console.error('Error setting primary accounts:', err.message);
    }
  });

  // Migration: Remove old UNIQUE constraint on user_id and add new one on (user_id, channel_id)
  // This is done by checking if the old constraint exists and recreating the table if needed
  migrateYouTubeCredentialsTable();
}

/**
 * Migrate youtube_credentials table to support multiple accounts per user
 * This removes the UNIQUE constraint on user_id and adds UNIQUE on (user_id, channel_id)
 */
function migrateYouTubeCredentialsTable() {
  // Check if migration is needed by trying to insert a test record
  db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='youtube_credentials'`, (err, row) => {
    if (err || !row) return;
    
    // Check if old schema has UNIQUE on user_id only (not combined with channel_id)
    const sql = row.sql;
    if (sql.includes('user_id TEXT NOT NULL UNIQUE') && !sql.includes('UNIQUE(user_id, channel_id)')) {
      console.log('Migrating youtube_credentials table for multiple accounts support...');
      
      db.serialize(() => {
        // Create new table with updated schema
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
        )`, (err) => {
          if (err) {
            console.error('Error creating new youtube_credentials table:', err.message);
            return;
          }
        });

        // Copy existing data and set as primary
        db.run(`INSERT INTO youtube_credentials_new 
          (id, user_id, client_id, client_secret, refresh_token, channel_name, channel_id, is_primary, created_at)
          SELECT id, user_id, client_id, client_secret, refresh_token, channel_name, channel_id, 1, created_at
          FROM youtube_credentials`, (err) => {
          if (err) {
            console.error('Error copying data to new youtube_credentials table:', err.message);
            return;
          }
        });

        // Drop old table
        db.run(`DROP TABLE youtube_credentials`, (err) => {
          if (err) {
            console.error('Error dropping old youtube_credentials table:', err.message);
            return;
          }
        });

        // Rename new table
        db.run(`ALTER TABLE youtube_credentials_new RENAME TO youtube_credentials`, (err) => {
          if (err) {
            console.error('Error renaming youtube_credentials table:', err.message);
            return;
          }
          console.log('Successfully migrated youtube_credentials table for multiple accounts support');
        });
      });
    }
  });
}
function checkIfUsersExist() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM users', [], (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result.count > 0);
    });
  });
}
module.exports = {
  db,
  checkIfUsersExist
};