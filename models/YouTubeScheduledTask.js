const { db } = require('../db/database');

/**
 * YouTubeScheduledTask Model
 * Manages scheduled tasks for YouTube videos (privacy changes, metadata updates)
 */
class YouTubeScheduledTask {
  /**
   * Create a scheduled task
   * @param {Object} data - Task data
   * @returns {Promise<Object>}
   */
  static async create(data) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      db.run(
        `INSERT INTO youtube_scheduled_tasks (
          video_id, account_id, task_type, scheduled_time,
          task_data, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.video_id,
          data.account_id,
          data.task_type,
          data.scheduled_time,
          JSON.stringify(data.task_data || {}),
          'pending',
          now
        ],
        function (err) {
          if (err) {
            console.error('[YouTubeScheduledTask.create] Error:', err.message);
            return reject(err);
          }
          resolve({ id: this.lastID, ...data, status: 'pending', created_at: now });
        }
      );
    });
  }

  /**
   * Find pending tasks that are due
   * @returns {Promise<Array>}
   */
  static async findDueTasks() {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      db.all(
        `SELECT * FROM youtube_scheduled_tasks 
         WHERE status = 'pending' AND scheduled_time <= ?
         ORDER BY scheduled_time ASC`,
        [now],
        (err, rows) => {
          if (err) {
            console.error('[YouTubeScheduledTask.findDueTasks] Error:', err.message);
            return reject(err);
          }
          
          const tasks = (rows || []).map(row => ({
            ...row,
            task_data: row.task_data ? JSON.parse(row.task_data) : {}
          }));
          
          resolve(tasks);
        }
      );
    });
  }

  /**
   * Find tasks by video and account
   * @param {string} videoId - YouTube video ID
   * @param {number} accountId - YouTube account ID
   * @returns {Promise<Array>}
   */
  static async findByVideo(videoId, accountId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM youtube_scheduled_tasks 
         WHERE video_id = ? AND account_id = ?
         ORDER BY scheduled_time DESC`,
        [videoId, accountId],
        (err, rows) => {
          if (err) {
            console.error('[YouTubeScheduledTask.findByVideo] Error:', err.message);
            return reject(err);
          }
          
          const tasks = (rows || []).map(row => ({
            ...row,
            task_data: row.task_data ? JSON.parse(row.task_data) : {}
          }));
          
          resolve(tasks);
        }
      );
    });
  }

  /**
   * Update task status
   * @param {number} id - Task ID
   * @param {string} status - New status (pending, completed, failed)
   * @param {string} error - Error message if failed
   * @returns {Promise<boolean>}
   */
  static async updateStatus(id, status, error = null) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      db.run(
        `UPDATE youtube_scheduled_tasks 
         SET status = ?, executed_at = ?, error = ?
         WHERE id = ?`,
        [status, now, error, id],
        function (err) {
          if (err) {
            console.error('[YouTubeScheduledTask.updateStatus] Error:', err.message);
            return reject(err);
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Delete task
   * @param {number} id - Task ID
   * @returns {Promise<boolean>}
   */
  static async delete(id) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM youtube_scheduled_tasks WHERE id = ?',
        [id],
        function (err) {
          if (err) {
            console.error('[YouTubeScheduledTask.delete] Error:', err.message);
            return reject(err);
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Delete all tasks for a video
   * @param {string} videoId - YouTube video ID
   * @param {number} accountId - YouTube account ID
   * @returns {Promise<boolean>}
   */
  static async deleteByVideo(videoId, accountId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM youtube_scheduled_tasks WHERE video_id = ? AND account_id = ?',
        [videoId, accountId],
        function (err) {
          if (err) {
            console.error('[YouTubeScheduledTask.deleteByVideo] Error:', err.message);
            return reject(err);
          }
          resolve(this.changes > 0);
        }
      );
    });
  }
}

module.exports = YouTubeScheduledTask;
