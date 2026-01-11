const { db } = require('../db/database');

class YouTubeBroadcastSettings {
  /**
   * Create or update broadcast settings
   * @param {Object} data - Settings data
   * @returns {Promise<Object>}
   */
  static async upsert(data) {
    const {
      broadcastId,
      userId,
      accountId = null,
      enableAutoStart = true,
      enableAutoStop = true,
      unlistReplayOnEnd = true,
      originalPrivacyStatus = 'public'
    } = data;

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO youtube_broadcast_settings 
         (broadcast_id, user_id, account_id, enable_auto_start, enable_auto_stop, unlist_replay_on_end, original_privacy_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(broadcast_id) DO UPDATE SET
           enable_auto_start = excluded.enable_auto_start,
           enable_auto_stop = excluded.enable_auto_stop,
           unlist_replay_on_end = excluded.unlist_replay_on_end,
           original_privacy_status = excluded.original_privacy_status`,
        [
          broadcastId,
          userId,
          accountId,
          enableAutoStart ? 1 : 0,
          enableAutoStop ? 1 : 0,
          unlistReplayOnEnd ? 1 : 0,
          originalPrivacyStatus
        ],
        function(err) {
          if (err) {
            console.error('[YouTubeBroadcastSettings.upsert] Error:', err.message);
            return reject(err);
          }
          resolve({
            id: this.lastID,
            broadcastId,
            userId,
            accountId,
            enableAutoStart,
            enableAutoStop,
            unlistReplayOnEnd,
            originalPrivacyStatus
          });
        }
      );
    });
  }

  /**
   * Find settings by broadcast ID
   * @param {string} broadcastId - YouTube broadcast ID
   * @returns {Promise<Object|null>}
   */
  static async findByBroadcastId(broadcastId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM youtube_broadcast_settings WHERE broadcast_id = ?`,
        [broadcastId],
        (err, row) => {
          if (err) {
            console.error('[YouTubeBroadcastSettings.findByBroadcastId] Error:', err.message);
            return reject(err);
          }
          if (row) {
            row.enableAutoStart = row.enable_auto_start === 1;
            row.enableAutoStop = row.enable_auto_stop === 1;
            row.unlistReplayOnEnd = row.unlist_replay_on_end === 1;
            row.originalPrivacyStatus = row.original_privacy_status;
          }
          resolve(row);
        }
      );
    });
  }

  /**
   * Delete settings by broadcast ID
   * @param {string} broadcastId - YouTube broadcast ID
   * @returns {Promise<boolean>}
   */
  static async deleteByBroadcastId(broadcastId) {
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM youtube_broadcast_settings WHERE broadcast_id = ?`,
        [broadcastId],
        function(err) {
          if (err) {
            console.error('[YouTubeBroadcastSettings.deleteByBroadcastId] Error:', err.message);
            return reject(err);
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Find all settings by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  static async findByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM youtube_broadcast_settings WHERE user_id = ?`,
        [userId],
        (err, rows) => {
          if (err) {
            console.error('[YouTubeBroadcastSettings.findByUserId] Error:', err.message);
            return reject(err);
          }
          const result = rows.map(row => ({
            ...row,
            enableAutoStart: row.enable_auto_start === 1,
            enableAutoStop: row.enable_auto_stop === 1,
            unlistReplayOnEnd: row.unlist_replay_on_end === 1,
            originalPrivacyStatus: row.original_privacy_status
          }));
          resolve(result);
        }
      );
    });
  }
}

module.exports = YouTubeBroadcastSettings;
