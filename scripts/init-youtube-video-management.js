/**
 * Initialize YouTube Video Management Tables
 * Creates tables for storing YouTube videos and scheduled tasks
 */

const { db } = require('../db/database');

async function initYouTubeVideoManagement() {
  return new Promise((resolve, reject) => {
    console.log('[Init] Creating YouTube video management tables...');

    db.serialize(() => {
      // Create youtube_videos table
      db.run(`
        CREATE TABLE IF NOT EXISTS youtube_videos (
          video_id TEXT NOT NULL,
          account_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          privacy_status TEXT NOT NULL,
          published_at TEXT,
          duration INTEGER DEFAULT 0,
          view_count INTEGER DEFAULT 0,
          like_count INTEGER DEFAULT 0,
          comment_count INTEGER DEFAULT 0,
          thumbnail_url TEXT,
          category_id TEXT DEFAULT '22',
          tags TEXT,
          synced_at TEXT,
          PRIMARY KEY (video_id, account_id),
          FOREIGN KEY (account_id) REFERENCES youtube_credentials(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('[Init] Error creating youtube_videos table:', err.message);
          return reject(err);
        }
        console.log('[Init] ✓ youtube_videos table created');
      });

      // Create youtube_scheduled_tasks table
      db.run(`
        CREATE TABLE IF NOT EXISTS youtube_scheduled_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id TEXT NOT NULL,
          account_id INTEGER NOT NULL,
          task_type TEXT NOT NULL,
          scheduled_time TEXT NOT NULL,
          task_data TEXT,
          status TEXT DEFAULT 'pending',
          executed_at TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (account_id) REFERENCES youtube_credentials(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('[Init] Error creating youtube_scheduled_tasks table:', err.message);
          return reject(err);
        }
        console.log('[Init] ✓ youtube_scheduled_tasks table created');
      });

      // Create indexes for better performance
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_youtube_videos_account 
        ON youtube_videos(account_id)
      `, (err) => {
        if (err) {
          console.error('[Init] Error creating index:', err.message);
        } else {
          console.log('[Init] ✓ Index idx_youtube_videos_account created');
        }
      });

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_youtube_videos_privacy 
        ON youtube_videos(privacy_status)
      `, (err) => {
        if (err) {
          console.error('[Init] Error creating index:', err.message);
        } else {
          console.log('[Init] ✓ Index idx_youtube_videos_privacy created');
        }
      });

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_youtube_tasks_status 
        ON youtube_scheduled_tasks(status, scheduled_time)
      `, (err) => {
        if (err) {
          console.error('[Init] Error creating index:', err.message);
          return reject(err);
        }
        console.log('[Init] ✓ Index idx_youtube_tasks_status created');
        console.log('[Init] YouTube video management tables initialized successfully!');
        resolve();
      });
    });
  });
}

// Run if called directly
if (require.main === module) {
  initYouTubeVideoManagement()
    .then(() => {
      console.log('[Init] Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Init] Failed:', error);
      process.exit(1);
    });
}

module.exports = { initYouTubeVideoManagement };
