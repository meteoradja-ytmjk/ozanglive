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

  // Add stream_duration_hours column to streams table for duration feature
  db.run(`ALTER TABLE streams ADD COLUMN stream_duration_hours INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding stream_duration_hours column:', err.message);
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