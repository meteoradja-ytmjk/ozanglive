const { db } = require('../db/database');

/**
 * YouTubeVideo Model
 * Manages YouTube videos from channel for bulk editing and scheduling
 */
class YouTubeVideo {
  /**
   * Create or update a YouTube video record
   * @param {Object} data - Video data
   * @returns {Promise<Object>}
   */
  static async upsert(data) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      db.run(
        `INSERT INTO youtube_videos (
          video_id, account_id, title, description, privacy_status,
          published_at, duration, view_count, like_count, comment_count,
          thumbnail_url, category_id, tags, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(video_id, account_id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          privacy_status = excluded.privacy_status,
          published_at = excluded.published_at,
          duration = excluded.duration,
          view_count = excluded.view_count,
          like_count = excluded.like_count,
          comment_count = excluded.comment_count,
          thumbnail_url = excluded.thumbnail_url,
          category_id = excluded.category_id,
          tags = excluded.tags,
          synced_at = excluded.synced_at`,
        [
          data.video_id,
          data.account_id,
          data.title,
          data.description || '',
          data.privacy_status,
          data.published_at,
          data.duration || 0,
          data.view_count || 0,
          data.like_count || 0,
          data.comment_count || 0,
          data.thumbnail_url || '',
          data.category_id || '22',
          JSON.stringify(data.tags || []),
          now
        ],
        function (err) {
          if (err) {
            console.error('[YouTubeVideo.upsert] Error:', err.message);
            return reject(err);
          }
          resolve({ video_id: data.video_id, account_id: data.account_id, ...data });
        }
      );
    });
  }

  /**
   * Find videos by account ID
   * @param {number} accountId - YouTube account ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  static async findByAccount(accountId, options = {}) {
    return new Promise((resolve, reject) => {
      const { limit = 50, offset = 0, privacy = null, search = null } = options;
      
      let query = 'SELECT * FROM youtube_videos WHERE account_id = ?';
      const params = [accountId];
      
      if (privacy) {
        query += ' AND privacy_status = ?';
        params.push(privacy);
      }
      
      if (search) {
        query += ' AND (title LIKE ? OR description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      
      query += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('[YouTubeVideo.findByAccount] Error:', err.message);
          return reject(err);
        }
        
        // Parse tags JSON
        const videos = (rows || []).map(row => ({
          ...row,
          tags: row.tags ? JSON.parse(row.tags) : []
        }));
        
        resolve(videos);
      });
    });
  }

  /**
   * Find video by ID and account
   * @param {string} videoId - YouTube video ID
   * @param {number} accountId - YouTube account ID
   * @returns {Promise<Object|null>}
   */
  static async findById(videoId, accountId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM youtube_videos WHERE video_id = ? AND account_id = ?',
        [videoId, accountId],
        (err, row) => {
          if (err) {
            console.error('[YouTubeVideo.findById] Error:', err.message);
            return reject(err);
          }
          
          if (row) {
            row.tags = row.tags ? JSON.parse(row.tags) : [];
          }
          
          resolve(row || null);
        }
      );
    });
  }

  /**
   * Delete video record
   * @param {string} videoId - YouTube video ID
   * @param {number} accountId - YouTube account ID
   * @returns {Promise<boolean>}
   */
  static async delete(videoId, accountId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM youtube_videos WHERE video_id = ? AND account_id = ?',
        [videoId, accountId],
        function (err) {
          if (err) {
            console.error('[YouTubeVideo.delete] Error:', err.message);
            return reject(err);
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Get video count by account
   * @param {number} accountId - YouTube account ID
   * @returns {Promise<number>}
   */
  static async countByAccount(accountId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM youtube_videos WHERE account_id = ?',
        [accountId],
        (err, row) => {
          if (err) {
            console.error('[YouTubeVideo.countByAccount] Error:', err.message);
            return reject(err);
          }
          resolve(row?.count || 0);
        }
      );
    });
  }
}

module.exports = YouTubeVideo;
